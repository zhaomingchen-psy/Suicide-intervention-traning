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

type ReportJson = {
  session_snapshot: string[];
  what_the_counselor_did_well: string[];
  missed_or_weak_risk_steps: string[];
  better_response_options: string[];
  action_plan_for_next_practice: string[];
};

function transcriptFromMessages(messages: ClientMessage[]) {
  return messages
    .map((item, idx) => {
      const speaker = item.role === "user" ? "Counselor" : "Client";
      return `${idx + 1}. ${speaker}: ${item.content}`;
    })
    .join("\n");
}

function selectRecentMessages(messages: ClientMessage[], keep = 24) {
  if (messages.length <= keep) return messages;
  return messages.slice(messages.length - keep);
}

function toCleanList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, maxItems);
}

function limitReportLength(text: string, maxChars = 3800) {
  const compact = text.replace(/\n{3,}/g, "\n\n").trim();
  if (compact.length <= maxChars) {
    return compact;
  }
  return `${compact.slice(0, maxChars).trim()}\n\n[Truncated to fit report length]`;
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
    throw new Error("Model returned non-JSON content for report.");
  }
}

function sanitizeReport(payload: unknown): ReportJson {
  const data = (payload || {}) as Record<string, unknown>;

  const report: ReportJson = {
    session_snapshot: toCleanList(data.session_snapshot, 3),
    what_the_counselor_did_well: toCleanList(data.what_the_counselor_did_well, 3),
    missed_or_weak_risk_steps: toCleanList(data.missed_or_weak_risk_steps, 3),
    better_response_options: toCleanList(data.better_response_options, 2),
    action_plan_for_next_practice: toCleanList(data.action_plan_for_next_practice, 3)
  };

  if (!report.session_snapshot.length) {
    report.session_snapshot = ["Session summary unavailable."];
  }
  if (!report.what_the_counselor_did_well.length) {
    report.what_the_counselor_did_well = ["Strengths not identified clearly in this run."];
  }
  if (!report.missed_or_weak_risk_steps.length) {
    report.missed_or_weak_risk_steps = ["No clear risk-assessment gaps identified."];
  }
  if (!report.better_response_options.length) {
    report.better_response_options = [
      "I hear you. Can we slow down and focus on what feels most urgent right now?",
      "To keep you safe, are you having thoughts of harming yourself right now?"
    ];
  }
  if (!report.action_plan_for_next_practice.length) {
    report.action_plan_for_next_practice = ["Practice one empathic reflection followed by one direct safety question."];
  }

  return report;
}

function formatReport(report: ReportJson) {
  const block = (title: string, items: string[]) => `## ${title}\n${items.map((i) => `- ${i}`).join("\n")}`;

  return [
    block("Session Snapshot", report.session_snapshot),
    block("What The Counselor Did Well", report.what_the_counselor_did_well),
    block("Missed Or Weak Risk Steps", report.missed_or_weak_risk_steps),
    block("Better Response Options (2)", report.better_response_options),
    block("Action Plan For Next Practice", report.action_plan_for_next_practice)
  ].join("\n\n");
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
      messages?: ClientMessage[];
      caseProfile?: CaseProfile;
      quickFeedback?: string;
    };

    const messages = body?.messages ?? [];
    const caseProfile = body?.caseProfile ?? {};
    const quickFeedback = body?.quickFeedback ?? "";

    if (!Array.isArray(messages) || messages.length < 2) {
      return NextResponse.json(
        { error: "At least one full dialogue turn is required to generate a full report." },
        { status: 400 }
      );
    }

    const transcript = transcriptFromMessages(selectRecentMessages(messages, 24));
    const compactTranscript = transcriptFromMessages(selectRecentMessages(messages, 14));
    const tinyTranscript = transcriptFromMessages(selectRecentMessages(messages, 10));

    const promptMessages = [
      {
        role: "system" as const,
        content: `
Return ONLY valid JSON using this schema:
{
  "session_snapshot": ["bullet 1", "bullet 2"],
  "what_the_counselor_did_well": ["bullet 1", "bullet 2"],
  "missed_or_weak_risk_steps": ["bullet 1", "bullet 2"],
  "better_response_options": ["copy-ready script 1", "copy-ready script 2"],
  "action_plan_for_next_practice": ["bullet 1", "bullet 2"]
}
Rules:
- English only.
- Keep bullets concise and actionable.
- Focus on counselor performance, not demographics/background details.
- better_response_options must be directly usable counselor scripts.
- No markdown, no extra keys, no commentary text.
`.trim()
      },
      {
        role: "user" as const,
        content: `
Case theme: ${caseProfile.title || "Not provided"}
Risk hint: ${caseProfile.riskLevel || "Not provided"}
Quick feedback: ${quickFeedback || "Not provided"}
Transcript:
${transcript}
`.trim()
      }
    ];

    const compactPromptMessages = [
      {
        role: "system" as const,
        content: `
JSON only. Same keys only:
session_snapshot, what_the_counselor_did_well, missed_or_weak_risk_steps, better_response_options, action_plan_for_next_practice.
Two short bullets per key max.
`.trim()
      },
      {
        role: "user" as const,
        content: `
Case: ${caseProfile.title || "Not provided"} / ${caseProfile.riskLevel || "Not provided"}
${compactTranscript}
`.trim()
      }
    ];

    const tinyPromptMessages = [
      {
        role: "system" as const,
        content: `
Return strict JSON with the same 5 keys only. Very short bullets.
`.trim()
      },
      {
        role: "user" as const,
        content: tinyTranscript
      }
    ];

    let reportJson: ReportJson;
    let finishReason = "unknown";
    let retried = false;
    let attempt = 1;

    try {
      const first = await createChatCompletionWithMeta(promptMessages, {
        temperature: 0.1,
        maxTokens: 2600
      });
      finishReason = first.finishReason;
      reportJson = sanitizeReport(extractJson(first.text));
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
          maxTokens: 3600
        });
        finishReason = second.finishReason;
        reportJson = sanitizeReport(extractJson(second.text));
      } catch (error2) {
        const message2 = error2 instanceof Error ? error2.message : "Unknown error";
        if (!isLengthError(message2)) {
          throw error2;
        }

        attempt = 3;
        const third = await createChatCompletionWithMeta(tinyPromptMessages, {
          temperature: 0.1,
          maxTokens: 4600
        });
        finishReason = third.finishReason;
        reportJson = sanitizeReport(extractJson(third.text));
      }
    }

    return NextResponse.json({
      report: limitReportLength(formatReport(reportJson), 3800),
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
