/**
 * Info-card illustrations (docs/images.md).
 *
 *   node scripts/nation-images.ts draft [--style pencil|flat] [--force]
 *     Writes data/image-prompts.json: a landscape prompt and alt text per nation. Existing entries are kept
 *     unless --force, so hand edits survive. No network.
 *
 *   node scripts/nation-images.ts generate --model <provider/model> [--ids N92,A43] [--limit 5]
 *       [--size 1024x1024] [--concurrency 3] [--redo] [--yes]
 *     Generates pictures through Vercel AI Gateway for nations that have a prompt and no picture yet,
 *     saves them as public/images/nations/<id>.webp and records alt text and credit in data/images.json.
 *     Without --yes it only prints the plan and the estimated cost. Needs AI_GATEWAY_API_KEY in the
 *     environment (or VERCEL_OIDC_TOKEN). Afterwards run `node scripts/build-nations.ts`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Nation, NationsFile } from '../src/types/nation.ts';
import { readJson, writeJsonFormatted } from './lib/io.ts';
import type {
  GatewayModel,
  ImageManifest,
  ImagePrompt,
  ImageStyle,
  PromptFile,
} from './lib/nation-images.ts';
import { buildImagePrompt, pricePerImage, seedFor } from './lib/nation-images.ts';
import { IMAGE_PROMPTS_FILE, IMAGES_DIR, IMAGES_FILE, NATIONS_FILE, todayAu } from './lib/paths.ts';

const MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';
/** Square source: the card crops a tall slice on desktop and a wide band on phones. */
const OUT_PX = 960;
const WEBP_QUALITY = 72;

const PROMPTS_COMMENT =
  'Prompt and alt text per nation for scripts/nation-images.ts. Edit any entry; `draft` keeps existing ' +
  'entries unless run with --force. Prompts never name the place (a named landmark may be a sacred site).';

function loadNations(): Nation[] {
  return readJson<NationsFile>(NATIONS_FILE).nations;
}

function isPrompt(v: PromptFile[string] | undefined): v is ImagePrompt {
  return typeof v === 'object' && v !== null && typeof v.prompt === 'string';
}

async function draft(style: ImageStyle, force: boolean) {
  const nations = loadNations();
  const existing = existsSync(IMAGE_PROMPTS_FILE) ? readJson<PromptFile>(IMAGE_PROMPTS_FILE) : {};
  const out: PromptFile = { _comment: PROMPTS_COMMENT };
  let added = 0;
  for (const n of [...nations].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
    const keep = existing[n.id];
    if (!force && isPrompt(keep)) {
      out[n.id] = keep;
    } else {
      out[n.id] = buildImagePrompt(n, style);
      added++;
    }
  }
  await writeJsonFormatted(IMAGE_PROMPTS_FILE, out);
  console.log(
    `[draft] ${nations.length} nations → data/image-prompts.json (${added} written, ${nations.length - added} kept)`,
  );
}

async function fetchModel(id: string): Promise<GatewayModel> {
  const res = await fetch(MODELS_URL);
  if (!res.ok) throw new Error(`GET ${MODELS_URL}: HTTP ${res.status}`);
  const { data } = (await res.json()) as { data: GatewayModel[] };
  const model = data.find((m) => m.id === id);
  if (!model) {
    const images = data.filter((m) => m.type === 'image').map((m) => m.id);
    throw new Error(
      `model "${id}" is not in AI Gateway's list. Image models:\n  ${images.join('\n  ')}`,
    );
  }
  if (model.type !== 'image') throw new Error(`model "${id}" is a ${model.type} model, not image`);
  return model;
}

interface GenerateOptions {
  model: string;
  ids?: string[];
  limit?: number;
  size: `${number}x${number}`;
  concurrency: number;
  redo: boolean;
  yes: boolean;
}

async function generate(opts: GenerateOptions) {
  const prompts = readJson<PromptFile>(IMAGE_PROMPTS_FILE);
  const manifest: ImageManifest = existsSync(IMAGES_FILE)
    ? readJson<ImageManifest>(IMAGES_FILE)
    : {};
  const known = new Set(loadNations().map((n) => n.id));
  for (const id of opts.ids ?? []) {
    if (!known.has(id)) throw new Error(`unknown nation id ${id}`);
    if (!isPrompt(prompts[id])) throw new Error(`${id} has no prompt; run draft first`);
  }

  let todo = (opts.ids ?? Object.keys(prompts).filter((k) => isPrompt(prompts[k])))
    .filter((id) => known.has(id))
    .filter((id) => opts.redo || !existsSync(join(IMAGES_DIR, `${id}.webp`)));
  if (opts.limit !== undefined) todo = todo.slice(0, opts.limit);

  const model = await fetchModel(opts.model);
  const each = pricePerImage(model, opts.size);
  const cost =
    each === null
      ? 'unknown (this model is priced per token; see its AI Gateway model page)'
      : `about US$${(each * todo.length).toFixed(2)} (US$${each} each at ${opts.size}, before any retries)`;
  console.log(`[generate] ${todo.length} picture(s) with ${opts.model}; cost ${cost}`);
  if (todo.length === 0) return;
  if (!opts.yes) {
    console.log(`  First ids: ${todo.slice(0, 10).join(', ')}${todo.length > 10 ? ', …' : ''}`);
    console.log('  Dry run. Add --yes to generate.');
    return;
  }
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error('set AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN) in the environment first');
  }

  // Loaded only here so `draft` and dry runs work without them.
  const { generateImage } = await import('ai');
  const { default: sharp } = await import('sharp');
  mkdirSync(IMAGES_DIR, { recursive: true });
  const date = todayAu();
  const failed: string[] = [];
  let done = 0;
  let saving = Promise.resolve();

  const queue = [...todo];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const p = prompts[id] as ImagePrompt;
      try {
        const { image } = await generateImage({
          model: opts.model,
          prompt: p.prompt,
          size: opts.size,
          seed: seedFor(id),
          abortSignal: AbortSignal.timeout(180_000),
        });
        const webp = await sharp(image.uint8Array)
          .resize(OUT_PX, OUT_PX, { fit: 'cover' })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();
        writeFileSync(join(IMAGES_DIR, `${id}.webp`), webp);
        const credit = `${styleNoun(p.prompt)} illustration, AI-generated with ${opts.model}, ${date}`;
        manifest[id] = { alt: p.alt, credit };
        // Save after each picture so an interrupted run can resume.
        saving = saving.then(() => writeManifest(manifest));
        await saving;
        console.log(`  ✓ ${id} (${++done}/${todo.length}, ${Math.round(webp.length / 1024)} KB)`);
      } catch (err) {
        failed.push(id);
        console.error(`  ✗ ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));

  console.log(
    `[generate] ${done} saved, ${failed.length} failed${failed.length ? `: ${failed.join(',')}` : ''}`,
  );
  if (done) console.log('  Next: node scripts/build-nations.ts && pnpm data:validate');
  if (failed.length) process.exitCode = 1;
}

function styleNoun(prompt: string): string {
  return prompt.startsWith('Flat') ? 'Flat' : 'Pencil';
}

async function writeManifest(manifest: ImageManifest) {
  const sorted: ImageManifest = {};
  for (const k of Object.keys(manifest).sort((a, b) =>
    a.startsWith('_') === b.startsWith('_') ? a.localeCompare(b, 'en') : a.startsWith('_') ? -1 : 1,
  )) {
    sorted[k] = manifest[k];
  }
  await writeJsonFormatted(IMAGES_FILE, sorted);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      style: { type: 'string', default: 'pencil' },
      force: { type: 'boolean', default: false },
      model: { type: 'string', default: process.env.AI_GATEWAY_MODEL },
      ids: { type: 'string' },
      limit: { type: 'string' },
      size: { type: 'string', default: '1024x1024' },
      concurrency: { type: 'string', default: '3' },
      redo: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
    },
  });
  const cmd = positionals[0];
  if (cmd === 'draft') {
    if (values.style !== 'pencil' && values.style !== 'flat')
      throw new Error('--style is pencil or flat');
    return draft(values.style, values.force);
  }
  if (cmd === 'generate') {
    if (!values.model)
      throw new Error('--model <provider/model> (or AI_GATEWAY_MODEL) is required');
    if (!/^\d+x\d+$/.test(values.size)) throw new Error('--size is WIDTHxHEIGHT, e.g. 1024x1024');
    return generate({
      model: values.model,
      ids: values.ids
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      limit: values.limit === undefined ? undefined : Number(values.limit),
      size: values.size as `${number}x${number}`,
      concurrency: Number(values.concurrency),
      redo: values.redo,
      yes: values.yes,
    });
  }
  console.error(
    'usage: node scripts/nation-images.ts draft|generate [options]  (see the file header)',
  );
  process.exitCode = 2;
}

try {
  await main();
} catch (err) {
  console.error(`[nation-images] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
