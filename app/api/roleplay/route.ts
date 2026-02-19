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
  background?: string;
  goals?: string[];
  redFlags?: string[];
};

function toChatMessages(
  messages: ClientMessage[],
  caseProfile: CaseProfile
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const systemPrompt = `
You are role-playing a counseling client in a crisis-intervention training simulation.
Only speak as the client.

Rules:
1) Use first-person natural language, 1-3 sentences, max 120 words.
2) Do not switch roles, do not provide supervisor commentary.
3) Do not provide self-harm implementation details (method, tools, location, steps).
4) If asked about risk, answer realistically based on the case profile.

Case setup:
- Theme: ${caseProfile.title || "Not provided"}
- Risk level: ${caseProfile.riskLevel || "Not provided"}
- Background: ${caseProfile.background || "Not provided"}
- Training goals: ${(caseProfile.goals || []).join("; ") || "Not provided"}
- Red flags: ${(caseProfile.redFlags || []).join("; ") || "Not provided"}
`.trim();

  return [
    { role: "system", content: systemPrompt },
    ...messages.map((msg) => ({ role: msg.role, content: msg.content }))
  ];
}

function buildRetryMessages(messages: ClientMessage[], caseProfile: CaseProfile) {
  return [
    ...toChatMessages(messages, caseProfile),
    {
      role: "system" as const,
      content:
        "Output only the client's final answer. No analysis, no list, no explanation, just 1-2 sentences."
    }
  ];
}

export async function POST(req: Request) {
  const { apiKey, model, baseURL } = getModelConfig();
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
    };

    const messages = body?.messages ?? [];
    const caseProfile = body?.caseProfile ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages cannot be empty" }, { status: 400 });
    }

    let retried = false;
    let finishReason = "unknown";
    let reply: string;

    try {
      const first = await createChatCompletionWithMeta(toChatMessages(messages, caseProfile), {
        temperature: 0.6,
        maxTokens: 700
      });
      reply = first.text;
      finishReason = first.finishReason;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (!message.includes("finish_reason: length")) {
        throw error;
      }

      retried = true;
      const second = await createChatCompletionWithMeta(buildRetryMessages(messages, caseProfile), {
        temperature: 0.5,
        maxTokens: 1100
      });
      reply = second.text;
      finishReason = second.finishReason;
    }

    return NextResponse.json({
      reply,
      meta: {
        source: "model",
        calledApi: true,
        model,
        endpoint: `${baseURL.replace(/\/+$/, "")}/api/paas/v4/chat/completions`,
        finishReason,
        retried
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
