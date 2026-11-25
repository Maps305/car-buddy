import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { ExtractionModule } from '../src/extraction/extraction.module';
import { ExtractionService } from '../src/extraction/extraction.service';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), ExtractionModule] })
class SmokeModule {}

async function main() {
  const [insuredRegistration, ...files] = process.argv.slice(2);
  if (!insuredRegistration || files.length === 0) {
    console.error('Usage: npm run smoke:extract -- "ABC 1234" page1.jpg [page2.jpg ...]');
    process.exit(1);
  }

  const pages = await Promise.all(
    files.map(async (file) => {
      const mimeType = MIME[extname(file).toLowerCase()];
      if (!mimeType) throw new Error(`Unsupported file type: ${file}`);
      return { data: await readFile(file), mimeType, filename: basename(file) };
    }),
  );

  const app = await NestFactory.createApplicationContext(SmokeModule, { logger: ['warn', 'error'] });
  const started = Date.now();
  const result = await app.get(ExtractionService).extractPoliceReport(pages, { insuredRegistration });
  console.log(JSON.stringify(result, null, 2));
  console.error(`\n${result.model} took ${Date.now() - started} ms; needsHumanReview=${result.review.needsHumanReview}`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
