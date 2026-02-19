import { NextResponse } from "next/server";
import { createChatCompletionWithMeta } from "../../../lib/bigmodel";
import { getModelConfig } from "../../../lib/model";

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

type CaseProfile = {
  title?: string;
  riskLevel?: string;
};

type FeedbackJson = {
  client_current_emotion: string;
  client_current_crisis_level: "Low" | "Medium" | "High" | "Imminent";
  counselor_script_options: [string, string] | string[];
};

function transcriptFromMessages(messages: ClientMessage[]) {
  return messages
    .map((item, idx) => {
      const speaker = item.role === "user" ? "Counselor" : "Client";
      return `${idx + 1}. ${speaker}: ${item.content}`;
    })
    .join("\n");
}

function selectRecentMessages(messages: ClientMessage[], keep = 12) {
  if (messages.length <= keep) return messages;
  return messages.slice(messages.length - keep);
}

function limitFeedbackLength(text: string, maxChars = 900) {
  const compact = text.replace(/\n{3,}/g, "\n\n").trim();
  if (compact.length <= maxChars) {
    return compact;
  }
  return `${compact.slice(0, maxChars).trim()}...`;
}

function isLengthError(message: string) {
  return message.includes("finish_reason: length");
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const raw = fenced ? fenced[1].trim() : trimmed;

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("Model returned non-JSON content for feedback.");
  }
}

function normalizeLevel(value: unknown): FeedbackJson["client_current_crisis_level"] {
  const v = String(value || "").toLowerCase();
  if (v.includes("imminent")) return "Imminent";
  if (v.includes("high")) return "High";
  if (v.includes("medium")) return "Medium";
  return "Low";
}

function sanitizeFeedbackJson(payload: unknown): FeedbackJson {
  const data = (payload || {}) as Record<string, unknown>;
  const options = Array.isArray(data.counselor_script_options)
    ? data.counselor_script_options.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 2)
    : [];

  return {
    client_current_emotion: String(data.client_current_emotion || "Not clear").trim().slice(0, 80),
    client_current_crisis_level: normalizeLevel(data.client_current_crisis_level),
    counselor_script_options: options.length
      ? options
      : [
          "I hear you. Can you tell me what feels most overwhelming right now?",
          "To keep you safe, are you having thoughts of harming yourself right now?"
        ]
  };
}

function formatFeedback(data: FeedbackJson) {
  const scripts = data.counselor_script_options;
  return `## Client Current Emotion\n- ${data.client_current_emotion}\n\n## Client Current Crisis Level\n- ${data.client_current_crisis_level}\n\n## Two Suggested Counselor Responses\n1. ${scripts[0] || "N/A"}\n2. ${scripts[1] || "N/A"}`;
}

export async function POST(req: Request) {
  const { apiKey } = getModelConfig();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing BIGMODEL_API_KEY (or OPENAI_API_KEY). Configure .env.local and restart."
      },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json()) as {
      messages?: ClientMessage[];
      caseProfile?: CaseProfile;
    };

    const messages = body?.messages ?? [];
    const caseProfile = body?.caseProfile ?? {};

    if (!Array.isArray(messages) || messages.length < 4) {
      return NextResponse.json(
        { error: "Conversation too short. Complete at least 2 rounds (4 total messages)." },
        { status: 400 }
      );
    }

    const transcript = transcriptFromMessages(selectRecentMessages(messages, 10));
    const compactTranscript = transcriptFromMessages(selectRecentMessages(messages, 6));

    const promptMessages = [
      {
        role: "system" as const,
        content: `
Return ONLY valid JSON:
{
  "client_current_emotion": "short phrase, <=8 words",
  "client_current_crisis_level": "Low | Medium | High | Imminent",
  "counselor_script_options": [
    "copy-ready counselor script 1, <=22 words",
    "copy-ready counselor script 2, <=22 words"
  ]
}
Rules:
- English only.
- No markdown, no extra keys, no explanation text.
`.trim()
      },
      {
        role: "user" as const,
        content: `
Case theme: ${caseProfile.title || "Not provided"}
Risk hint: ${caseProfile.riskLevel || "Not provided"}
Transcript:
${transcript}
`.trim()
      }
    ];

    const compactPromptMessages = [
      {
        role: "system" as const,
        content: `
JSON only. Keys:
client_current_emotion, client_current_crisis_level, counselor_script_options.
Two scripts only. Very short.
`.trim()
      },
      {
        role: "user" as const,
        content: compactTranscript
      }
    ];

    let result: FeedbackJson;
    let finishReason = "unknown";
    let retried = false;
    let attempt = 1;

    try {
      const first = await createChatCompletionWithMeta(promptMessages, {
        temperature: 0.1,
        maxTokens: 1200
      });
      finishReason = first.finishReason;
      result = sanitizeFeedbackJson(extractJson(first.text));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (!isLengthError(message)) {
        throw error;
      }

      retried = true;
      attempt = 2;
      try {
        const second = await createChatCompletionWithMeta(compactPromptMessages, {
          temperature: 0.1,
          maxTokens: 1800
        });
        finishReason = second.finishReason;
        result = sanitizeFeedbackJson(extractJson(second.text));
      } catch (error2) {
        const message2 = error2 instanceof Error ? error2.message : "Unknown error";
        if (!isLengthError(message2)) {
          throw error2;
        }

        attempt = 3;
        const third = await createChatCompletionWithMeta(compactPromptMessages, {
          temperature: 0.1,
          maxTokens: 2600
        });
        finishReason = third.finishReason;
        result = sanitizeFeedbackJson(extractJson(third.text));
      }
    }

    return NextResponse.json({
      feedback: limitFeedbackLength(formatFeedback(result), 900),
      meta: {
        calledApi: true,
        finishReason,
        retried,
        attempt
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
