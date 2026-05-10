const pad = (value: number) => value.toString().padStart(2, "0");

export type FocusHistoryLike = {
  date: string;
};

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${minutes}:${pad(seconds)}`;
}

export function formatCompactDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.ceil((safeSeconds % 3600) / 60);

  if (safeSeconds === 0) {
    return "0m";
  }

  if (hours > 0) {
    return `${hours}h ${minutes > 0 ? `${minutes}m` : ""}`.trim();
  }

  return `${Math.max(1, minutes)}m`;
}

export function formatFinishTime(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return "All clear";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Date.now() + totalSeconds * 1000));
}

export function progressPercent(durationSeconds: number, remainingSeconds: number): number {
  if (durationSeconds <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, ((durationSeconds - remainingSeconds) / durationSeconds) * 100));
}

export function formatLocalDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateFromLocalKey(dateKey: string): Date | null {
  const [year, month, day] = dateKey.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

export function formatHistoryDayLabel(dateKey: string, today: Date = new Date()): string {
  const date = dateFromLocalKey(dateKey);
  if (!date) {
    return dateKey;
  }

  const todayKey = formatLocalDateKey(today);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

  if (dateKey === todayKey) {
    return "Today";
  }

  if (dateKey === formatLocalDateKey(yesterday)) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
}

export function sortFocusHistoryDays<T extends FocusHistoryLike>(history: T[]): T[] {
  return [...history].sort((a, b) => b.date.localeCompare(a.date));
}
