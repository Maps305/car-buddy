import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export interface StoredMedia {
  key: string;
  mimeType: string;
  bytes: number;
  sha256: string;
}

export abstract class MediaStore {
  abstract save(data: Buffer, mimeType: string, prefix: string): Promise<StoredMedia>;
  abstract read(key: string): Promise<Buffer>;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
};

@Injectable()
export class LocalMediaStore extends MediaStore {
  private readonly root = resolve(process.env.MEDIA_DIR ?? './storage/media');

  async save(data: Buffer, mimeType: string, prefix: string): Promise<StoredMedia> {
    const sha256 = createHash('sha256').update(data).digest('hex');
    const ext = EXTENSIONS[mimeType.split(';')[0].trim()] ?? 'bin';
    const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${sha256.slice(0, 16)}.${ext}`;
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return { key, mimeType, bytes: data.length, sha256 };
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  private pathFor(key: string): string {
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root)) throw new Error(`Invalid media key: ${key}`);
    return path;
  }
}
