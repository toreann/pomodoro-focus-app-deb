import { create } from "zustand";
import { DEFAULT_SETTINGS, PRESET_ROUTINES } from "../constants";
import {
  deleteTaskRecord,
  incrementFocusHistoryDay,
  incrementNonProductivityHistoryDay,
  loadFocusappData,
  saveSettings,
  saveTask,
  saveTasks,
} from "../lib/storage";
import { formatLocalDateKey, sortFocusHistoryDays } from "../lib/time";
import type { FocusHistoryDay, NonProductivityCategory, NonProductivityHistoryDay, PresetRoutine, Settings, Task } from "../types";

type NewTaskInput = {
  name: string;
  emoji: string;
  durationMinutes: number;
};

type QueuedTaskUpdate = {
  name: string;
  durationMinutes: number;
};

type FocusState = {
  tasks: Task[];
  focusHistory: FocusHistoryDay[];
  nonProductivityHistory: NonProductivityHistoryDay[];
  settings: Settings;
  isHydrated: boolean;
  isRunning: boolean;
  storageError: string | null;
  lastCelebrationAt: number | null;
  initialize: () => Promise<void>;
  addTask: (input: NewTaskInput) => Promise<void>;
  applyPreset: (preset: PresetRoutine) => Promise<void>;
  startNext: () => Promise<void>;
  pauseActive: () => Promise<void>;
  resumeActive: () => Promise<void>;
  resetActive: () => Promise<void>;
  completeActive: () => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  updateQueuedTask: (taskId: string, input: QueuedTaskUpdate) => Promise<void>;
  clearQueuedTasks: () => Promise<void>;
  clearCompletedTasks: () => Promise<void>;
  reorderQueuedTask: (taskId: string, nextPosition: number) => Promise<void>;
  setActiveRemaining: (remainingSeconds: number) => Promise<void>;
  adjustActiveTime: (deltaSeconds: number) => Promise<void>;
  addFocusTime: (elapsedSeconds: number) => Promise<void>;
  addNonProductivityTime: (category: NonProductivityCategory, elapsedSeconds: number) => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  clearStorageError: () => void;
};

const now = () => Date.now();

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return fallback;
}

function queuedTasks(tasks: Task[]) {
  return tasks.filter((task) => task.status === "queued").sort((a, b) => a.position - b.position);
}

function orderedTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const rank = (task: Task) => {
      if (task.status === "active" || task.status === "paused") return 0;
      if (task.status === "queued") return 1;
      return 2;
    };

    return rank(a) - rank(b) || a.position - b.position || a.createdAt - b.createdAt;
  });
}

function reindexQueued(tasks: Task[]) {
  const queue = queuedTasks(tasks);
  const positions = new Map(queue.map((task, index) => [task.id, index]));

  return tasks.map((task) =>
    task.status === "queued"
      ? {
          ...task,
          position: positions.get(task.id) ?? task.position,
          updatedAt: now(),
        }
      : task,
  );
}

function normalizeLoadedTasks(tasks: Task[]) {
  let hasActiveTask = false;

  const normalized = orderedTasks(tasks).map((task) => {
    if (task.status !== "active" && task.status !== "paused") {
      return task;
    }

    if (hasActiveTask) {
      return {
        ...task,
        status: "queued" as const,
        remainingSeconds: task.durationSeconds,
        updatedAt: now(),
      };
    }

    hasActiveTask = true;
    return {
      ...task,
      status: "paused" as const,
      updatedAt: now(),
    };
  });

  return reindexQueued(normalized);
}

async function persistTasks(tasks: Task[]) {
  await saveTasks(tasks);
}

async function guardedPersist(action: () => Promise<void>, setError: (message: string) => void) {
  try {
    await action();
  } catch (error) {
    setError(errorMessage(error, "SQLite persistence failed"));
  }
}

export const useFocusStore = create<FocusState>()((set, get) => ({
  tasks: [],
  focusHistory: [],
  nonProductivityHistory: [],
  settings: DEFAULT_SETTINGS,
  isHydrated: false,
  isRunning: false,
  storageError: null,
  lastCelebrationAt: null,

  initialize: async () => {
    try {
      const { tasks, settings, focusHistory, nonProductivityHistory } = await loadFocusappData();
      const normalizedTasks = normalizeLoadedTasks(tasks);

      set({
        tasks: normalizedTasks,
        focusHistory: sortFocusHistoryDays(focusHistory),
        nonProductivityHistory: sortFocusHistoryDays(nonProductivityHistory),
        settings,
        isHydrated: true,
        isRunning: false,
        storageError: null,
      });

      await persistTasks(normalizedTasks);
      await saveSettings(settings);
    } catch (error) {
      set({
        focusHistory: [],
        nonProductivityHistory: [],
        settings: DEFAULT_SETTINGS,
        isHydrated: true,
        isRunning: false,
        storageError: `SQLite is unavailable: ${errorMessage(error, "using an in-memory session.")}`,
      });
    }
  },

  addTask: async (input) => {
    const durationMinutes = Number.isFinite(input.durationMinutes) ? input.durationMinutes : DEFAULT_SETTINGS.defaultDurationMinutes;
    const durationSeconds = Math.max(1, Math.round(durationMinutes * 60));
    const task: Task = {
      id: createId(),
      name: input.name.trim() || "Untitled task",
      emoji: input.emoji.trim() || "⚒️",
      durationSeconds,
      remainingSeconds: durationSeconds,
      status: "queued",
      position: queuedTasks(get().tasks).length,
      createdAt: now(),
      updatedAt: now(),
    };

    const tasks = reindexQueued([...get().tasks, task]);
    set({ tasks });

    await guardedPersist(() => saveTask(task), (message) => set({ storageError: message }));
  },

  applyPreset: async (preset) => {
    const replaceableTasks = get().tasks.filter((task) => task.status !== "completed");
    const completedTasks = get().tasks.filter((task) => task.status === "completed");
    const createdAt = now();
    const presetTasks = preset.tasks.map<Task>((task, index) => ({
      id: createId(),
      name: task.name,
      emoji: task.emoji,
      durationSeconds: task.durationMinutes * 60,
      remainingSeconds: task.durationMinutes * 60,
      status: "queued",
      position: index,
      createdAt: createdAt + index,
      updatedAt: createdAt + index,
    }));
    const tasks = reindexQueued([...completedTasks, ...presetTasks]);

    set({ tasks, isRunning: false });
    await guardedPersist(
      async () => {
        await Promise.all(replaceableTasks.map((task) => deleteTaskRecord(task.id)));
        await persistTasks(presetTasks);
      },
      (message) => set({ storageError: message }),
    );
  },

  startNext: async () => {
    const activeTask = getActiveTask(get().tasks);
    if (activeTask) {
      if (activeTask.status === "paused") {
        await get().resumeActive();
      }
      return;
    }

    const nextTask = queuedTasks(get().tasks)[0];
    if (!nextTask) {
      return;
    }

    const tasks = reindexQueued(
      get().tasks.map((task) =>
        task.id === nextTask.id
          ? {
              ...task,
              status: "active",
              updatedAt: now(),
            }
          : task,
      ),
    );

    set({ tasks, isRunning: true });
    await guardedPersist(() => persistTasks(tasks), (message) => set({ storageError: message }));
  },

  pauseActive: async () => {
    const activeTask = getActiveTask(get().tasks);
    if (!activeTask || activeTask.status !== "active") {
      return;
    }

    const tasks = get().tasks.map((task) =>
      task.id === activeTask.id ? { ...task, status: "paused" as const, updatedAt: now() } : task,
    );

    set({ tasks, isRunning: false });
    await guardedPersist(() => saveTask(tasks.find((task) => task.id === activeTask.id)!), (message) =>
      set({ storageError: message }),
    );
  },

  resumeActive: async () => {
    const activeTask = getActiveTask(get().tasks);
    if (!activeTask || activeTask.remainingSeconds <= 0) {
      return;
    }

    const tasks = get().tasks.map((task) =>
      task.id === activeTask.id ? { ...task, status: "active" as const, updatedAt: now() } : task,
    );

    set({ tasks, isRunning: true });
    await guardedPersist(() => saveTask(tasks.find((task) => task.id === activeTask.id)!), (message) =>
      set({ storageError: message }),
    );
  },

  resetActive: async () => {
    const activeTask = getActiveTask(get().tasks);
    if (!activeTask) {
      return;
    }

    const tasks = get().tasks.map((task) =>
      task.id === activeTask.id
        ? {
            ...task,
            status: "paused" as const,
            remainingSeconds: task.durationSeconds,
            updatedAt: now(),
          }
        : task,
    );

    set({ tasks, isRunning: false });
    await guardedPersist(() => saveTask(tasks.find((task) => task.id === activeTask.id)!), (message) =>
      set({ storageError: message }),
    );
  },

  completeActive: async () => {
    const activeTask = getActiveTask(get().tasks);
    if (!activeTask) {
      return;
    }

    const tasks = get().tasks.map((task) =>
      task.id === activeTask.id
        ? {
            ...task,
            status: "completed" as const,
            remainingSeconds: 0,
            updatedAt: now(),
          }
        : task,
    );

    set({
      tasks,
      isRunning: false,
      lastCelebrationAt: get().settings.confettiEnabled || get().settings.soundEnabled ? now() : null,
    });
    await guardedPersist(() => saveTask(tasks.find((task) => task.id === activeTask.id)!), (message) =>
      set({ storageError: message }),
    );
  },

  deleteTask: async (taskId) => {
    const task = get().tasks.find((item) => item.id === taskId);
    const tasks = reindexQueued(get().tasks.filter((item) => item.id !== taskId));

    set({
      tasks,
      isRunning: task?.status === "active" || task?.status === "paused" ? false : get().isRunning,
    });

    await guardedPersist(
      async () => {
        await deleteTaskRecord(taskId);
        await persistTasks(tasks);
      },
      (message) => set({ storageError: message }),
    );
  },

  updateQueuedTask: async (taskId, input) => {
    const queuedTask = get().tasks.find((item) => item.id === taskId && item.status === "queued");
    if (!queuedTask) {
      return;
    }

    const durationMinutes = Number.isFinite(input.durationMinutes) ? input.durationMinutes : DEFAULT_SETTINGS.defaultDurationMinutes;
    const durationSeconds = Math.max(1, Math.round(durationMinutes * 60));
    const updatedTask: Task = {
      ...queuedTask,
      name: input.name.trim() || "Untitled task",
      durationSeconds,
      remainingSeconds: durationSeconds,
      updatedAt: now(),
    };
    const tasks = get().tasks.map((task) => (task.id === taskId ? updatedTask : task));

    set({ tasks });
    await guardedPersist(() => saveTask(updatedTask), (message) => set({ storageError: message }));
  },

  clearQueuedTasks: async () => {
    const queue = queuedTasks(get().tasks);
    if (queue.length === 0) {
      return;
    }

    const tasks = get().tasks.filter((task) => task.status !== "queued");

    set({ tasks });
    await guardedPersist(
      async () => {
        await Promise.all(queue.map((task) => deleteTaskRecord(task.id)));
      },
      (message) => set({ storageError: message }),
    );
  },

  clearCompletedTasks: async () => {
    const completedTasks = get().tasks.filter((task) => task.status === "completed");
    if (completedTasks.length === 0) {
      return;
    }

    const tasks = get().tasks.filter((task) => task.status !== "completed");

    set({ tasks });
    await guardedPersist(
      async () => {
        await Promise.all(completedTasks.map((task) => deleteTaskRecord(task.id)));
      },
      (message) => set({ storageError: message }),
    );
  },

  reorderQueuedTask: async (taskId, nextPosition) => {
    const queue = queuedTasks(get().tasks);
    const taskIndex = queue.findIndex((item) => item.id === taskId);
    const task = queue[taskIndex];
    if (!task) {
      return;
    }

    const reorderedQueue = queue.filter((item) => item.id !== taskId);
    reorderedQueue.splice(Math.max(0, Math.min(nextPosition, reorderedQueue.length)), 0, task);

    const positions = new Map(reorderedQueue.map((item, index) => [item.id, index]));
    const tasks = get().tasks.map((item) =>
      item.status === "queued"
        ? {
            ...item,
            position: positions.get(item.id) ?? item.position,
            updatedAt: now(),
          }
        : item,
    );

    set({ tasks });
    await guardedPersist(() => persistTasks(tasks), (message) => set({ storageError: message }));
  },

  setActiveRemaining: async (remainingSeconds) => {
    const activeTask = getActiveTask(get().tasks);
    if (!activeTask) {
      return;
    }

    const nextRemaining = Math.max(0, Math.ceil(remainingSeconds));
    const tasks = get().tasks.map((task) =>
      task.id === activeTask.id
        ? {
            ...task,
            remainingSeconds: nextRemaining,
            status: nextRemaining === 0 ? ("paused" as const) : task.status,
            updatedAt: now(),
          }
        : task,
    );

    set({ tasks, isRunning: nextRemaining > 0 ? get().isRunning : false });
    await guardedPersist(() => saveTask(tasks.find((task) => task.id === activeTask.id)!), (message) =>
      set({ storageError: message }),
    );
  },

  adjustActiveTime: async (deltaSeconds) => {
    const activeTask = getActiveTask(get().tasks);
    if (!activeTask) {
      return;
    }

    const nextRemaining = Math.max(0, activeTask.remainingSeconds + deltaSeconds);
    const nextDuration = Math.max(1, activeTask.durationSeconds + deltaSeconds, nextRemaining);
    const tasks = get().tasks.map((task) =>
      task.id === activeTask.id
        ? {
            ...task,
            durationSeconds: nextDuration,
            remainingSeconds: nextRemaining,
            status: nextRemaining === 0 ? ("paused" as const) : task.status,
            updatedAt: now(),
          }
        : task,
    );

    set({ tasks, isRunning: nextRemaining > 0 ? get().isRunning : false });
    await guardedPersist(() => saveTask(tasks.find((task) => task.id === activeTask.id)!), (message) =>
      set({ storageError: message }),
    );
  },

  addFocusTime: async (elapsedSeconds) => {
    const seconds = Math.floor(elapsedSeconds);
    if (seconds <= 0) {
      return;
    }

    const date = formatLocalDateKey();
    const currentDay = get().focusHistory.find((day) => day.date === date);
    const updatedDay: FocusHistoryDay = {
      date,
      focusedSeconds: (currentDay?.focusedSeconds ?? 0) + seconds,
      updatedAt: now(),
    };
    const focusHistory = sortFocusHistoryDays(
      currentDay
        ? get().focusHistory.map((day) => (day.date === date ? updatedDay : day))
        : [...get().focusHistory, updatedDay],
    );

    set({ focusHistory });
    await guardedPersist(() => incrementFocusHistoryDay(date, seconds), (message) => set({ storageError: message }));
  },

  addNonProductivityTime: async (category, elapsedSeconds) => {
    const seconds = Math.floor(elapsedSeconds);
    if (seconds <= 0) {
      return;
    }

    const date = formatLocalDateKey();
    const currentDay = get().nonProductivityHistory.find((day) => day.date === date);
    const categories = { ...(currentDay?.categories ?? {}) };
    categories[category] = (categories[category] ?? 0) + seconds;
    const updatedDay: NonProductivityHistoryDay = {
      date,
      seconds: (currentDay?.seconds ?? 0) + seconds,
      categories,
      updatedAt: now(),
    };
    const nonProductivityHistory = sortFocusHistoryDays(
      currentDay
        ? get().nonProductivityHistory.map((day) => (day.date === date ? updatedDay : day))
        : [...get().nonProductivityHistory, updatedDay],
    );

    set({ nonProductivityHistory });
    await guardedPersist(() => incrementNonProductivityHistoryDay(date, category, seconds), (message) =>
      set({ storageError: message }),
    );
  },

  updateSettings: async (settingsUpdate) => {
    const settings = { ...get().settings, ...settingsUpdate };
    set({ settings });
    await guardedPersist(() => saveSettings(settings), (message) => set({ storageError: message }));
  },

  clearStorageError: () => set({ storageError: null }),
}));

export function getActiveTask(tasks: Task[]) {
  return tasks.find((task) => task.status === "active" || task.status === "paused") ?? null;
}

export function getQueuedTasks(tasks: Task[]) {
  return queuedTasks(tasks);
}

export function getCompletedTasks(tasks: Task[]) {
  return tasks
    .filter((task) => task.status === "completed")
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getTotalQueueSeconds(tasks: Task[]) {
  const activeTask = getActiveTask(tasks);
  return (
    (activeTask?.remainingSeconds ?? 0) +
    queuedTasks(tasks).reduce((total, task) => total + task.remainingSeconds, 0)
  );
}

export { PRESET_ROUTINES };
