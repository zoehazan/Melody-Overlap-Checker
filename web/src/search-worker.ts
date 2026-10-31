/* Web Worker: runs the SearchEngine on a background thread so the page stays responsive.
 *
 * Protocol: the page posts { id, method, args } naming a SearchEngine method; the worker
 * replies { id, ok: true, result } or { id, ok: false, error }. See search-client.ts. */
import { SearchEngine } from "./engine";

const engine = new SearchEngine();

self.onmessage = async (e: MessageEvent<{ id: number; method: keyof SearchEngine; args: unknown[] }>) => {
  const { id, method, args } = e.data;
  try {
    const fn = engine[method] as (...a: unknown[]) => unknown;
    const result = await fn.apply(engine, args);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err as Error).message ?? String(err) });
  }
};
