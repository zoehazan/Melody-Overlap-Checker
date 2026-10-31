/* Page side of the search worker: call SearchEngine methods as if they were local async functions.
 *
 *   const search = new SearchClient();
 *   const reply = await search.call("search", fingerprint);
 */
import type { SearchEngine } from "./engine";

type Method = { [K in keyof SearchEngine]: SearchEngine[K] extends (...a: never[]) => unknown ? K : never }[keyof SearchEngine];

export class SearchClient {
  private worker = new Worker(new URL("./search-worker.ts", import.meta.url), { type: "module" });
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
  }

  call<M extends Method>(method: M, ...args: Parameters<SearchEngine[M]>): Promise<Awaited<ReturnType<SearchEngine[M]>>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ id, method, args });
    });
  }
}
