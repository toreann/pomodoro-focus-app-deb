import type { PresetRoutine, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  theme: "ember",
  soundEnabled: true,
  defaultDurationMinutes: 10,
  confettiEnabled: true,
  overtimeEnabled: false,
};

export const PRESET_ROUTINES: PresetRoutine[] = [
  {
    id: "deep-work",
    name: "Deep Work",
    description: "Two focused blocks with short and long recovery.",
    accent: "#f97316",
    tasks: [
      { name: "Focus", emoji: "🔥", durationMinutes: 25 },
      { name: "Break", emoji: "☕", durationMinutes: 5 },
      { name: "Focus", emoji: "🔥", durationMinutes: 25 },
      { name: "Long Break", emoji: "🪴", durationMinutes: 15 },
    ],
  },
  {
    id: "job-search",
    name: "Job Search",
    description: "A focused pipeline from search to follow-up.",
    accent: "#60a5fa",
    tasks: [
      { name: "Find roles", emoji: "🔎", durationMinutes: 20 },
      { name: "Tailor resume", emoji: "📄", durationMinutes: 30 },
      { name: "Apply", emoji: "🚀", durationMinutes: 20 },
      { name: "Follow up", emoji: "✉️", durationMinutes: 10 },
    ],
  },
  {
    id: "study-session",
    name: "Study Session",
    description: "Review, study, recover, then practice.",
    accent: "#f472b6",
    tasks: [
      { name: "Review", emoji: "📓", durationMinutes: 10 },
      { name: "Study", emoji: "📚", durationMinutes: 25 },
      { name: "Break", emoji: "☕", durationMinutes: 5 },
      { name: "Practice", emoji: "✏️", durationMinutes: 25 },
    ],
  },
  {
    id: "morning-routine",
    name: "Morning Routine",
    description: "A simple launch sequence for the day.",
    accent: "#9bd879",
    tasks: [
      { name: "Plan day", emoji: "🗓️", durationMinutes: 5 },
      { name: "Journal", emoji: "📓", durationMinutes: 10 },
      { name: "Clean room", emoji: "🧹", durationMinutes: 10 },
      { name: "Breakfast", emoji: "🍳", durationMinutes: 15 },
    ],
  },
];
