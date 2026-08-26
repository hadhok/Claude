import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HabitBoard from "@/components/HabitBoard";

function ninetyDaysAgoIso() {
  return new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: habits } = await supabase
    .from("habits")
    .select("*")
    .eq("archived", false)
    .order("created_at", { ascending: true });

  const { data: logs } = await supabase
    .from("habit_logs")
    .select("*")
    .gte("completed_on", ninetyDaysAgoIso());

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            HabitLoop
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{user.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
            Déconnexion
          </button>
        </form>
      </header>

      <HabitBoard initialHabits={habits ?? []} initialLogs={logs ?? []} userId={user.id} />
    </main>
  );
}
