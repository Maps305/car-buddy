import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { z } from 'zod';
import caimexConfig from './caimex.config';

export interface MediaInput {
  data: Buffer;
  mimeType: string;
  filename?: string;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
}

export class CaimexOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
  }
}

type ParseResult<T> = { success: true; data: T } | { success: false; error: string };

type JsonMode = 'json_schema' | 'json_object' | 'plain';
const JSON_MODES: JsonMode[] = ['json_schema', 'json_object', 'plain'];

export function describeCaimexError(err: unknown): string {
  if (err instanceof OpenAI.APIError) {
    const body = err.error ? ` ${JSON.stringify(err.error)}` : '';
    return `${err.message}${body}`;
  }
  return err instanceof Error ? err.message : String(err);
}

@Injectable()
export class CaimexService {
  private readonly logger = new Logger(CaimexService.name);
  private readonly client: OpenAI;
  private readonly jsonModeFloor = new Map<string, number>();

  constructor(@Inject(caimexConfig.KEY) private readonly config: ConfigType<typeof caimexConfig>) {
    if (!config.apiKey) throw new Error('CAIMEX_API_KEY is not set');
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      maxRetries: 2,
    });
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    opts: { model?: string; tools?: ChatCompletionTool[]; temperature?: number } = {},
  ): Promise<ChatCompletionMessage> {
    const res = await this.client.chat.completions.create({
      model: opts.model ?? this.config.agentModel,
      messages,
      tools: opts.tools,
      temperature: opts.temperature ?? 0.3,
    });
    return res.choices[0].message;
  }

  mediaPart(media: MediaInput): ChatCompletionContentPart {
    const dataUrl = `data:${media.mimeType};base64,${media.data.toString('base64')}`;
    if (media.mimeType === 'application/pdf') {
      return { type: 'file', file: { file_data: dataUrl, filename: media.filename ?? 'document.pdf' } };
    }
    if (!media.mimeType.startsWith('image/')) {
      throw new Error(`Unsupported media type: ${media.mimeType}`);
    }
    return { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } };
  }

  async extractStructured<S extends z.ZodType>(args: {
    schema: S;
    schemaName: string;
    system: string;
    instruction: string;
    media: MediaInput[];
    model?: string;
  }): Promise<StructuredResult<z.infer<S>>> {
    const model = args.model ?? this.config.extractionModel;
    const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(args.schema) as Record<string, unknown>;
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: args.system },
      {
        role: 'user',
        content: [{ type: 'text', text: args.instruction }, ...args.media.map((m) => this.mediaPart(m))],
      },
    ];

    let raw = await this.completeJson(model, messages, args.schemaName, jsonSchema);
    let parsed = this.parse(args.schema, raw);
    if (parsed.success) return { data: parsed.data, model };

    this.logger.warn(`${args.schemaName}: output failed validation, retrying once`);
    messages.push(
      { role: 'assistant', content: raw },
      { role: 'user', content: `That JSON failed validation:\n${parsed.error}\nReturn the corrected JSON only.` },
    );
    raw = await this.completeJson(model, messages, args.schemaName, jsonSchema);
    parsed = this.parse(args.schema, raw);
    if (parsed.success) return { data: parsed.data, model };

    throw new CaimexOutputError(`${args.schemaName}: model output failed validation: ${parsed.error}`, raw);
  }

  private async completeJson(
    model: string,
    messages: ChatCompletionMessageParam[],
    name: string,
    schema: Record<string, unknown>,
  ): Promise<string> {
    for (let i = this.jsonModeFloor.get(model) ?? 0; i < JSON_MODES.length; i++) {
      const mode = JSON_MODES[i];
      try {
        const res = await this.client.chat.completions.create(this.jsonRequest(mode, model, messages, name, schema));
        return res.choices[0].message.content ?? '';
      } catch (err) {
        const isLast = i === JSON_MODES.length - 1;
        if (!(err instanceof OpenAI.BadRequestError) || isLast) throw err;
        this.logger.warn(`${model} rejected ${mode} (${describeCaimexError(err)}); trying ${JSON_MODES[i + 1]}`);
        this.jsonModeFloor.set(model, i + 1);
      }
    }
    throw new Error('unreachable');
  }

  private jsonRequest(
    mode: JsonMode,
    model: string,
    messages: ChatCompletionMessageParam[],
    name: string,
    schema: Record<string, unknown>,
  ) {
    if (mode === 'json_schema') {
      return {
        model,
        messages,
        temperature: 0,
        response_format: { type: 'json_schema' as const, json_schema: { name, schema, strict: true } },
      };
    }
    return {
      model,
      temperature: 0,
      ...(mode === 'json_object' ? { response_format: { type: 'json_object' as const } } : {}),
      messages: [
        {
          role: 'system' as const,
          content: `Respond with a single JSON object only, no prose or code fences, matching this JSON Schema:\n${JSON.stringify(schema)}`,
        },
        ...messages,
      ],
    };
  }

  private parse<S extends z.ZodType>(schema: S, raw: string): ParseResult<z.infer<S>> {
    const text = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { success: false, error: 'Response was not valid JSON' };
    }
    const result = schema.safeParse(json);
    return result.success
      ? { success: true, data: result.data }
      : { success: false, error: z.prettifyError(result.error) };
  }
}
