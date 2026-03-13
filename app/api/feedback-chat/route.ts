import { NextResponse } from "next/server";
import { createChatCompletionWithMetaForConfig } from "../../../lib/bigmodel";
import { getFeedbackModelConfig } from "../../../lib/model";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type FeedbackCoachMessage = {
  role: "user" | "assistant";
  content: string;
};

type CaseProfile = {
  title?: string;
  riskLevel?: string;
};

type RoundCoach = {
  summary: string;
  suggestion: string;
  recommended_options: string[];
  emotion: string;
  crisis_level: string;
  technique_used: string;
  current_turn_feedback: {
    did_well: string;
    needs_improvement: string;
  };
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

function isLengthError(message: string) {
  return message.includes("finish_reason: length");
}

export async function POST(req: Request) {
  const modelConfig = getFeedbackModelConfig();
  if (!modelConfig.apiKey) {
    return NextResponse.json(
      { error: "Missing DEEPSEEK_API_KEY. Configure .env.local or Vercel env and restart." },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json()) as {
      question?: string;
      priorMessages?: ChatMessage[];
      counselorMessage?: string;
      clientReply?: string;
      caseProfile?: CaseProfile;
      roundCoach?: RoundCoach;
      history?: FeedbackCoachMessage[];
    };

    const question = String(body?.question || "").trim();
    const priorMessages = Array.isArray(body?.priorMessages) ? body.priorMessages : [];
    const counselorMessage = String(body?.counselorMessage || "").trim();
    const clientReply = String(body?.clientReply || "").trim();
    const caseProfile = body?.caseProfile ?? {};
    const roundCoach = body?.roundCoach;
    const history = Array.isArray(body?.history) ? body.history.slice(-6) : [];

    if (!question) {
      return NextResponse.json({ error: "question cannot be empty" }, { status: 400 });
    }

    const transcript = transcriptFromMessages(selectRecentMessages(priorMessages, 8));
    const compactTranscript = transcriptFromMessages(selectRecentMessages(priorMessages, 4));

    const baseContext = `
Case theme: ${caseProfile.title || "Not provided"}
Risk hint: ${caseProfile.riskLevel || "Not provided"}

Context before counselor turn:
${transcript || "No prior context."}

Counselor turn:
${counselorMessage || "Not provided"}

Client reply after counselor turn:
${clientReply || "Not provided"}

Current round feedback:
- Summary: ${roundCoach?.summary || "Not provided"}
- Suggestion: ${roundCoach?.suggestion || "Not provided"}
- Emotion: ${roundCoach?.emotion || "Not provided"}
- Crisis level: ${roundCoach?.crisis_level || "Not provided"}
- Technique used: ${roundCoach?.technique_used || "Not provided"}
- Did well: ${roundCoach?.current_turn_feedback?.did_well || "Not provided"}
- Needs improvement: ${roundCoach?.current_turn_feedback?.needs_improvement || "Not provided"}
- Recommended options: ${(roundCoach?.recommended_options || []).join(" | ") || "Not provided"}
`.trim();

    const promptMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      {
        role: "system",
        content: `
You are a crisis counseling training coach answering therapist follow-up questions about one specific round of feedback.
Rules:
- Base your answer only on the supplied transcript and feedback.
- Do not invent hidden motivations, background factors, or formulations that are not explicitly stated.
- If the user's question depends on information not shown in the supplied evidence, say it was not disclosed in that round.
- Keep answers concise: 2-5 sentences.
- If useful, include up to 2 direct copy-ready counselor lines.
- Do not role-play the client.
- Do not use markdown headings or bullet lists unless the user explicitly asks for a list.
`.trim()
      },
      {
        role: "user",
        content: `${baseContext}\n\nAnswer questions using only this evidence.`
      },
      ...history.map((item) => ({
        role: item.role,
        content: item.content
      })),
      {
        role: "user",
        content: question
      }
    ];

    const compactPromptMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      {
        role: "system",
        content:
          "Answer one follow-up question about round feedback. Use only supplied evidence. No invented details. Keep it under 4 sentences."
      },
      {
        role: "user",
        content: `
Before counselor turn:
${compactTranscript || "No prior context."}
Counselor:
${counselorMessage || "Not provided"}
Client:
${clientReply || "Not provided"}
Feedback:
${roundCoach?.summary || "Not provided"} | ${roundCoach?.suggestion || "Not provided"}
Question:
${question}
`.trim()
      }
    ];

    const strictPromptMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      {
        role: "system",
        content:
          "Answer briefly using only the supplied evidence. If the evidence does not support the claim, say that clearly."
      },
      {
        role: "user",
        content: `Question: ${question}\nCounselor: ${counselorMessage}\nClient: ${clientReply}`
      }
    ];

    const attemptPlans = [
      { messages: promptMessages, temperature: 0.2, maxTokens: 700 },
      { messages: compactPromptMessages, temperature: 0.2, maxTokens: 1100 },
      { messages: strictPromptMessages, temperature: 0.2, maxTokens: 1600 }
    ];

    let answer = "";
    let finishReason = "unknown";
    let retried = false;
    let attempt = 1;

    for (let i = 0; i < attemptPlans.length; i++) {
      const plan = attemptPlans[i];
      try {
        const result = await createChatCompletionWithMetaForConfig(modelConfig, plan.messages, {
          temperature: plan.temperature,
          maxTokens: plan.maxTokens
        });
        answer = result.text.trim();
        finishReason = result.finishReason;
        attempt = i + 1;
        if (i > 0) retried = true;
        if (!answer) {
          throw new Error(`Model returned empty content (finish_reason: ${finishReason})`);
        }
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (!isLengthError(message) || i === attemptPlans.length - 1) {
          throw error;
        }
        retried = true;
      }
    }

    return NextResponse.json({
      answer,
      meta: {
        calledApi: true,
        provider: modelConfig.provider,
        model: modelConfig.model,
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
