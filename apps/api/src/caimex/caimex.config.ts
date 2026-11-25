import { registerAs } from '@nestjs/config';

export default registerAs('caimex', () => ({
  apiKey: process.env.CAIMEX_API_KEY ?? '',
  baseUrl: process.env.CAIMEX_BASE_URL ?? 'https://api.caimex.ai/v1',
  agentModel: process.env.CAIMEX_AGENT_MODEL ?? 'caimex/auto',
  extractionModel: process.env.CAIMEX_EXTRACTION_MODEL ?? 'gemini-3.6-flash',
  timeoutMs: Number(process.env.CAIMEX_TIMEOUT_MS ?? 60_000),
}));
