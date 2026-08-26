import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CanvasBoard from "@/components/CanvasBoard";

export default async function CanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: canvas } = await supabase.from("canvases").select("*").eq("id", id).single();
  if (!canvas) notFound();

  const { data: nodes } = await supabase.from("nodes").select("*").eq("canvas_id", id);
  const { data: edges } = await supabase.from("edges").select("*").eq("canvas_id", id);

  return (
    <CanvasBoard
      canvas={canvas}
      initialNodes={nodes ?? []}
      initialEdges={edges ?? []}
      userId={user.id}
    />
  );
}
