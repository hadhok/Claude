// Runs entirely in the browser (WASM/WebGPU via transformers.js). No network
// calls beyond the one-time model download from the HF CDN, cached by the
// browser afterwards. No text ever leaves the machine for embedding.
import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";

env.allowLocalModels = false;

type Req =
  | { id: number; type: "embed"; text: string }
  | { id: number; type: "embed_batch"; texts: string[] };

type Res =
  | { id: number; type: "ready" }
  | { id: number; type: "embedding"; vector: number[] }
  | { id: number; type: "embeddings"; vectors: number[][] }
  | { id: number; type: "error"; message: string };

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      dtype: "q8",
    }) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

self.onmessage = async (event: MessageEvent<Req>) => {
  const msg = event.data;
  try {
    if (msg.type === "embed") {
      const vector = await embed(msg.text);
      const res: Res = { id: msg.id, type: "embedding", vector };
      (self as unknown as Worker).postMessage(res);
    } else if (msg.type === "embed_batch") {
      const vectors: number[][] = [];
      for (const text of msg.texts) {
        vectors.push(await embed(text));
      }
      const res: Res = { id: msg.id, type: "embeddings", vectors };
      (self as unknown as Worker).postMessage(res);
    }
  } catch (err) {
    const res: Res = { id: msg.id, type: "error", message: (err as Error).message };
    (self as unknown as Worker).postMessage(res);
  }
};

getExtractor()
  .then(() => (self as unknown as Worker).postMessage({ id: 0, type: "ready" } satisfies Res))
  .catch(() => {});
