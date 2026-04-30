const pad = (value: number) => value.toString().padStart(2, "0");

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
