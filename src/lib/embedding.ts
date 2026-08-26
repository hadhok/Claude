"use client";

type WorkerReq =
  | { id: number; type: "embed"; text: string }
  | { id: number; type: "embed_batch"; texts: string[] };

type WorkerRes =
  | { id: number; type: "ready" }
  | { id: number; type: "embedding"; vector: number[] }
  | { id: number; type: "embeddings"; vectors: number[][] }
  | { id: number; type: "error"; message: string };

type Pending = {
  resolve: (v: number[] | number[][]) => void;
  reject: (e: Error) => void;
};

/**
 * Singleton wrapper around the embedding Web Worker. The AI model runs
 * fully on-device (WASM/WebGPU) — no text is ever sent to a server.
 */
class EmbeddingEngine {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;

  private ensureWorker() {
    if (this.worker || typeof window === "undefined") return;
    this.worker = new Worker(new URL("../workers/embedding.worker.ts", import.meta.url), {
      type: "module",
    });
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    this.worker.onmessage = (event: MessageEvent<WorkerRes>) => {
      const msg = event.data;
      if (msg.type === "ready") {
        this.readyResolve?.();
        return;
      }
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.type === "error") {
        pending.reject(new Error(msg.message));
      } else if (msg.type === "embedding") {
        pending.resolve(msg.vector);
      } else if (msg.type === "embeddings") {
        pending.resolve(msg.vectors);
      }
    };
  }

  async whenReady(): Promise<void> {
    this.ensureWorker();
    await this.readyPromise;
  }

  async embed(text: string): Promise<number[]> {
    this.ensureWorker();
    const id = this.nextId++;
    return new Promise<number[]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: number[] | number[][]) => void, reject });
      const req: WorkerReq = { id, type: "embed", text };
      this.worker!.postMessage(req);
    });
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    this.ensureWorker();
    const id = this.nextId++;
    return new Promise<number[][]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: number[] | number[][]) => void, reject });
      const req: WorkerReq = { id, type: "embed_batch", texts };
      this.worker!.postMessage(req);
    });
  }
}

export const embeddingEngine = new EmbeddingEngine();

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
