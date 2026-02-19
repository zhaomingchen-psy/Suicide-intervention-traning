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

type SkillScores = {
  empathy: number;
  active_listening: number;
  risk_assessment: number;
  safety_planning: number;
  problem_solving: number;
};

type CurrentTurnFeedback = {
  did_well: string;
  needs_improvement: string;
};

type RoundCoach = {
  summary: string;
  suggestion: string;
  recommended_options: string[];
  emotion: string;
  crisis_level: "Low" | "Medium" | "High" | "Imminent";
  technique_used:
    | "A. Fostering Engagement / Rapport"
    | "B. Collaborative Problem-Solving"
    | "C. Suicide Risk Assessment"
    | "D. Establishing Safety / Mitigating Risk"
    | "E. Resources, Referrals, and Treatment Promotion";
  current_turn_feedback: CurrentTurnFeedback;
  skill_scores: SkillScores;
};

function selectRecentMessages(messages: ClientMessage[], keep = 12) {
  if (messages.length <= keep) return messages;
  return messages.slice(messages.length - keep);
}

function isLengthError(message: string) {
  return message.includes("finish_reason: length");
}

function isJsonParseError(message: string) {
  return (
    message.includes("Model returned non-JSON content for round feedback.") ||
    message.includes("Unexpected token") ||
    message.includes("JSON")
  );
}

function transcriptFromMessages(messages: ClientMessage[]) {
  return messages
    .map((item, idx) => {
      const speaker = item.role === "user" ? "Counselor" : "Client";
      return `${idx + 1}. ${speaker}: ${item.content}`;
    })
    .join("\n");
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
    throw new Error("Model returned non-JSON content for round feedback.");
  }
}

function clampScore(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function sanitizePayload(payload: unknown): RoundCoach {
  const data = (payload || {}) as Record<string, unknown>;
  const scores = (data.skill_scores || {}) as Record<string, unknown>;

  const normalizeLevel = (value: unknown): RoundCoach["crisis_level"] => {
    const v = String(value || "").toLowerCase();
    if (v.includes("imminent")) return "Imminent";
    if (v.includes("high")) return "High";
    if (v.includes("medium")) return "Medium";
    return "Low";
  };

  const options = Array.isArray(data.recommended_options)
    ? data.recommended_options.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 2)
    : [];

  const normalizeTechnique = (value: unknown): RoundCoach["technique_used"] => {
    const v = String(value || "").toLowerCase();
    if (v.includes("rapport") || v.includes("engagement")) {
      return "A. Fostering Engagement / Rapport";
    }
    if (v.includes("problem")) {
      return "B. Collaborative Problem-Solving";
    }
    if (v.includes("risk")) {
      return "C. Suicide Risk Assessment";
    }
    if (v.includes("safety") || v.includes("mitigating")) {
      return "D. Establishing Safety / Mitigating Risk";
    }
    return "E. Resources, Referrals, and Treatment Promotion";
  };

  return {
    summary: String(data.summary || "No summary generated.").trim(),
    suggestion: String(data.suggestion || "No suggestion generated.").trim(),
    recommended_options: options.length ? options : ["Could not generate response options this turn."],
    emotion: String(data.emotion || "Not clear").trim(),
    crisis_level: normalizeLevel(data.crisis_level),
    technique_used: normalizeTechnique(data.technique_used),
    current_turn_feedback: {
      did_well: String((data.current_turn_feedback as Record<string, unknown> | undefined)?.did_well || "N/A")
        .trim()
        .slice(0, 180),
      needs_improvement: String(
        (data.current_turn_feedback as Record<string, unknown> | undefined)?.needs_improvement || "N/A"
      )
        .trim()
        .slice(0, 180)
    },
    skill_scores: {
      empathy: clampScore(scores.empathy),
      active_listening: clampScore(scores.active_listening),
      risk_assessment: clampScore(scores.risk_assessment),
      safety_planning: clampScore(scores.safety_planning),
      problem_solving: clampScore(scores.problem_solving)
    }
  };
}

function buildLocalFallback(messages: ClientMessage[], previousFeedback: string): RoundCoach {
  const lastUser = [...messages].reverse().find((item) => item.role === "user")?.content || "";
  const lowered = lastUser.toLowerCase();

  let technique: RoundCoach["technique_used"] = "A. Fostering Engagement / Rapport";
  if (/(suicide|harm|kill|plan|means|intent)/.test(lowered)) {
    technique = "C. Suicide Risk Assessment";
  } else if (/(safe|safety|stay safe|emergency|911|hospital)/.test(lowered)) {
    technique = "D. Establishing Safety / Mitigating Risk";
  } else if (/(try|step|option|plan|what can)/.test(lowered)) {
    technique = "B. Collaborative Problem-Solving";
  } else if (/(therap|referr|resource|service|doctor|psychiat)/.test(lowered)) {
    technique = "E. Resources, Referrals, and Treatment Promotion";
  }

  return {
    summary: `Round coach generated from fallback due temporary model formatting issue. Previous note: ${previousFeedback}`.slice(
      0,
      180
    ),
    suggestion: "Keep one empathic reflection plus one clear safety question in your next reply.",
    recommended_options: [
      "I hear how heavy this feels right now. Can you tell me what is hardest at this moment?",
      "To support your safety, are thoughts of harming yourself present right now?"
    ],
    emotion: "Distressed / overwhelmed",
    crisis_level: "Medium",
    technique_used: technique,
    current_turn_feedback: {
      did_well: "You stayed engaged and kept the dialogue moving in this turn.",
      needs_improvement: "Make your next turn more specific with one direct risk question."
    },
    skill_scores: {
      empathy: 60,
      active_listening: 58,
      risk_assessment: 45,
      safety_planning: 35,
      problem_solving: 50
    }
  };
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
      previousFeedback?: string;
    };

    const messages = body?.messages ?? [];
    const caseProfile = body?.caseProfile ?? {};
    const previousFeedback = body?.previousFeedback ?? "N/A - session start";

    if (!Array.isArray(messages) || messages.length < 2) {
      return NextResponse.json({ error: "Need at least one full dialogue turn." }, { status: 400 });
    }

    const transcript = transcriptFromMessages(selectRecentMessages(messages, 12));
    const compactTranscript = transcriptFromMessages(selectRecentMessages(messages, 8));

    const promptMessages = [
      {
        role: "system" as const,
        content: `
You are a crisis counseling training coach.
Analyze the current round and return ONLY valid JSON.

JSON schema:
{
  "summary": "string, one concise sentence only",
  "suggestion": "string, one concrete coaching sentence only",
  "recommended_options": [
    "direct copy-ready counselor script 1 (full sentence, <=22 words)",
    "direct copy-ready counselor script 2 (full sentence, <=22 words)"
  ],
  "emotion": "string, <=8 words",
  "crisis_level": "Low | Medium | High | Imminent",
  "technique_used": "A. Fostering Engagement / Rapport | B. Collaborative Problem-Solving | C. Suicide Risk Assessment | D. Establishing Safety / Mitigating Risk | E. Resources, Referrals, and Treatment Promotion",
  "current_turn_feedback": {
    "did_well": "string, what counselor did well THIS turn (<=20 words)",
    "needs_improvement": "string, what counselor should improve THIS turn (<=20 words)"
  },
  "skill_scores": {
    "empathy": 0,
    "active_listening": 0,
    "risk_assessment": 0,
    "safety_planning": 0,
    "problem_solving": 0
  }
}

Scoring rule:
- Scores are 0-100 integers.
- Risk assessment and safety planning should stay low unless explicitly asked in dialogue.
- "recommended_options" must be directly usable counselor utterances (not meta advice).
- "current_turn_feedback" must evaluate only counselor performance in THIS turn.
- Classify technique_used using these definitions:
  A. Fostering Engagement / Rapport:
    - welcoming nonjudgmental tone; validates/normalizes feelings; empathy/compassion;
      affirms strengths; encourages continued engagement.
  B. Collaborative Problem-Solving:
    - asks what was tried and what helped; explores options collaboratively;
      offers suggestions while preserving choice; identifies concrete next steps;
      summarizes/checks agreement on action plan.
  C. Suicide Risk Assessment:
    - assesses current/past suicidal thoughts; prior attempts/self-harm;
      plan details (method/timing/specificity); access to means; attempt in progress;
      and suicidal intent.
  D. Establishing Safety / Mitigating Risk:
    - develops safety plan; means safety; immediate escalation when needed;
      switch to phone; emergency services/ED; commitment to immediate safety.
  E. Resources, Referrals, and Treatment Promotion:
    - explores treatment attitudes/experience; psychoeducation; offers referrals;
      practical access steps; self-help and follow-up options.
- Keep content clinically cautious, training-focused, and practical.
- No markdown, no extra keys, no explanation text outside JSON.
`.trim()
      },
      {
        role: "user" as const,
        content: `
Case theme: ${caseProfile.title || "Not provided"}
Risk hint: ${caseProfile.riskLevel || "Not provided"}
Previous round feedback: ${previousFeedback}

Recent transcript:
${transcript}
`.trim()
      }
    ];

    const compactPromptMessages = [
      {
        role: "system" as const,
        content: `
You are a crisis counseling training coach.
Return ONLY valid JSON with keys:
summary, suggestion, recommended_options, emotion, crisis_level, technique_used, current_turn_feedback, skill_scores.
recommended_options must be 2 direct copy-ready counselor scripts.
current_turn_feedback must be an object with did_well and needs_improvement for THIS turn.
No markdown. No extra keys.
`.trim()
      },
      {
        role: "user" as const,
        content: `
Case theme: ${caseProfile.title || "Not provided"}
Risk hint: ${caseProfile.riskLevel || "Not provided"}
Recent transcript:
${compactTranscript}
`.trim()
      }
    ];

    const strictPromptMessages = [
      {
        role: "system" as const,
        content: `
STRICT JSON ONLY. Do not output markdown, explanation, or code fences.
Output one JSON object with keys:
summary, suggestion, recommended_options, emotion, crisis_level, technique_used, current_turn_feedback, skill_scores.
recommended_options must contain exactly 2 short counselor scripts.
current_turn_feedback must be object: { did_well, needs_improvement }.
`.trim()
      },
      {
        role: "user" as const,
        content: compactTranscript
      }
    ];

    const attemptPlans: Array<{
      messages: Array<{ role: "system" | "user"; content: string }>;
      temperature: number;
      maxTokens: number;
    }> = [
      { messages: promptMessages, temperature: 0.2, maxTokens: 2200 },
      { messages: compactPromptMessages, temperature: 0.1, maxTokens: 3200 },
      { messages: strictPromptMessages, temperature: 0.1, maxTokens: 3600 }
    ];

    let parsed: RoundCoach | null = null;
    let finishReason = "unknown";
    let retried = false;
    let jsonRetried = false;
    let fallbackUsed = false;
    let lastRetriableError = "";

    for (let i = 0; i < attemptPlans.length; i++) {
      const plan = attemptPlans[i];
      try {
        const result = await createChatCompletionWithMeta(plan.messages, {
          temperature: plan.temperature,
          maxTokens: plan.maxTokens
        });
        finishReason = result.finishReason;
        parsed = sanitizePayload(extractJson(result.text));
        if (i > 0) {
          retried = true;
        }
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const retryable = isLengthError(message) || isJsonParseError(message);
        if (isJsonParseError(message)) {
          jsonRetried = true;
        }
        if (i > 0) {
          retried = true;
        }
        if (!retryable) {
          throw error;
        }
        lastRetriableError = message;
      }
    }

    if (!parsed) {
      parsed = buildLocalFallback(messages, previousFeedback);
      fallbackUsed = true;
    }

    return NextResponse.json({
      coach: parsed,
      meta: {
        calledApi: true,
        finishReason,
        retried,
        jsonRetried,
        fallbackUsed,
        lastRetriableError
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
