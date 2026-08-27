"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function NewCanvasButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createCanvas() {
    setCreating(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("canvases")
      .insert({ owner_id: userId, title: "Nouveau canvas" })
      .select()
      .single();
    setCreating(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    if (data) {
      router.push(`/canvas/${data.id}`);
    }
  }

  return (
    <div>
      <button
        onClick={createCanvas}
        disabled={creating}
        className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        <Plus size={16} /> {creating ? "Création..." : "Nouveau canvas"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
