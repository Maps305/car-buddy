import 'dotenv/config';
import OpenAI from 'openai';

async function main() {
  const client = new OpenAI({
    baseURL: process.env.CAIMEX_BASE_URL ?? 'https://api.caimex.ai/v1',
    apiKey: process.env.CAIMEX_API_KEY,
  });
  const filter = process.argv[2]?.toLowerCase();
  for await (const model of client.models.list()) {
    if (!filter || model.id.toLowerCase().includes(filter)) console.log(model.id);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
