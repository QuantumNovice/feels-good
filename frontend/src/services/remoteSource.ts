import { MAX_SOURCE_BYTES, validateSource } from './sourceValidation';
import { normalizeSourceUrl } from './sourceUrl';
import type { CachedSource, SourceStore } from './sourceCache';
export const SOURCE_REFRESH_MS = 15 * 60 * 1000;

/** One foreground fetch at a time. Failed imports never replace a valid cached snapshot. */
export class RemoteSource {
  current?: CachedSource;
  private controller?: AbortController;
  private inFlight?: Promise<CachedSource>;
  private generation = 0;
  private requestUrl = '';
  constructor(
    private store: SourceStore,
    private transport: typeof fetch = (input, init) =>
      globalThis.fetch(input, init),
    private now = () => Date.now(),
  ) {}
  async restore() {
    try {
      const cached = await this.store.read();
      if (cached) {
        if (
          typeof cached.url !== 'string' ||
          !Number.isFinite(cached.checkedAt) ||
          !Number.isFinite(Date.parse(cached.synced))
        )
          throw Error('invalid_cache');
        normalizeSourceUrl(cached.url);
        validateSource(cached.spots);
        this.current = cached;
      }
    } catch {
      /* A corrupt/unavailable remote cache must not hide bundled places. */
    }
    return this.current;
  }
  cancel() {
    this.generation++;
    this.controller?.abort();
    this.inFlight = undefined;
  }
  async reset() {
    this.cancel();
    await this.store.clear();
    this.current = undefined;
  }
  refresh(input: string, force = true): Promise<CachedSource> {
    const url = normalizeSourceUrl(input);
    if (this.inFlight && this.requestUrl === url) return this.inFlight;
    if (this.inFlight) this.cancel();
    this.requestUrl = url;
    const previous = this.current?.url === url ? this.current : undefined;
    if (
      !force &&
      previous &&
      this.now() - previous.checkedAt < SOURCE_REFRESH_MS
    )
      return Promise.resolve(previous);
    const generation = ++this.generation,
      controller = new AbortController();
    this.controller = controller;
    const operation = async () => {
      const headers: Record<string, string> = {
        Accept: url.startsWith('https://api.github.com/repos/')
          ? 'application/vnd.github.raw+json'
          : 'application/json',
      };
      if (previous?.etag) headers['If-None-Match'] = previous.etag;
      if (previous?.modified) headers['If-Modified-Since'] = previous.modified;
      const response = await this.transport(url, {
        headers,
        signal: controller.signal,
        cache: 'no-store',
      });
      let next: CachedSource;
      if (response.status === 304 && previous)
        next = { ...previous, checkedAt: this.now() };
      else {
        if (!response.ok) throw Error('source_http_error');
        const reader = response.body?.getReader();
        if (!reader) throw Error('source_body_missing');
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_SOURCE_BYTES) {
              await reader.cancel();
              throw Error('source_too_large');
            }
            chunks.push(chunk.value);
          }
        } finally {
          reader.releaseLock();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const spots = validateSource(
          JSON.parse(new TextDecoder().decode(bytes)),
        );
        next = {
          url,
          spots,
          synced: new Date(this.now()).toISOString(),
          checkedAt: this.now(),
          etag: response.headers.get('ETag') || '',
          modified: response.headers.get('Last-Modified') || '',
        };
      }
      if (generation !== this.generation || controller.signal.aborted)
        throw new DOMException('Cancelled', 'AbortError');
      await this.store.write(next);
      if (generation !== this.generation)
        throw new DOMException('Cancelled', 'AbortError');
      this.current = next;
      return next;
    };
    this.inFlight = operation().finally(() => {
      if (generation === this.generation) this.inFlight = undefined;
    });
    return this.inFlight;
  }
}
