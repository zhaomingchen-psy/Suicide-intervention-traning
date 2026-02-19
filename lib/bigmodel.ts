import { getModelConfig } from "./model";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatOptions = {
  temperature: number;
  maxTokens: number;
};

type CreateChatResult = {
  text: string;
  finishReason: string;
};

function joinContentParts(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object") {
          const node = part as Record<string, unknown>;
          if (typeof node.text === "string") {
            return node.text;
          }
          if (typeof node.content === "string") {
            return node.content;
          }
        }

        return "";
      })
      .join("")
      .trim();

    return text;
  }

  return "";
}

function extractModelText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const data = payload as Record<string, unknown>;
  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") {
    return "";
  }

  const choice = firstChoice as Record<string, unknown>;
  const message = choice.message as Record<string, unknown> | undefined;

  const contentText = joinContentParts(message?.content);
  if (contentText) {
    return contentText;
  }

  if (typeof message?.refusal === "string" && message.refusal.trim()) {
    return `Model refusal: ${message.refusal.trim()}`;
  }

  const delta = choice.delta as Record<string, unknown> | undefined;
  if (typeof delta?.content === "string" && delta.content.trim()) {
    return delta.content.trim();
  }

  return "";
}

function extractProviderError(status: number, payload: unknown): string {
  if (payload && typeof payload === "object") {
    const data = payload as Record<string, unknown>;
    const error = data.error as Record<string, unknown> | undefined;
    if (typeof error?.message === "string" && error.message.trim()) {
      return `Model API error: ${error.message.trim()}`;
    }
    if (typeof data.message === "string" && data.message.trim()) {
      return `Model API error: ${data.message.trim()}`;
    }
    if (typeof data.msg === "string" && data.msg.trim()) {
      return `Model API error: ${data.msg.trim()}`;
    }
  }

  return `Model API request failed (HTTP ${status})`;
}

function extractFinishReason(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "unknown";
  }

  const data = payload as Record<string, unknown>;
  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "unknown";
  }

  const first = choices[0];
  if (!first || typeof first !== "object") {
    return "unknown";
  }

  const choice = first as Record<string, unknown>;
  if (typeof choice.finish_reason === "string" && choice.finish_reason.trim()) {
    return choice.finish_reason.trim();
  }

  return "unknown";
}

export async function createChatCompletion(messages: ChatMessage[], options: ChatOptions) {
  const { apiKey, model, baseURL } = getModelConfig();
  if (!apiKey) {
    throw new Error("Missing BIGMODEL_API_KEY (or OPENAI_API_KEY).");
  }

  const endpoint = `${baseURL.replace(/\/+$/, "")}/api/paas/v4/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractProviderError(response.status, payload));
  }

  const text = extractModelText(payload);
  const finishReason = extractFinishReason(payload);
  if (!text) {
    throw new Error(`Model returned empty content (finish_reason: ${finishReason})`);
  }

  return text;
}

export async function createChatCompletionWithMeta(
  messages: ChatMessage[],
  options: ChatOptions
): Promise<CreateChatResult> {
  const { apiKey, model, baseURL } = getModelConfig();
  if (!apiKey) {
    throw new Error("Missing BIGMODEL_API_KEY (or OPENAI_API_KEY).");
  }

  const endpoint = `${baseURL.replace(/\/+$/, "")}/api/paas/v4/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractProviderError(response.status, payload));
  }

  const text = extractModelText(payload);
  const finishReason = extractFinishReason(payload);
  if (!text) {
    throw new Error(`Model returned empty content (finish_reason: ${finishReason})`);
  }

  return { text, finishReason };
}
