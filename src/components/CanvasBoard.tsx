"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Brain, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { embeddingEngine } from "@/lib/embedding";
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

  useEffect(() => {
    embeddingEngine.whenReady().then(() => setAiReady(true));
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

  async function linkAndCluster(newNode: Node) {
    const others = nodes.filter((n) => n.id !== newNode.id && n.embedding);
    const existingPairs = new Set(edges.map((e) => [e.source_id, e.target_id].sort().join("|")));
    const links = suggestLinks(
      [...others, { id: newNode.id, embedding: newNode.embedding! }].map((n) => ({
        id: n.id,
        embedding: (n as Node).embedding ?? (n as { embedding: number[] }).embedding,
      })),
      existingPairs,
    ).filter((l) => l.source === newNode.id || l.target === newNode.id);

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

    const contradictions = suggestContradictions(
      [...others, newNode].map((n) => ({ id: n.id, embedding: n.embedding!, content: n.content })),
    ).filter((c) => c.source === newNode.id || c.target === newNode.id);

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

    const allEmbedded = [...others, newNode].map((n) => ({ id: n.id, embedding: n.embedding! }));
    const clusters = clusterByThreshold(allEmbedded);
    const clusterId = clusters.get(newNode.id) ?? null;
    if (clusterId !== null) {
      await supabase.from("nodes").update({ cluster_id: clusterId }).eq("id", newNode.id);
    }
  }

  async function addNode(x: number, y: number) {
    const content = window.prompt("Ton idée :");
    if (!content || !content.trim()) return;

    const { data, error } = await supabase
      .from("nodes")
      .insert({ canvas_id: canvas.id, author_id: userId, content: content.trim(), x, y })
      .select()
      .single();
    if (error || !data) return;
    setNodes((prev) => [...prev, data]);

    const vector = await embeddingEngine.embed(content.trim());
    const { data: updated } = await supabase
      .from("nodes")
      .update({ embedding: vector })
      .eq("id", data.id)
      .select()
      .single();
    if (updated) {
      setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      await linkAndCluster(updated);
    }
  }

  function onBackgroundMouseDown(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return;
    panState.current = { dragging: true, startX: e.clientX - pan.x, startY: e.clientY - pan.y };
  }

  function onBackgroundDoubleClick(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return;
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    addNode(x, y);
  }

  function onMouseMove(e: React.MouseEvent) {
    if (dragNodeId) {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      setNodes((prev) => prev.map((n) => (n.id === dragNodeId ? { ...n, x, y } : n)));
      return;
    }
    if (panState.current?.dragging) {
      setPan({ x: e.clientX - panState.current.startX, y: e.clientY - panState.current.startY });
    }
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

  return (
    <div className="flex h-screen flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <Link href="/canvas" className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{canvas.title}</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          {aiReady ? (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Brain size={14} /> IA locale prête
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Loader2 size={14} className="animate-spin" /> Chargement du modèle IA...
            </span>
          )}
        </div>
      </header>

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
            return (
              <div
                key={node.id}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDragNodeId(node.id);
                }}
                className="absolute w-[180px] cursor-move select-none rounded-lg border p-3 text-sm shadow-sm"
                style={{
                  left: node.x,
                  top: node.y,
                  borderColor: clusterColor,
                  borderWidth: 2,
                  background: "white",
                }}
              >
                {node.content}
              </div>
            );
          })}
        </div>
      </div>

      <p className="border-t border-neutral-200 bg-white px-4 py-2 text-center text-xs text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900">
        Double-clic pour ajouter une idée · glisser pour déplacer · molette pour zoomer · les liens et couleurs sont générés par une IA qui tourne entièrement dans ton navigateur
      </p>
    </div>
  );
}
