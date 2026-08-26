import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewCanvasButton from "@/components/NewCanvasButton";

export default async function CanvasListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: owned } = await supabase
    .from("canvases")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            NeuralCanvas
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{user.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
            Déconnexion
          </button>
        </form>
      </header>

      <NewCanvasButton userId={user.id} />

      <ul className="mt-6 space-y-2">
        {(owned ?? []).map((c) => (
          <li key={c.id}>
            <Link
              href={`/canvas/${c.id}`}
              className="block rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-900 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50 dark:hover:border-neutral-600"
            >
              {c.title}
            </Link>
          </li>
        ))}
        {(owned ?? []).length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Aucun canvas pour l&apos;instant. Crées-en un ci-dessus.
          </p>
        )}
      </ul>
    </main>
  );
}
