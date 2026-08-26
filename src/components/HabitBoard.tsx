"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeStreak } from "@/lib/streaks";
import type { Habit, HabitLog } from "@/types/database";
import { Flame, Plus, Trash2 } from "lucide-react";

type Props = {
  initialHabits: Habit[];
  initialLogs: HabitLog[];
  userId: string;
};

const EMOJIS = ["✅", "💧", "🏃", "📖", "🧘", "🥗", "😴", "🎯"];

export default function HabitBoard({ initialHabits, initialLogs, userId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [logs, setLogs] = useState<HabitLog[]>(initialLogs);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel("habit_logs_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "habit_logs", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setLogs((prev) => [...prev, payload.new as HabitLog]);
          } else if (payload.eventType === "DELETE") {
            setLogs((prev) => prev.filter((l) => l.id !== (payload.old as HabitLog).id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  const today = new Date().toISOString().slice(0, 10);

  const logsByHabit = useMemo(() => {
    const map = new Map<string, HabitLog[]>();
    for (const log of logs) {
      const arr = map.get(log.habit_id) ?? [];
      arr.push(log);
      map.set(log.habit_id, arr);
    }
    return map;
  }, [logs]);

  async function addHabit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    const { data, error } = await supabase
      .from("habits")
      .insert({ user_id: userId, name: name.trim(), emoji })
      .select()
      .single();
    setAdding(false);
    if (!error && data) {
      setHabits((prev) => [...prev, data]);
      setName("");
    }
  }

  async function toggleToday(habit: Habit) {
    const todaysLog = (logsByHabit.get(habit.id) ?? []).find((l) => l.completed_on === today);
    if (todaysLog) {
      const { error } = await supabase.from("habit_logs").delete().eq("id", todaysLog.id);
      if (!error) setLogs((prev) => prev.filter((l) => l.id !== todaysLog.id));
    } else {
      const { data, error } = await supabase
        .from("habit_logs")
        .insert({ habit_id: habit.id, user_id: userId, completed_on: today })
        .select()
        .single();
      if (!error && data) setLogs((prev) => [...prev, data]);
    }
  }

  async function deleteHabit(habit: Habit) {
    const { error } = await supabase.from("habits").delete().eq("id", habit.id);
    if (!error) setHabits((prev) => prev.filter((h) => h.id !== habit.id));
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={addHabit}
        className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <select
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          className="rounded-lg bg-transparent px-2 py-2 text-lg outline-none"
        >
          {EMOJIS.map((em) => (
            <option key={em} value={em}>
              {em}
            </option>
          ))}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nouvelle habitude (ex: boire de l'eau)"
          className="flex-1 bg-transparent px-2 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={adding}
          className="flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          <Plus size={16} /> Ajouter
        </button>
      </form>

      <ul className="space-y-2">
        {habits.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Aucune habitude pour l&apos;instant. Ajoutes-en une ci-dessus.
          </p>
        )}
        {habits.map((habit) => {
          const habitLogs = logsByHabit.get(habit.id) ?? [];
          const streak = computeStreak(habitLogs.map((l) => l.completed_on));
          const doneToday = habitLogs.some((l) => l.completed_on === today);

          return (
            <li
              key={habit.id}
              className="group flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleToday(habit)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-lg transition ${
                    doneToday
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-neutral-300 dark:border-neutral-700"
                  }`}
                  aria-label={doneToday ? "Marquer comme non fait" : "Marquer comme fait"}
                >
                  {doneToday ? "✓" : habit.emoji}
                </button>
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {habit.name}
                  </p>
                  {streak > 0 && (
                    <p className="flex items-center gap-1 text-xs text-orange-500">
                      <Flame size={12} /> {streak} jour{streak > 1 ? "s" : ""} de suite
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => deleteHabit(habit)}
                className="text-neutral-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                aria-label="Supprimer"
              >
                <Trash2 size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
