import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { format, resolveConfig } from 'prettier';

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

/** Writes JSON formatted with the repo's Prettier config, so `pnpm format:check` stays green. */
export async function writeJsonFormatted(file: string, data: unknown): Promise<void> {
  mkdirSync(dirname(file), { recursive: true });
  const config = (await resolveConfig(file)) ?? {};
  const text = await format(JSON.stringify(data), { ...config, filepath: file });
  writeFileSync(file, text);
}

export function writeText(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
