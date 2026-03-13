export type ChatProvider = "bigmodel" | "deepseek";

export type ChatProviderConfig = {
  provider: ChatProvider;
  apiKey: string;
  model: string;
  baseURL: string;
  endpointPath: string;
};

export function getBigModelConfig(): ChatProviderConfig {
  return {
    provider: "bigmodel",
    apiKey: process.env.BIGMODEL_API_KEY || process.env.OPENAI_API_KEY || "",
    model: process.env.BIGMODEL_MODEL || process.env.OPENAI_MODEL || "GLM-4.7-FlashX",
    baseURL: process.env.BIGMODEL_BASE_URL || "https://open.bigmodel.cn",
    endpointPath: "/api/paas/v4/chat/completions"
  };
}

export function getDeepSeekConfig(): ChatProviderConfig {
  return {
    provider: "deepseek",
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    endpointPath: "/chat/completions"
  };
}

export function getRoleplayModelConfig() {
  return getBigModelConfig();
}

export function getFeedbackModelConfig() {
  return getDeepSeekConfig();
}
