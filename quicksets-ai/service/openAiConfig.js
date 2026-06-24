const fs = require('fs');
const path = require('path');

function readLocalOpenAiApiKey() {
  try {
    const configPath = path.join(__dirname, 'openaiConfig.local.json');
    if (!fs.existsSync(configPath)) {
      return '';
    }

    const rawConfig = fs.readFileSync(configPath, 'utf8');
    const parsedConfig = JSON.parse(rawConfig);
    return typeof parsedConfig?.apiKey === 'string' ? parsedConfig.apiKey.trim() : '';
  } catch (_error) {
    return '';
  }
}

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY || readLocalOpenAiApiKey();
}

function createOpenAiClient(apiKey = getOpenAiApiKey()) {
  if (!apiKey) {
    throw new Error('Set OPENAI_API_KEY or add service/openaiConfig.local.json');
  }

  const OpenAI = require('openai');
  return new OpenAI({ apiKey });
}

function extractOpenAiTextResponse(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const textContent = Array.isArray(response?.output)
    ? response.output
      .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
      .find((part) => typeof part?.text === 'string' && part.text.trim())
    : null;

  return textContent?.text?.trim() || '';
}

module.exports = {
  createOpenAiClient,
  extractOpenAiTextResponse,
  getOpenAiApiKey,
};
