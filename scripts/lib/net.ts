export const USER_AGENT =
  'country-map-data-pipeline/1.0 (+https://github.com/DuliniMendis/map-demo; build-time only)';

export class HttpError extends Error {
  override name = 'HttpError';
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

const isRetryable = (err: unknown): boolean =>
  !(err instanceof HttpError) || err.status === 429 || err.status >= 500;

/** GET with timeout and exponential backoff (+ jitter) on network errors, 429 and 5xx. */
export async function fetchWithRetry(url: string, opts: RetryOptions = {}): Promise<Response> {
  const { attempts = 5, baseDelayMs = 500, timeoutMs = 30_000, headers = {} } = opts;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || i === attempts - 1) break;
      await sleep(baseDelayMs * 2 ** i + Math.random() * baseDelayMs);
    }
  }
  throw lastErr;
}

/** fetchWithRetry + JSON parse; `check` may throw to mark a 200 response as a retryable failure. */
export async function fetchJsonWithRetry<T>(
  url: string,
  opts: RetryOptions & { check?: (body: unknown) => void } = {},
): Promise<T> {
  const { attempts = 5, baseDelayMs = 500, check } = opts;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchWithRetry(url, { ...opts, attempts: 1 });
      const body: unknown = await res.json();
      check?.(body);
      return body as T;
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || i === attempts - 1) break;
      await sleep(baseDelayMs * 2 ** i + Math.random() * baseDelayMs);
    }
  }
  throw lastErr;
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
