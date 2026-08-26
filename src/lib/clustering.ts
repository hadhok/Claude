import { cosineSimilarity } from "@/lib/embedding";

export type EmbeddedItem = { id: string; embedding: number[] };

const LINK_THRESHOLD = 0.62;
const CONTRADICTION_THRESHOLD = 0.55;

const NEGATION_WORDS = [
  "pas",
  "jamais",
  "aucun",
  "aucune",
  "non",
  "ne ",
  "sans",
  "n'est pas",
  "not",
  "never",
  "no ",
  "n't",
];

function hasNegation(text: string): boolean {
  const lower = text.toLowerCase();
  return NEGATION_WORDS.some((w) => lower.includes(w));
}

/** Suggest auto-links between semantically close nodes above LINK_THRESHOLD. */
export function suggestLinks(
  items: EmbeddedItem[],
  existingPairs: Set<string>,
): { source: string; target: string; weight: number }[] {
  const links: { source: string; target: string; weight: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const sim = cosineSimilarity(items[i].embedding, items[j].embedding);
      if (sim >= LINK_THRESHOLD) {
        const key = [items[i].id, items[j].id].sort().join("|");
        if (!existingPairs.has(key)) {
          links.push({ source: items[i].id, target: items[j].id, weight: sim });
        }
      }
    }
  }
  return links;
}

/**
 * Flags pairs that are topically close (similar embedding) but textually
 * contain opposite polarity markers — a cheap, fully local heuristic for
 * "these two ideas might contradict each other".
 */
export function suggestContradictions(
  items: (EmbeddedItem & { content: string })[],
): { source: string; target: string }[] {
  const flagged: { source: string; target: string }[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const sim = cosineSimilarity(items[i].embedding, items[j].embedding);
      if (sim < CONTRADICTION_THRESHOLD || sim > 0.93) continue;
      const negA = hasNegation(items[i].content);
      const negB = hasNegation(items[j].content);
      if (negA !== negB) {
        flagged.push({ source: items[i].id, target: items[j].id });
      }
    }
  }
  return flagged;
}

/** Connected-components clustering over a similarity threshold — assigns each node a cluster id. */
export function clusterByThreshold(items: EmbeddedItem[], threshold = LINK_THRESHOLD): Map<string, number> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const item of items) parent.set(item.id, item.id);

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (cosineSimilarity(items[i].embedding, items[j].embedding) >= threshold) {
        union(items[i].id, items[j].id);
      }
    }
  }

  const rootToCluster = new Map<string, number>();
  const result = new Map<string, number>();
  let nextCluster = 0;
  for (const item of items) {
    const root = find(item.id);
    if (!rootToCluster.has(root)) rootToCluster.set(root, nextCluster++);
    result.set(item.id, rootToCluster.get(root)!);
  }
  return result;
}
