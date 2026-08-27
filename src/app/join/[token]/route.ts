import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { origin } = new URL(request.url);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/join/${token}`);
  }

  const admin = createAdminClient();
  const { data: canvas } = await admin
    .from("canvases")
    .select("id, owner_id")
    .eq("share_token", token)
    .single();

  if (!canvas) {
    return NextResponse.redirect(`${origin}/canvas?error=lien-invalide`);
  }

  if (canvas.owner_id !== user.id) {
    await supabase
      .from("canvas_members")
      .upsert({ canvas_id: canvas.id, user_id: user.id, role: "editor" }, { onConflict: "canvas_id,user_id" });
  }

  return NextResponse.redirect(`${origin}/canvas/${canvas.id}`);
}
