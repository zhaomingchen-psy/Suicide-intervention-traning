import { NextResponse } from "next/server";
import { createChatCompletionWithMeta } from "../../../lib/bigmodel";
import { getModelConfig } from "../../../lib/model";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type CaseProfile = {
  title?: string;
  riskLevel?: string;
};

function selectRecentMessages(messages: ChatMessage[], keep: number) {
  if (messages.length <= keep) return messages;
  return messages.slice(messages.length - keep);
}

function transcriptFromMessages(messages: ChatMessage[]) {
  return messages
    .map((item, idx) => `${idx + 1}. ${item.role === "user" ? "Counselor" : "Client"}: ${item.content}`)
    .join("\n");
}

function normalizeReply(text: string) {
  return text
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function isLengthError(message: string) {
  return message.includes("finish_reason: length");
}

export async function POST(req: Request) {
  const { apiKey } = getModelConfig();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing BIGMODEL_API_KEY (or OPENAI_API_KEY). Configure .env.local and restart." },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json()) as {
      draft?: string;
      messages?: ChatMessage[];
      caseProfile?: CaseProfile;
    };

    const draft = String(body?.draft || "").trim();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const caseProfile = body?.caseProfile ?? {};

    if (!draft) {
      return NextResponse.json({ error: "draft cannot be empty" }, { status: 400 });
    }

    const transcript = transcriptFromMessages(selectRecentMessages(messages, 14));
    const compactTranscript = transcriptFromMessages(selectRecentMessages(messages, 8));

    const promptMessages = [
      {
        role: "system" as const,
        content: `
You are an assistant that edits counselor drafts for crisis-intervention roleplay.
Return ONLY the polished counselor response text.
Rules:
- Keep the original intent, but improve empathy, clarity, and safety focus.
- 1-3 sentences, <=70 words.
- Natural conversational English.
- No bullet points, no markdown, no analysis, no explanation.
- If risk language is present in context, include one clear, direct safety check question.
`.trim()
      },
      {
        role: "user" as const,
        content: `
Case theme: ${caseProfile.title || "Not provided"}
Risk hint: ${caseProfile.riskLevel || "Not provided"}
Recent transcript:
${transcript || "N/A"}

Counselor draft to polish:
${draft}
`.trim()
      }
    ];

    const compactPromptMessages = [
      {
        role: "system" as const,
        content: `
Rewrite the counselor draft.
Return one short polished response only.
1-2 sentences, <=55 words, English only.
No markdown, no explanation.
`.trim()
      },
      {
        role: "user" as const,
        content: `
Risk hint: ${caseProfile.riskLevel || "Not provided"}
Recent transcript:
${compactTranscript || "N/A"}
Draft:
${draft}
`.trim()
      }
    ];

    const strictPromptMessages = [
      {
        role: "system" as const,
        content: "Output only one polished counselor response sentence in English."
      },
      {
        role: "user" as const,
        content: draft
      }
    ];

    const attemptPlans: Array<{
      messages: Array<{ role: "system" | "user"; content: string }>;
      temperature: number;
      maxTokens: number;
    }> = [
      { messages: promptMessages, temperature: 0.2, maxTokens: 700 },
      { messages: compactPromptMessages, temperature: 0.2, maxTokens: 1200 },
      { messages: strictPromptMessages, temperature: 0.2, maxTokens: 1800 }
    ];

    let polished = "";
    let finishReason = "unknown";
    let retried = false;
    let attempt = 1;

    for (let i = 0; i < attemptPlans.length; i++) {
      const plan = attemptPlans[i];
      try {
        const result = await createChatCompletionWithMeta(plan.messages, {
          temperature: plan.temperature,
          maxTokens: plan.maxTokens
        });
        polished = normalizeReply(result.text);
        finishReason = result.finishReason;
        attempt = i + 1;
        if (i > 0) retried = true;
        if (!polished) {
          throw new Error(`Model returned empty content (finish_reason: ${finishReason})`);
        }
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const retryable = isLengthError(message);
        if (!retryable || i === attemptPlans.length - 1) {
          throw error;
        }
        retried = true;
      }
    }

    return NextResponse.json({
      polished,
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

