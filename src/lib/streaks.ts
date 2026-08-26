import { differenceInCalendarDays, parseISO } from "date-fns";

/** Current streak in days, counting back from today, given completion dates (sorted or not). */
export function computeStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;

  const days = new Set(completedDates.map((d) => d));
  const today = new Date();
  let streak = 0;
  let cursor = today;

  while (true) {
    const iso = cursor.toISOString().slice(0, 10);
    if (days.has(iso)) {
      streak += 1;
      cursor = new Date(cursor.getTime() - 86400000);
      continue;
    }
    if (streak === 0 && differenceInCalendarDays(today, cursor) === 0) {
      // today not yet logged, allow the streak to start from yesterday
      cursor = new Date(cursor.getTime() - 86400000);
      if (days.has(cursor.toISOString().slice(0, 10))) continue;
    }
    break;
  }

  return streak;
}

export function isSameDayAsToday(iso: string): boolean {
  return differenceInCalendarDays(new Date(), parseISO(iso)) === 0;
}
