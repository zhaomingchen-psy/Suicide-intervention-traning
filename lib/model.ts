export function getModelConfig() {
  const apiKey = process.env.BIGMODEL_API_KEY || process.env.OPENAI_API_KEY;
  const model = process.env.BIGMODEL_MODEL || process.env.OPENAI_MODEL || "GLM-4.7-FlashX";
  const baseURL = process.env.BIGMODEL_BASE_URL || "https://open.bigmodel.cn";

  return { apiKey, model, baseURL };
}
