"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Brain, Check, Link2, Loader2, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { embeddingEngine, cosineSimilarity } from "@/lib/embedding";
import { suggestLinks, suggestContradictions, clusterByThreshold } from "@/lib/clustering";
import type { Canvas, Node, Edge } from "@/types/database";

const CLUSTER_COLORS = [
  "#fca5a5",
  "#fdba74",
  "#fde047",
  "#bef264",
  "#86efac",
  "#5eead4",
  "#7dd3fc",
  "#a5b4fc",
  "#d8b4fe",
  "#f9a8d4",
];

type Props = {
  canvas: Canvas;
  initialNodes: Node[];
  initialEdges: Edge[];
  userId: string;
};

export default function CanvasBoard({ canvas, initialNodes, initialEdges, userId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [aiReady, setAiReady] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{ dragging: boolean; startX: number; startY: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ kind: "drag"; x: number; y: number } | { kind: "pan"; x: number; y: number } | null>(
    null,
  );

  const embeddingInFlight = useRef(new Set<string>());
  const reconcileScheduled = useRef(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchScores, setSearchScores] = useState<Map<string, number> | null>(null);
  const SEARCH_MATCH_THRESHOLD = 0.35;

  const [copied, setCopied] = useState(false);

  async function copyShareLink() {
    if (!canvas.share_token) return;
    const url = `${window.location.origin}/join/${canvas.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copie ce lien :", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const [draft, setDraft] = useState<{ x: number; y: number; text: string } | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement>(null);
  const draftCancelledRef = useRef(false);

  useEffect(() => {
    if (draft) draftInputRef.current?.focus();
  }, [draft]);

  useEffect(() => {
    embeddingEngine.whenReady().then(() => setAiReady(true));
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`canvas_${canvas.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nodes", filter: `canvas_id=eq.${canvas.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setNodes((prev) => (prev.some((n) => n.id === (payload.new as Node).id) ? prev : [...prev, payload.new as Node]));
          } else if (payload.eventType === "UPDATE") {
            setNodes((prev) => prev.map((n) => (n.id === (payload.new as Node).id ? (payload.new as Node) : n)));
          } else if (payload.eventType === "DELETE") {
            setNodes((prev) => prev.filter((n) => n.id !== (payload.old as Node).id));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "edges", filter: `canvas_id=eq.${canvas.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setEdges((prev) => (prev.some((e) => e.id === (payload.new as Edge).id) ? prev : [...prev, payload.new as Edge]));
          } else if (payload.eventType === "DELETE") {
            setEdges((prev) => prev.filter((e) => e.id !== (payload.old as Edge).id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, canvas.id]);

  const screenToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current!.getBoundingClientRect();
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom],
  );

  /**
   * Recomputes links, contradictions and clusters across every embedded
   * node on the canvas — not just the node that just changed. This is what
   * lets two notes added by different collaborators (whose browsers embed
   * independently) end up linked once both embeddings exist.
   */
  const reconcileCanvas = useCallback(async () => {
    const embedded = nodes.filter((n) => n.embedding) as (Node & { embedding: number[] })[];
    if (embedded.length < 2) return;

    const existingAutoPairs = new Set(
      edges.filter((e) => e.kind !== "contradiction").map((e) => [e.source_id, e.target_id].sort().join("|")),
    );
    const links = suggestLinks(embedded, existingAutoPairs);
    if (links.length > 0) {
      const { data } = await supabase
        .from("edges")
        .insert(
          links.map((l) => ({
            canvas_id: canvas.id,
            source_id: l.source,
            target_id: l.target,
            kind: "auto" as const,
            weight: l.weight,
          })),
        )
        .select();
      if (data) setEdges((prev) => [...prev, ...data]);
    }

    const existingContradictionPairs = new Set(
      edges.filter((e) => e.kind === "contradiction").map((e) => [e.source_id, e.target_id].sort().join("|")),
    );
    const contradictions = suggestContradictions(embedded).filter(
      (c) => !existingContradictionPairs.has([c.source, c.target].sort().join("|")),
    );
    if (contradictions.length > 0) {
      const { data } = await supabase
        .from("edges")
        .insert(
          contradictions.map((c) => ({
            canvas_id: canvas.id,
            source_id: c.source,
            target_id: c.target,
            kind: "contradiction" as const,
          })),
        )
        .select();
      if (data) setEdges((prev) => [...prev, ...data]);
    }

    const clusters = clusterByThreshold(embedded);
    const changed = embedded.filter((n) => clusters.get(n.id) !== n.cluster_id);
    for (const node of changed) {
      const clusterId = clusters.get(node.id)!;
      await supabase.from("nodes").update({ cluster_id: clusterId }).eq("id", node.id);
      setNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, cluster_id: clusterId } : n)));
    }
  }, [nodes, edges, supabase, canvas.id]);

  // Embed any node that arrived without an embedding (created by a peer
  // whose browser hadn't finished the on-device computation yet), then
  // reconcile links/clusters across the whole canvas.
  useEffect(() => {
    if (!aiReady) return;
    const missing = nodes.filter((n) => !n.embedding && !embeddingInFlight.current.has(n.id));
    if (missing.length === 0) {
      if (!reconcileScheduled.current) {
        reconcileScheduled.current = true;
        reconcileCanvas().finally(() => {
          reconcileScheduled.current = false;
        });
      }
      return;
    }
    for (const node of missing) {
      embeddingInFlight.current.add(node.id);
      embeddingEngine
        .embed(node.content)
        .then(async (vector) => {
          const { data } = await supabase
            .from("nodes")
            .update({ embedding: vector })
            .eq("id", node.id)
            .select()
            .single();
          if (data) setNodes((prev) => prev.map((n) => (n.id === data.id ? data : n)));
        })
        .finally(() => {
          embeddingInFlight.current.delete(node.id);
        });
    }
  }, [aiReady, nodes, supabase, reconcileCanvas]);

  async function runSemanticSearch(query: string) {
    if (!query.trim()) {
      setSearchScores(null);
      return;
    }
    setSearching(true);
    const queryVector = await embeddingEngine.embed(query.trim());
    const scores = new Map<string, number>();
    for (const node of nodes) {
      if (!node.embedding) continue;
      const score = cosineSimilarity(queryVector, node.embedding);
      if (score >= SEARCH_MATCH_THRESHOLD) scores.set(node.id, score);
    }
    setSearchScores(scores);
    setSearching(false);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchScores(null);
  }

  function openDraft(x: number, y: number) {
    setDraft({ x, y, text: "" });
  }

  async function commitDraft() {
    const pending = draft;
    setDraft(null);
    if (draftCancelledRef.current) {
      draftCancelledRef.current = false;
      return;
    }
    if (!pending || !pending.text.trim()) return;
    const content = pending.text.trim();

    const { data, error } = await supabase
      .from("nodes")
      .insert({ canvas_id: canvas.id, author_id: userId, content, x: pending.x, y: pending.y })
      .select()
      .single();
    if (error || !data) {
      window.alert(`Impossible de créer l'idée : ${error?.message ?? "erreur inconnue"}`);
      return;
    }
    setNodes((prev) => [...prev, data]);

    const vector = await embeddingEngine.embed(content);
    const { data: updated } = await supabase
      .from("nodes")
      .update({ embedding: vector })
      .eq("id", data.id)
      .select()
      .single();
    if (updated) {
      setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    }
  }

  function onBackgroundMouseDown(e: React.MouseEvent) {
    panState.current = { dragging: true, startX: e.clientX - pan.x, startY: e.clientY - pan.y };
  }

  function onBackgroundDoubleClick(e: React.MouseEvent) {
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    openDraft(x, y);
  }

  function onMouseMove(e: React.MouseEvent) {
    if (dragNodeId) {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      pendingMoveRef.current = { kind: "drag", x, y };
      scheduleFlush();
      return;
    }
    if (panState.current?.dragging) {
      pendingMoveRef.current = {
        kind: "pan",
        x: e.clientX - panState.current.startX,
        y: e.clientY - panState.current.startY,
      };
      scheduleFlush();
    }
  }

  function scheduleFlush() {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const move = pendingMoveRef.current;
      pendingMoveRef.current = null;
      if (!move) return;
      if (move.kind === "drag") {
        setNodes((prev) => prev.map((n) => (n.id === dragNodeId ? { ...n, x: move.x, y: move.y } : n)));
      } else {
        setPan({ x: move.x, y: move.y });
      }
    });
  }

  async function onMouseUp() {
    panState.current = null;
    if (dragNodeId) {
      const node = nodes.find((n) => n.id === dragNodeId);
      if (node) {
        await supabase.from("nodes").update({ x: node.x, y: node.y }).eq("id", node.id);
      }
      setDragNodeId(null);
    }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setZoom((z) => Math.min(2.5, Math.max(0.3, z + delta)));
  }

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const clusterCount = useMemo(
    () => new Set(nodes.map((n) => n.cluster_id).filter((c) => c !== null && c !== undefined)).size,
    [nodes],
  );

  return (
    <div className="flex h-screen flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <Link href="/canvas" className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{canvas.title}</h1>
        </div>
        <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
          <span>
            {nodes.length} idée{nodes.length > 1 ? "s" : ""} · {clusterCount} thème
            {clusterCount > 1 ? "s" : ""} · {edges.filter((e) => e.kind === "auto").length} lien
            {edges.filter((e) => e.kind === "auto").length > 1 ? "s" : ""}
            {edges.some((e) => e.kind === "contradiction") && (
              <span className="text-red-500">
                {" "}
                · {edges.filter((e) => e.kind === "contradiction").length} contradiction(s)
              </span>
            )}
          </span>
          {aiReady ? (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Brain size={14} /> IA locale prête
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Loader2 size={14} className="animate-spin" /> Chargement du modèle IA...
            </span>
          )}
          <button
            onClick={() => setSearchOpen((v) => !v)}
            disabled={!aiReady}
            className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-neutral-600 transition hover:border-neutral-400 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300"
            aria-label="Recherche sémantique"
          >
            <Search size={14} />
          </button>
          <button
            onClick={copyShareLink}
            className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-neutral-600 transition hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
            aria-label="Copier le lien de partage"
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Link2 size={14} />}
            {copied ? "Copié" : "Partager"}
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900">
          <Search size={14} className="text-neutral-400" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              runSemanticSearch(e.target.value);
            }}
            placeholder="Cherche une idée par le sens, pas juste par mot-clé..."
            className="flex-1 bg-transparent text-sm outline-none"
          />
          {searching && <Loader2 size={14} className="animate-spin text-neutral-400" />}
          {searchScores && (
            <span className="text-xs text-neutral-400">
              {searchScores.size} résultat{searchScores.size > 1 ? "s" : ""}
            </span>
          )}
          <button onClick={closeSearch} className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">
            <X size={16} />
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        onMouseDown={onBackgroundMouseDown}
        onDoubleClick={onBackgroundDoubleClick}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-lg font-medium text-neutral-400 dark:text-neutral-600">
              Ton canvas est vide
            </p>
            <p className="text-sm text-neutral-400 dark:text-neutral-600">
              Double-clique n&apos;importe où pour déposer ta première idée
            </p>
          </div>
        )}
        <div
          className="absolute left-0 top-0 h-full w-full origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <svg className="pointer-events-none absolute h-[4000px] w-[4000px] overflow-visible">
            {edges.map((edge) => {
              const source = nodeById.get(edge.source_id);
              const target = nodeById.get(edge.target_id);
              if (!source || !target) return null;
              const isContradiction = edge.kind === "contradiction";
              return (
                <line
                  key={edge.id}
                  x1={source.x + 90}
                  y1={source.y + 40}
                  x2={target.x + 90}
                  y2={target.y + 40}
                  stroke={isContradiction ? "#ef4444" : "#a3a3a3"}
                  strokeWidth={isContradiction ? 2 : 1.5}
                  strokeDasharray={isContradiction ? "6 4" : undefined}
                  opacity={isContradiction ? 0.8 : 0.4}
                />
              );
            })}
          </svg>

          {nodes.map((node) => {
            const clusterColor =
              node.cluster_id !== null && node.cluster_id !== undefined
                ? CLUSTER_COLORS[node.cluster_id % CLUSTER_COLORS.length]
                : "#e5e5e5";
            const isSearchActive = searchScores !== null;
            const matchScore = searchScores?.get(node.id);
            const isMatch = matchScore !== undefined;
            return (
              <div
                key={node.id}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDragNodeId(node.id);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                className="absolute w-[180px] cursor-move select-none rounded-lg border p-3 text-sm shadow-sm transition-opacity"
                style={{
                  left: node.x,
                  top: node.y,
                  borderColor: isSearchActive && isMatch ? "#6366f1" : clusterColor,
                  borderWidth: isSearchActive && isMatch ? 3 : 2,
                  background: "white",
                  opacity: isSearchActive && !isMatch ? 0.25 : 1,
                  boxShadow: isSearchActive && isMatch ? "0 0 0 3px rgba(99,102,241,0.15)" : undefined,
                }}
              >
                {node.content}
              </div>
            );
          })}

          {draft && (
            <div
              className="absolute w-[180px] rounded-lg border-2 border-indigo-400 bg-white p-2 shadow-md"
              style={{ left: draft.x, top: draft.y }}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <textarea
                ref={draftInputRef}
                value={draft.text}
                onChange={(e) => setDraft((d) => (d ? { ...d, text: e.target.value } : d))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitDraft();
                  } else if (e.key === "Escape") {
                    draftCancelledRef.current = true;
                    setDraft(null);
                  }
                }}
                onBlur={commitDraft}
                placeholder="Ton idée... (Entrée pour valider)"
                className="h-16 w-full resize-none bg-transparent text-sm outline-none"
              />
            </div>
          )}
        </div>
      </div>

      <p className="border-t border-neutral-200 bg-white px-4 py-2 text-center text-xs text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900">
        Double-clic pour ajouter une idée · glisser pour déplacer · molette pour zoomer · les liens et couleurs sont générés par une IA qui tourne entièrement dans ton navigateur
      </p>
    </div>
  );
}
