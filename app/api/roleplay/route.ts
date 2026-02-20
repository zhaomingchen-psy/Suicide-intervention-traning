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

function selectRecentMessages(messages: ClientMessage[], keep: number) {
  if (messages.length <= keep) return messages;
  return messages.slice(messages.length - keep);
}

function shorten(value: string | undefined, max = 260) {
  const text = String(value || "").trim();
  if (!text) return "Not provided";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

function shortenList(values: string[] | undefined, itemMax = 80, take = 4) {
  if (!Array.isArray(values) || values.length === 0) return "Not provided";
  const cleaned = values
    .map((v) => shorten(v, itemMax))
    .filter(Boolean)
    .slice(0, take);
  return cleaned.length ? cleaned.join("; ") : "Not provided";
}

function toChatMessages(
  messages: ClientMessage[],
  caseProfile: CaseProfile,
  mode: "standard" | "compact" | "strict" = "standard"
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const basePrompt = `
You are role-playing a counseling client in a crisis-intervention training simulation.
Only speak as the client.

Rules:
1) Use first-person natural language, 1-3 sentences, max 80 words.
2) Do not switch roles, do not provide supervisor commentary.
3) Do not provide self-harm implementation details (method, tools, location, steps).
4) If asked about risk, answer realistically based on the case profile.

Case setup:
- Theme: ${shorten(caseProfile.title, 80)}
- Risk level: ${shorten(caseProfile.riskLevel, 40)}
- Background: ${shorten(caseProfile.background, 260)}
- Training goals: ${shortenList(caseProfile.goals, 60, 3)}
- Red flags: ${shortenList(caseProfile.redFlags, 60, 4)}
`.trim();

  const compactPrompt = `
You are a crisis-simulation client.
Output only the client's reply.
Rules:
- 1-2 sentences, under 60 words.
- First person, natural, emotionally consistent.
- No role switch, no analysis, no lists.
- No self-harm method/tool/location/step details.
`.trim();

  const strictPrompt = `
Client reply only.
Exactly 1 sentence, under 40 words.
No lists, no markdown, no explanations.
`.trim();

  const systemPrompt =
    mode === "standard" ? basePrompt : mode === "compact" ? compactPrompt : strictPrompt;

  return [
    { role: "system", content: systemPrompt },
    ...messages.map((msg) => ({ role: msg.role, content: msg.content }))
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
    let attempt = 1;
    let finishReason = "unknown";
    let reply = "";

    const attemptPlans: Array<{
      input: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      temperature: number;
      maxTokens: number;
    }> = [
      {
        input: toChatMessages(selectRecentMessages(messages, 14), caseProfile, "standard"),
        temperature: 0.5,
        maxTokens: 1200
      },
      {
        input: toChatMessages(selectRecentMessages(messages, 10), caseProfile, "compact"),
        temperature: 0.4,
        maxTokens: 2200
      },
      {
        input: toChatMessages(selectRecentMessages(messages, 6), caseProfile, "strict"),
        temperature: 0.3,
        maxTokens: 3200
      }
    ];

    for (let i = 0; i < attemptPlans.length; i++) {
      const plan = attemptPlans[i];
      try {
        const result = await createChatCompletionWithMeta(plan.input, {
          temperature: plan.temperature,
          maxTokens: plan.maxTokens
        });
        finishReason = result.finishReason;
        reply = result.text;
        attempt = i + 1;
        if (i > 0) retried = true;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const isLength = message.includes("finish_reason: length");
        if (!isLength || i === attemptPlans.length - 1) {
          throw error;
        }
        retried = true;
      }
    }

    return NextResponse.json({
      reply,
      meta: {
        source: "model",
        calledApi: true,
        model,
        endpoint: `${baseURL.replace(/\/+$/, "")}/api/paas/v4/chat/completions`,
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
