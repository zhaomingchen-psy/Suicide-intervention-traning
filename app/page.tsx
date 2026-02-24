"use client";

import { FormEvent, KeyboardEvent, useMemo, useState } from "react";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ReplySource = "model" | "unknown";

type CaseProfile = {
  title: string;
  riskLevel: string;
  background: string;
  goals: string[];
  redFlags: string[];
};

type CaseTemplate = {
  id: string;
  title: string;
  riskTag: "low" | "medium" | "high";
  description: string;
  brief: string;
  opening: string;
  profile: CaseProfile;
};

const caseTemplates: CaseTemplate[] = [
  {
    id: "college_passive_ideation",
    title: "Academic overload (low-medium risk)",
    riskTag: "low",
    description: "Practice alliance-building, emotion labeling, and stressor mapping.",
    brief:
      "Client has prolonged academic and relationship pressure. Goal: practice empathic reflection and collaborative exploration.",
    opening:
      "My mind has been racing lately. I can't sleep well, and the more I think, the more I feel like a failure.",
    profile: {
      title: "Graduate student with hopelessness and withdrawal",
      riskLevel: "Medium risk (requires ongoing assessment)",
      background:
        "22-year-old graduate student with stacked academic and relationship stress, poor sleep, reduced appetite, and social withdrawal.",
      goals: [
        "Build therapeutic alliance",
        "Assess passive vs active suicidal ideation",
        "Identify protective factors and support system"
      ],
      redFlags: ["Hopelessness", "Worsening night insomnia", "Avoidance of help-seeking"]
    }
  },
  {
    id: "workplace_recent_plan",
    title: "Relationship rupture + passive SI (medium risk)",
    riskTag: "medium",
    description: "Practice supportive direct inquiry and basic safety planning.",
    brief:
      "Client presents significant hopelessness after relationship rupture. Goal: practice warm but direct risk-assessment questions.",
    opening:
      "Lately everything feels meaningless. Last night I even thought maybe I should stop trying at all.",
    profile: {
      title: "Working adult with escalating crisis language",
      riskLevel: "High risk (may require urgent referral)",
      background:
        "29-year-old with one week of severe insomnia, recent layoff and debt stress, and reduced contact with family.",
      goals: [
        "Clarify current risk level",
        "Ask about plan/means/timeline",
        "Build immediate safety actions and referral path"
      ],
      redFlags: ["Plan-like language", "Weak support network", "Marked functional decline"]
    }
  },
  {
    id: "adolescent_self_harm_history",
    title: "Relapse risk with prior self-harm history (high risk)",
    riskTag: "high",
    description: "Practice escalation judgment and supervisor-referral awareness.",
    brief:
      "Client has prior self-harm history and rising family conflict. Goal: move quickly into structured safety assessment.",
    opening:
      "I don't want to say much. Talking doesn't help anyway. I've started wanting to hurt myself again.",
    profile: {
      title: "Adolescent with prior self-harm and relapse risk",
      riskLevel: "Medium-high risk (family/supervisor coordination needed)",
      background:
        "17-year-old high school student with prior self-harm. Family conflict increased recently, school attendance is dropping.",
      goals: [
        "Build emotional safety and alliance",
        "Assess triggers and immediate danger",
        "Include guardian and multi-party coordination"
      ],
      redFlags: ["High concealment", "Impulsivity risk", "Limited peer support"]
    }
  },
  {
    id: "burnout_healthcare_worker",
    title: "Burnout and emotional numbness (medium risk)",
    riskTag: "medium",
    description: "Practice validating fatigue while screening for self-harm risk.",
    brief:
      "Client is emotionally exhausted and detached. Goal: combine validation, gentle structure, and direct risk checks.",
    opening:
      "I feel empty all the time now. I used to care about people, but now I just feel done with everything.",
    profile: {
      title: "Healthcare worker with burnout and hopelessness",
      riskLevel: "Medium risk (monitor for escalation)",
      background:
        "31-year-old nurse with repeated overtime and poor sleep, reporting emotional numbness and social withdrawal.",
      goals: [
        "Validate burnout without normalizing risk",
        "Check passive/active self-harm thoughts",
        "Identify immediate supports for tonight"
      ],
      redFlags: ["Severe fatigue", "Meaninglessness", "Reduced connection to others"]
    }
  },
  {
    id: "military_transition_isolation",
    title: "Transition stress and isolation (medium risk)",
    riskTag: "medium",
    description: "Practice identity-loss conversations and support mapping.",
    brief:
      "Client recently left structured service life and feels disconnected. Goal: assess risk and restore short-term anchors.",
    opening:
      "Since leaving service, I don't know who I am anymore. Nights are the worst, and my head gets dark.",
    profile: {
      title: "Recent transition with identity disruption",
      riskLevel: "Medium risk (requires close follow-up)",
      background: "35-year-old recently transitioned from military context, now unemployed and socially isolated.",
      goals: [
        "Explore identity loss and loneliness",
        "Assess current suicidal thoughts and intensity",
        "Co-create immediate coping and contact plan"
      ],
      redFlags: ["Nighttime worsening", "Isolation", "Loss of purpose"]
    }
  },
  {
    id: "postpartum_overwhelm",
    title: "Postpartum overwhelm and shame (medium-high risk)",
    riskTag: "high",
    description: "Practice compassionate inquiry under intense self-criticism.",
    brief:
      "Client reports severe overwhelm and shame in parenting role. Goal: maintain safety focus while reducing shame.",
    opening:
      "I keep thinking my baby deserves a better mom. Sometimes I scare myself with how dark my thoughts get.",
    profile: {
      title: "Postpartum distress with intrusive dark thoughts",
      riskLevel: "Medium-high risk (urgent assessment if active intent appears)",
      background: "26-year-old new parent with sleep deprivation, crying spells, and fear of being judged.",
      goals: [
        "Reduce shame and increase disclosure",
        "Assess intent/plan/timing clearly",
        "Engage support network quickly"
      ],
      redFlags: ["Self-worth collapse", "Sleep deprivation", "Fear-based concealment"]
    }
  },
  {
    id: "bereavement_complicated_grief",
    title: "Complicated grief after sudden loss (medium risk)",
    riskTag: "medium",
    description: "Practice grief-sensitive risk assessment.",
    brief:
      "Client lost a close family member suddenly and now expresses hopelessness. Goal: hold grief and assess danger directly.",
    opening: "After my brother died, life feels pointless. I keep replaying everything and I can't see a future.",
    profile: {
      title: "Acute grief with hopelessness and rumination",
      riskLevel: "Medium risk (dynamic; reassess each turn)",
      background: "40-year-old with recent bereavement, guilt rumination, reduced appetite, and limited sleep.",
      goals: [
        "Reflect grief and guilt accurately",
        "Assess risk without invalidating grief",
        "Build immediate grounding routine"
      ],
      redFlags: ["Persistent hopelessness", "Guilt rumination", "Sleep/appetite disruption"]
    }
  },
  {
    id: "lgbtq_rejection_family",
    title: "Family rejection and identity distress (high risk)",
    riskTag: "high",
    description: "Practice culturally sensitive, direct safety inquiry.",
    brief:
      "Client reports rejection and active conflict at home. Goal: establish safety quickly and identify safe contacts.",
    opening:
      "My family says I'd be better off gone. I feel trapped in that house and I don't know how long I can take it.",
    profile: {
      title: "Identity-based rejection with acute distress",
      riskLevel: "High risk (safety planning required)",
      background: "19-year-old living at home, experiencing verbal hostility and fear of escalation.",
      goals: [
        "Build affirming alliance fast",
        "Assess immediate intent and means access",
        "Create practical same-day safety steps"
      ],
      redFlags: ["Hostile home environment", "Entrapment", "Escalating despair"]
    }
  },
  {
    id: "chronic_pain_hopelessness",
    title: "Chronic pain and hopelessness (medium-high risk)",
    riskTag: "high",
    description: "Practice integrating physical suffering with risk assessment.",
    brief:
      "Client has long-term pain and decreasing hope. Goal: keep empathy while clarifying dangerous thinking patterns.",
    opening: "Pain is there all day, every day. Sometimes I think ending everything would be the only real relief.",
    profile: {
      title: "Persistent pain with suicidal language",
      riskLevel: "Medium-high risk (needs structured assessment)",
      background: "47-year-old with chronic pain, job loss, and reduced daily functioning.",
      goals: [
        "Validate pain without reinforcing defeat",
        "Clarify ideation, intent, and timeframe",
        "Identify immediate reasons for living and supports"
      ],
      redFlags: ["Pain-related hopelessness", "Functional collapse", "Relief-seeking language"]
    }
  },
  {
    id: "substance_relapse_spike",
    title: "Relapse spike with self-harm thoughts (high risk)",
    riskTag: "high",
    description: "Practice dual-focus on substance risk and suicidal risk.",
    brief:
      "Client recently relapsed and reports impulsive dark thoughts. Goal: assess immediate danger and stabilize next 24 hours.",
    opening:
      "I used again last night and now I hate myself. When I'm like this, I do stupid things and don't care what happens.",
    profile: {
      title: "Recent relapse with impulsivity",
      riskLevel: "High risk (close monitoring and referral readiness)",
      background: "28-year-old with prior sobriety period, recent relapse, shame, and poor impulse control.",
      goals: [
        "Assess intoxication/withdrawal context",
        "Check self-harm risk directly",
        "Set concrete immediate containment steps"
      ],
      redFlags: ["Impulsivity", "Shame spiral", "Loss of control statements"]
    }
  },
  {
    id: "older_adult_loneliness",
    title: "Late-life loneliness and burden beliefs (low-medium risk)",
    riskTag: "low",
    description: "Practice exploring burden beliefs and protective anchors.",
    brief:
      "Client feels like a burden and disconnected. Goal: assess risk and strengthen social/protective links.",
    opening:
      "My kids are busy, and I don't want to bother anyone. Some days I wonder if people would be better off without me.",
    profile: {
      title: "Older adult with loneliness and burden thoughts",
      riskLevel: "Low-medium risk (ongoing monitoring)",
      background: "67-year-old living alone after retirement, reduced routine, and growing social isolation.",
      goals: [
        "Explore burden beliefs gently",
        "Assess ideation and intent clearly",
        "Activate practical connection points"
      ],
      redFlags: ["Burden narrative", "Isolation", "Loss of routine"]
    }
  },
  {
    id: "international_student_visa_stress",
    title: "Visa stress and academic panic (medium risk)",
    riskTag: "medium",
    description: "Practice high-pressure problem framing with safety checks.",
    brief:
      "Client is under severe immigration and academic pressure. Goal: reduce panic, assess risk, and sequence next steps.",
    opening:
      "If I fail this term, I could lose my visa. I feel trapped and I've started thinking about ending it all.",
    profile: {
      title: "International student in acute pressure cycle",
      riskLevel: "Medium risk (watch for rapid escalation)",
      background: "24-year-old student facing visa uncertainty, financial stress, and limited local support.",
      goals: [
        "Stabilize panic enough for assessment",
        "Assess risk detail and immediacy",
        "Build short, concrete support actions"
      ],
      redFlags: ["Entrapment", "Catastrophic thinking", "Limited support access"]
    }
  }
];

function riskTone(level: string) {
  const value = level.toLowerCase();
  if (value.includes("high")) return "high";
  if (value.includes("medium")) return "mid";
  return "low";
}


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

type RoundSnapshot = {
  round: number;
  userMessage: string;
  clientMessage: string;
  coach: RoundCoach;
};

const emptyRoundCoach: RoundCoach = {
  summary: "Waiting for first round...",
  suggestion: "Start with empathy, then ask one clear open-ended question.",
  recommended_options: [
    "I'm glad you reached out. Can you tell me what feels hardest right now?",
    "I want to understand your safety. Have thoughts of hurting yourself come up today?",
    "Who is one person we can involve with you tonight for support?"
  ],
  emotion: "Not enough data yet",
  crisis_level: "Low",
  technique_used: "A. Fostering Engagement / Rapport",
  current_turn_feedback: {
    did_well: "N/A - session start",
    needs_improvement: "N/A - session start"
  },
  skill_scores: {
    empathy: 0,
    active_listening: 0,
    risk_assessment: 0,
    safety_planning: 0,
    problem_solving: 0
  }
};

export default function Home() {
  const [selectedCaseId, setSelectedCaseId] = useState<string>("random");
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [sessionIsBlind, setSessionIsBlind] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionReport, setSessionReport] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showProfile, setShowProfile] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [lastReplySource, setLastReplySource] = useState<ReplySource>("unknown");
  const [lastTrace, setLastTrace] = useState("");
  const [roundHistory, setRoundHistory] = useState<RoundSnapshot[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [roundLoading, setRoundLoading] = useState(false);
  const [roundError, setRoundError] = useState("");
  const [copiedOptionIndex, setCopiedOptionIndex] = useState<number | null>(null);
  const [polishLoading, setPolishLoading] = useState(false);
  const [polishedDraft, setPolishedDraft] = useState("");
  const [polishError, setPolishError] = useState("");
  const [copiedPolished, setCopiedPolished] = useState(false);

  const selectedCase = useMemo(
    () => caseTemplates.find((item) => item.id === selectedCaseId) ?? caseTemplates[0],
    [selectedCaseId]
  );

  const activeCase = useMemo(
    () => caseTemplates.find((item) => item.id === activeCaseId) ?? null,
    [activeCaseId]
  );

  const canSend = useMemo(
    () => input.trim().length > 0 && !loading && Boolean(activeCase) && !sessionEnded,
    [activeCase, input, loading, sessionEnded]
  );

  const canPolish = useMemo(
    () => input.trim().length > 0 && !loading && !polishLoading && Boolean(activeCase) && !sessionEnded,
    [activeCase, input, loading, polishLoading, sessionEnded]
  );

  const counselorTurns = useMemo(() => messages.filter((item) => item.role === "user").length, [messages]);

  const canEndSession = useMemo(
    () => Boolean(activeCase) && counselorTurns >= 1 && !loading && !reportLoading && !sessionEnded,
    [activeCase, counselorTurns, loading, reportLoading, sessionEnded]
  );

  const latestRoundCoach = useMemo(
    () => (roundHistory.length ? roundHistory[roundHistory.length - 1].coach : emptyRoundCoach),
    [roundHistory]
  );

  const displayedRound = useMemo(() => {
    if (!roundHistory.length) return null;
    if (selectedRound === null) return roundHistory[roundHistory.length - 1];
    return roundHistory.find((item) => item.round === selectedRound) ?? roundHistory[roundHistory.length - 1];
  }, [roundHistory, selectedRound]);

  const displayedRoundCoach = displayedRound?.coach ?? latestRoundCoach;

  const annotatedMessages = useMemo(() => {
    const withFeedback = new Set(roundHistory.map((item) => item.round));
    const techniqueByRound = new Map(roundHistory.map((item) => [item.round, item.coach.technique_used]));
    let round = 0;
    return messages.map((message, index) => {
      if (message.role === "user") {
        round += 1;
        return {
          message,
          index,
          round,
          clickable: withFeedback.has(round),
          technique: techniqueByRound.get(round) || null
        };
      }

      if (round === 0) {
        return { message, index, round: null as number | null, clickable: false, technique: null };
      }

      return { message, index, round, clickable: withFeedback.has(round), technique: null };
    });
  }, [messages, roundHistory]);

  async function onCopyOption(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedOptionIndex(index);
      setTimeout(() => setCopiedOptionIndex(null), 1200);
    } catch {
      setCopiedOptionIndex(null);
    }
  }

  async function onCopyPolished() {
    if (!polishedDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(polishedDraft);
      setCopiedPolished(true);
      setTimeout(() => setCopiedPolished(false), 1200);
    } catch {
      setCopiedPolished(false);
    }
  }

  async function generateRoundFeedback(
    fullMessages: ChatMessage[],
    caseProfile: CaseProfile,
    previousSummary: string,
    round: number,
    userMessage: string,
    clientMessage: string
  ) {
    setRoundLoading(true);
    setRoundError("");
    try {
      const roundRes = await fetch("/api/round-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: fullMessages,
          caseProfile,
          previousFeedback: previousSummary
        })
      });

      if (!roundRes.ok) {
        const err = await roundRes.json().catch(() => ({}));
        throw new Error(err?.error || "Round feedback request failed");
      }

      const roundData = (await roundRes.json()) as { coach: RoundCoach };
      const coach = roundData.coach || emptyRoundCoach;
      setRoundHistory((prev) => {
        const next = prev.filter((item) => item.round !== round);
        next.push({ round, userMessage, clientMessage, coach });
        next.sort((a, b) => a.round - b.round);
        return next;
      });
      setSelectedRound(round);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setRoundError(message);
    } finally {
      setRoundLoading(false);
    }
  }

  function startSession() {
    const randomMode = selectedCaseId === "random";
    const sessionCase = randomMode
      ? caseTemplates[Math.floor(Math.random() * caseTemplates.length)]
      : selectedCase;
    setActiveCaseId(sessionCase.id);
    setSessionIsBlind(randomMode);
    setMessages([{ role: "assistant", content: sessionCase.opening }]);
    setInput("");
    setSessionEnded(false);
    setSessionReport("");
    setLastReplySource("unknown");
    setLastTrace("");
    setRoundHistory([]);
    setSelectedRound(null);
    setRoundError("");
    setPolishedDraft("");
    setPolishError("");
    setCopiedPolished(false);
  }

  function resetSession() {
    setActiveCaseId(null);
    setMessages([]);
    setInput("");
    setSessionEnded(false);
    setSessionReport("");
    setShowProfile(false);
    setSessionIsBlind(false);
    setLastReplySource("unknown");
    setLastTrace("");
    setRoundHistory([]);
    setSelectedRound(null);
    setRoundError("");
    setPolishedDraft("");
    setPolishError("");
    setCopiedPolished(false);
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!canSend || !activeCase) return;

    const nextUser: ChatMessage = { role: "user", content: input.trim() };
    const nextMessages = [...messages, nextUser];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setSessionReport("");
    setPolishedDraft("");
    setPolishError("");
    setCopiedPolished(false);

    try {
      const res = await fetch("/api/roleplay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: nextMessages,
          caseProfile: activeCase.profile
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Request failed");
      }

      const data = (await res.json()) as {
        reply: string;
        meta?: {
          source?: "model";
          calledApi?: boolean;
          trace?: string[];
          model?: string;
          endpoint?: string;
          finishReason?: string;
          retried?: boolean;
        };
      };

      const assistantReply = data.reply || "No reply generated.";
      const fullMessages = [...nextMessages, { role: "assistant" as const, content: assistantReply }];
      const round = fullMessages.filter((item) => item.role === "user").length;
      setMessages(fullMessages);
      setLastReplySource(data.meta?.source || "model");
      setLastTrace(
        data.meta?.calledApi
          ? `calledApi:true${data.meta?.model ? ` | model:${data.meta.model}` : ""}${
              data.meta?.endpoint ? ` | endpoint:${data.meta.endpoint}` : ""
            }${data.meta?.finishReason ? ` | finishReason:${data.meta.finishReason}` : ""}${
              typeof data.meta?.retried === "boolean" ? ` | retried:${String(data.meta.retried)}` : ""
            }${data.meta?.trace?.length ? ` | ${data.meta.trace.join(" | ")}` : ""}`
          : "calledApi:false"
      );

      void generateRoundFeedback(
        fullMessages,
        activeCase.profile,
        latestRoundCoach.summary,
        round,
        nextUser.content,
        assistantReply
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setMessages((prev) => [...prev, { role: "assistant", content: `System error: ${message}` }]);
      setLastReplySource("unknown");
      setLastTrace(`error:${message}`);
    } finally {
      setLoading(false);
    }
  }

  async function onPolishDraft() {
    if (!canPolish || !activeCase) return;
    setPolishLoading(true);
    setPolishError("");
    setCopiedPolished(false);
    try {
      const res = await fetch("/api/polish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          draft: input.trim(),
          messages,
          caseProfile: activeCase.profile
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Draft polish request failed");
      }

      const data = (await res.json()) as { polished?: string };
      const polished = String(data.polished || "").trim();
      if (!polished) {
        throw new Error("No polished response returned.");
      }
      setPolishedDraft(polished);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setPolishError(message);
      setPolishedDraft("");
    } finally {
      setPolishLoading(false);
    }
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSend(e);
    }
  }

  async function onEndSessionAndGenerateReport() {
    if (!activeCase || !canEndSession) return;
    setReportLoading(true);
    setSessionEnded(true);

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages,
          caseProfile: activeCase.profile,
          quickFeedback: `${latestRoundCoach.summary} | ${latestRoundCoach.suggestion}`
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Session report generation failed");
      }

      const data = (await res.json()) as { report: string };
      setSessionReport(data.report || "Session report generation failed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setSessionReport(`Session report failed: ${message}`);
      setSessionEnded(false);
    } finally {
      setReportLoading(false);
    }
  }

  function onDownloadReport() {
    if (!sessionReport.trim() || !activeCase) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeCaseId = activeCase.id.replace(/[^a-z0-9_-]/gi, "_");
    const fileName = `session-report-${safeCaseId}-${stamp}.doc`;
    const escapedReport = sessionReport
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
    const docHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Session Report</title></head><body><h1>Session Report</h1><p>${escapedReport}</p></body></html>`;
    const blob = new Blob([docHtml], { type: "application/msword;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const skillItems = [
    { key: "empathy", label: "Empathy", value: displayedRoundCoach.skill_scores.empathy, tone: "blue" },
    {
      key: "active_listening",
      label: "Active Listening",
      value: displayedRoundCoach.skill_scores.active_listening,
      tone: "indigo"
    },
    {
      key: "risk_assessment",
      label: "Risk Assessment",
      value: displayedRoundCoach.skill_scores.risk_assessment,
      tone: "red"
    },
    {
      key: "safety_planning",
      label: "Safety Planning",
      value: displayedRoundCoach.skill_scores.safety_planning,
      tone: "green"
    },
    {
      key: "problem_solving",
      label: "Problem Solving",
      value: displayedRoundCoach.skill_scores.problem_solving,
      tone: "purple"
    }
  ] as const;

  return (
    <div className="demo-shell ct-shell">
      <header className="window-bar">
        <div className="window-left">
          <button type="button" className="icon-button" aria-label="Close">
            ×
          </button>
          <p className="window-title">CrisisTutor</p>
        </div>
        <div className="window-right">
          <label className="switch-row">
            <input
              type="checkbox"
              checked={showDebugPanel}
              onChange={(e) => setShowDebugPanel(e.target.checked)}
            />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
            <span>Debug panel</span>
          </label>
          <button type="button" className="light-button" onClick={resetSession}>
            Reset
          </button>
        </div>
      </header>

      <main className="demo-main ct-main">
        {!activeCase ? (
          <section className="panel">
            <h2>Select a training scenario</h2>
            <p className="panel-sub">Choose one client profile to start this training run.</p>

            <div className="scenario-picker">
              <label htmlFor="scenario-select">Client scenario</label>
              <select id="scenario-select" value={selectedCaseId} onChange={(e) => setSelectedCaseId(e.target.value)}>
                <option value="random">Random (Blind training mode)</option>
                {caseTemplates.map((item, idx) => (
                  <option key={item.id} value={item.id}>
                    {idx + 1}. {item.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="selected-scenario">
              <div className="scenario-head">
                <h3>{selectedCaseId === "random" ? "Random client will be selected at session start" : selectedCase.title}</h3>
                {selectedCaseId === "random" ? (
                  <span className="risk-badge mid">blind</span>
                ) : (
                  <span className={`risk-badge ${riskTone(selectedCase.profile.riskLevel)}`}>{selectedCase.riskTag}</span>
                )}
              </div>
              <p>
                {selectedCaseId === "random"
                  ? "Client details will be hidden during session to simulate realistic uncertainty."
                  : selectedCase.description}
              </p>
            </div>

            <div className="trainer-brief">
              <h4>Trainer brief</h4>
              <p>{selectedCaseId === "random" ? "Brief hidden in blind mode." : selectedCase.brief}</p>
            </div>

            {showProfile && selectedCaseId !== "random" ? (
              <div className="profile-box">
                <h4>Client profile</h4>
                <p>
                  <strong>Theme:</strong> {selectedCase.profile.title}
                </p>
                <p>
                  <strong>Risk level:</strong> {selectedCase.profile.riskLevel}
                </p>
                <p>
                  <strong>Background:</strong> {selectedCase.profile.background}
                </p>
                <p>
                  <strong>Training goals:</strong> {selectedCase.profile.goals.join(", ")}
                </p>
              </div>
            ) : null}

            <div className="panel-actions">
              <p className="notice">Training simulation only. Not a crisis response service.</p>
              <button
                type="button"
                className="light-button"
                onClick={() => setShowProfile((v) => !v)}
                disabled={selectedCaseId === "random"}
              >
                {selectedCaseId === "random"
                  ? "Profile hidden in random mode"
                  : showProfile
                    ? "Hide client profile"
                    : "View client profile"}
              </button>
            </div>

            <button type="button" className="primary-button" onClick={startSession}>
              Start this session
            </button>
          </section>
        ) : (
          <section className="ct-layout">
            <aside className="ct-left">
              <div className="ct-brand panel">
                <h2>CrisisTutor</h2>
                <p className="panel-sub">AI-based training workspace</p>
              </div>

              <div className="panel ct-card">
                <h3>Practice Session</h3>
                <div className="ct-session-pill active">
                  <strong>Current</strong>
                  <span>{sessionIsBlind ? "Hidden profile (random mode)" : activeCase.title}</span>
                </div>
              </div>

              <div className="panel ct-card">
                <h3>Overall Performance</h3>
                <p>{displayedRoundCoach.summary}</p>
                <p className="panel-sub">Emotion: {displayedRoundCoach.emotion}</p>
                <p className="panel-sub">Crisis Level: {displayedRoundCoach.crisis_level}</p>
                <p className="panel-sub">Technique: {displayedRoundCoach.technique_used}</p>
                <p className="panel-sub">
                  Viewing: {displayedRound ? `Round ${displayedRound.round}` : "Latest"}
                  {selectedRound !== null ? " (selected)" : ""}
                </p>
                {roundLoading ? <p className="panel-sub">Updating this round...</p> : null}
                {roundError ? <p className="ct-error">Round feedback error: {roundError}</p> : null}
              </div>

              <div className="panel ct-card">
                <h3>Skill Stats</h3>
                <div className="ct-skills">
                  {skillItems.map((item) => (
                    <div key={item.key} className="ct-skill-row">
                      <div className="ct-skill-head">
                        <span>{item.label}</span>
                        <strong>{item.value}%</strong>
                      </div>
                      <div className="ct-progress">
                        <span className={`ct-progress-fill ${item.tone}`} style={{ width: `${item.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <div className="ct-center panel">
              <div className="ct-chat-head">
                <div>
                  <h2>Anonymous Texter</h2>
                  <p className="panel-sub">Online · Simulated crisis</p>
                </div>
                {sessionIsBlind ? null : (
                  <span className={`risk-badge ${riskTone(activeCase.profile.riskLevel)}`}>{activeCase.riskTag}</span>
                )}
              </div>

              <p className="mode-indicator live">
                Live API · last source:
                {lastReplySource === "model" && " model output"}
                {lastReplySource === "unknown" && " n/a"}
              </p>
              {lastTrace ? <p className="trace-line">Trace: {lastTrace}</p> : null}

              <div className="chat-wrap ct-chat-wrap">
                <div className="chat-log">
                  {annotatedMessages.map(({ message, index, round, clickable, technique }) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`bubble ${message.role}${clickable ? " clickable" : ""}${
                        round !== null && selectedRound === round ? " selected" : ""
                      }`}
                      onClick={() => {
                        if (round !== null && clickable) setSelectedRound(round);
                      }}
                    >
                      <strong>{message.role === "assistant" ? "Client" : "Counselor"}:</strong> {message.content}
                      {round !== null ? <span className="bubble-round">Round {round}</span> : null}
                      {message.role === "user" && technique ? <span className="tech-tag">{technique}</span> : null}
                    </div>
                  ))}
                </div>

                <form className="chat-controls" onSubmit={onSend}>
                  <textarea
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      setPolishError("");
                    }}
                    onKeyDown={onInputKeyDown}
                    placeholder="Type your response..."
                    disabled={sessionEnded}
                  />
                  <button type="submit" className="primary-button mini" disabled={!canSend}>
                    {loading ? "Sending..." : "Send"}
                  </button>
                </form>
                <div className="draft-tools">
                  <button type="button" className="light-button polish-btn" onClick={() => void onPolishDraft()} disabled={!canPolish}>
                    {polishLoading ? "Polishing..." : "Polish current draft"}
                  </button>
                  <p className="panel-sub">AI will refine your typed draft below without replacing your original text.</p>
                </div>
                {polishError ? <p className="ct-error draft-error">Draft polish error: {polishError}</p> : null}
                {polishedDraft ? (
                  <div className="draft-polish-result">
                    <div className="draft-polish-head">
                      <h4>Polished response</h4>
                      <button type="button" className="copy-btn" onClick={() => void onCopyPolished()}>
                        {copiedPolished ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p>{polishedDraft}</p>
                  </div>
                ) : null}
              </div>

              <div className="session-end-row">
                <button
                  type="button"
                  className="light-button"
                  onClick={onEndSessionAndGenerateReport}
                  disabled={!canEndSession}
                >
                  {reportLoading ? "Generating full report..." : "End session and generate full report"}
                </button>
                <p className="panel-sub">
                  Counselor turns: {counselorTurns}
                  {selectedRound !== null ? ` | Viewing round ${selectedRound}` : " | Viewing latest"}
                  {sessionEnded ? " | Session ended" : ""}
                </p>
              </div>
            </div>

            <aside className="ct-right">
              <div className="panel ct-card ct-accent dark">
                <h3>Summary & Conceptualization</h3>
                <p>{displayedRoundCoach.summary}</p>
              </div>

              <div className="panel ct-card ct-accent gold">
                <h3>Suggestion</h3>
                <p>{displayedRoundCoach.suggestion}</p>
              </div>

              <div className="panel ct-card ct-accent purple">
                <h3>Recommended Options</h3>
                <ul className="ct-options">
                  {displayedRoundCoach.recommended_options.map((option, idx) => (
                    <li key={`${option}-${idx}`}>
                      <span>{option}</span>
                      <button
                        type="button"
                        className="copy-btn"
                        onClick={() => void onCopyOption(option, idx)}
                        title="Copy script"
                      >
                        {copiedOptionIndex === idx ? "Copied" : "Copy"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="panel ct-card ct-accent blue">
                <h3>Feedback on This Turn</h3>
                <p>
                  <strong>Did well:</strong> {displayedRoundCoach.current_turn_feedback.did_well}
                </p>
                <p>
                  <strong>Needs improvement:</strong> {displayedRoundCoach.current_turn_feedback.needs_improvement}
                </p>
              </div>

              {sessionReport ? (
                <div className="panel ct-card">
                  <h3>Full Session Report</h3>
                  <pre className="feedback">{sessionReport}</pre>
                  <button type="button" className="light-button" onClick={onDownloadReport}>
                    Download report (.doc)
                  </button>
                </div>
              ) : null}
            </aside>
          </section>
        )}

        {showDebugPanel ? (
          <pre className="panel debug-panel">{`selectedCaseId: ${selectedCaseId}
activeCaseId: ${activeCaseId || "none"}
messageCount: ${messages.length}
lastReplySource: ${lastReplySource}
lastTrace: ${lastTrace || "none"}
roundHistoryCount: ${roundHistory.length}
selectedRound: ${selectedRound === null ? "latest" : selectedRound}
roundLoading: ${String(roundLoading)}
roundError: ${roundError || "none"}`}</pre>
        ) : null}
      </main>
    </div>
  );
}
