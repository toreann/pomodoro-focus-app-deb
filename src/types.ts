export type TaskStatus = "queued" | "active" | "paused" | "completed";

export type ThemePreference = "ember" | "slate" | "forest" | "ocean" | "cat";

export type Task = {
  id: string;
  name: string;
  emoji: string;
  durationSeconds: number;
  remainingSeconds: number;
  status: TaskStatus;
  position: number;
  createdAt: number;
  updatedAt: number;
};

export type Settings = {
  theme: ThemePreference;
  soundEnabled: boolean;
  defaultDurationMinutes: number;
  confettiEnabled: boolean;
  overtimeEnabled: boolean;
};

export type PresetTask = {
  name: string;
  emoji: string;
  durationMinutes: number;
};

export type PresetRoutine = {
  id: string;
  name: string;
  description: string;
  accent: string;
  tasks: PresetTask[];
};
