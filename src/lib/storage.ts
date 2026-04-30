import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS } from "../constants";
import type { Settings, Task, TaskStatus } from "../types";

const DATABASE_URL_COMMAND = "focusapp_database_url";
const LOCAL_STORAGE_KEY = "focusapp.storage.v1";
const SETTINGS_STORAGE_KEY = "focusapp.settings.v1";
const DEFAULT_DURATION_MIGRATION_KEY = "focusapp.default-duration-10-migrated.v1";
const LEGACY_DEFAULT_DURATION_MINUTES = 25;

type LocalStorageData = {
  tasks: Task[];
  settings: Settings;
};

type TaskRow = {
  id: string;
  name: string;
  emoji: string;
  duration_seconds: number;
  remaining_seconds: number;
  status: string;
  position: number;
  created_at: number;
  updated_at: number;
};

type SettingsRow = {
  data: string;
};

let dbPromise: Promise<Database> | null = null;
let dbUrlPromise: Promise<string> | null = null;

function isTauriRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  const tauriWindow = window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } };
  return typeof tauriWindow.__TAURI_INTERNALS__?.invoke === "function";
}

function getDatabaseUrl() {
  dbUrlPromise ??= invoke<string>(DATABASE_URL_COMMAND);
  return dbUrlPromise;
}

function getDatabase() {
  dbPromise ??= getDatabaseUrl().then((databaseUrl) => Database.load(databaseUrl));
  return dbPromise;
}

function readLocalData(): LocalStorageData {
  if (typeof localStorage === "undefined") {
    return { tasks: [], settings: DEFAULT_SETTINGS };
  }

  try {
    const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!storedData) {
      return { tasks: [], settings: readLocalSettings() };
    }

    const parsedData = JSON.parse(storedData) as Partial<LocalStorageData>;
    return {
      tasks: Array.isArray(parsedData.tasks) ? parsedData.tasks.map(localValueToTask).filter((task) => task.id) : [],
      settings: readLocalSettings(normalizeSettings(parsedData.settings)),
    };
  } catch {
    return { tasks: [], settings: readLocalSettings() };
  }
}

function writeLocalData(data: LocalStorageData) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  writeLocalSettings(data.settings);
}

function isThemePreference(theme: unknown): theme is Settings["theme"] {
  return theme === "ember" || theme === "slate" || theme === "forest" || theme === "ocean" || theme === "cat";
}

function normalizeSettings(settings: Partial<Settings> | null | undefined): Settings {
  const theme = isThemePreference(settings?.theme) ? settings.theme : DEFAULT_SETTINGS.theme;
  const defaultDurationMinutes = Number(settings?.defaultDurationMinutes ?? DEFAULT_SETTINGS.defaultDurationMinutes);

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    theme,
    defaultDurationMinutes: Math.max(
      1,
      Number.isFinite(defaultDurationMinutes) ? defaultDurationMinutes : DEFAULT_SETTINGS.defaultDurationMinutes,
    ),
    soundEnabled: settings?.soundEnabled ?? DEFAULT_SETTINGS.soundEnabled,
    confettiEnabled: settings?.confettiEnabled ?? DEFAULT_SETTINGS.confettiEnabled,
    overtimeEnabled: settings?.overtimeEnabled ?? DEFAULT_SETTINGS.overtimeEnabled,
  };
}

function readLocalSettings(fallback: Settings = DEFAULT_SETTINGS): Settings {
  if (typeof localStorage === "undefined") {
    return fallback;
  }

  try {
    const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (storedSettings) {
      return migrateLegacyDefaultDuration(normalizeSettings(JSON.parse(storedSettings) as Partial<Settings>));
    }

    const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedData) {
      const parsedData = JSON.parse(storedData) as Partial<LocalStorageData>;
      return migrateLegacyDefaultDuration(normalizeSettings(parsedData.settings ?? fallback));
    }
  } catch {
    return migrateLegacyDefaultDuration(fallback);
  }

  return migrateLegacyDefaultDuration(fallback);
}

function writeLocalSettings(settings: Settings) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
}

function migrateLegacyDefaultDuration(settings: Settings): Settings {
  if (typeof localStorage === "undefined" || localStorage.getItem(DEFAULT_DURATION_MIGRATION_KEY)) {
    return settings;
  }

  localStorage.setItem(DEFAULT_DURATION_MIGRATION_KEY, "true");
  if (settings.defaultDurationMinutes !== LEGACY_DEFAULT_DURATION_MINUTES) {
    return settings;
  }

  return {
    ...settings,
    defaultDurationMinutes: DEFAULT_SETTINGS.defaultDurationMinutes,
  };
}

function isTaskStatus(status: string): status is TaskStatus {
  return status === "queued" || status === "active" || status === "paused" || status === "completed";
}

function rowToTask(row: TaskRow): Task {
  const status = isTaskStatus(row.status) ? row.status : "queued";

  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    durationSeconds: Number(row.duration_seconds),
    remainingSeconds: Number(row.remaining_seconds),
    status,
    position: Number(row.position),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function localValueToTask(value: Partial<Task & TaskRow>): Task {
  if (typeof value.durationSeconds === "number") {
    const status = typeof value.status === "string" && isTaskStatus(value.status) ? value.status : "queued";

    return {
      id: String(value.id ?? ""),
      name: String(value.name ?? "Untitled task"),
      emoji: String(value.emoji ?? "⚒️"),
      durationSeconds: Number(value.durationSeconds),
      remainingSeconds: Number(value.remainingSeconds ?? value.durationSeconds),
      status,
      position: Number(value.position ?? 0),
      createdAt: Number(value.createdAt ?? Date.now()),
      updatedAt: Number(value.updatedAt ?? Date.now()),
    };
  }

  return rowToTask(value as TaskRow);
}

async function ensureSchema(db: Database) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      remaining_seconds INTEGER NOT NULL,
      status TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

export async function loadFocusappData(): Promise<{ tasks: Task[]; settings: Settings }> {
  if (!isTauriRuntime()) {
    return readLocalData();
  }

  const db = await getDatabase();
  await ensureSchema(db);

  const rows = await db.select<TaskRow[]>("SELECT * FROM tasks ORDER BY position ASC, created_at ASC");
  const settingsRows = await db.select<SettingsRow[]>("SELECT data FROM settings WHERE id = 1");

  const databaseSettings = settingsRows[0]?.data
    ? normalizeSettings(JSON.parse(settingsRows[0].data) as Partial<Settings>)
    : DEFAULT_SETTINGS;
  const settings = readLocalSettings(databaseSettings);

  return {
    tasks: rows.map(rowToTask),
    settings,
  };
}

export async function saveTask(task: Task) {
  if (!isTauriRuntime()) {
    const data = readLocalData();
    const existingTaskIndex = data.tasks.findIndex((item) => item.id === task.id);
    const tasks =
      existingTaskIndex === -1
        ? [...data.tasks, task]
        : data.tasks.map((item) => (item.id === task.id ? task : item));

    writeLocalData({ ...data, tasks });
    return;
  }

  const db = await getDatabase();
  await ensureSchema(db);

  await db.execute(
    `INSERT INTO tasks (
      id,
      name,
      emoji,
      duration_seconds,
      remaining_seconds,
      status,
      position,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      emoji = excluded.emoji,
      duration_seconds = excluded.duration_seconds,
      remaining_seconds = excluded.remaining_seconds,
      status = excluded.status,
      position = excluded.position,
      updated_at = excluded.updated_at`,
    [
      task.id,
      task.name,
      task.emoji,
      task.durationSeconds,
      task.remainingSeconds,
      task.status,
      task.position,
      task.createdAt,
      task.updatedAt,
    ],
  );
}

export async function saveTasks(tasks: Task[]) {
  await Promise.all(tasks.map((task) => saveTask(task)));
}

export async function deleteTaskRecord(taskId: string) {
  if (!isTauriRuntime()) {
    const data = readLocalData();
    writeLocalData({ ...data, tasks: data.tasks.filter((task) => task.id !== taskId) });
    return;
  }

  const db = await getDatabase();
  await db.execute("DELETE FROM tasks WHERE id = $1", [taskId]);
}

export async function saveSettings(settings: Settings) {
  writeLocalSettings(settings);

  if (!isTauriRuntime()) {
    const data = readLocalData();
    writeLocalData({ ...data, settings });
    return;
  }

  const db = await getDatabase();
  await ensureSchema(db);

  await db.execute(
    `INSERT INTO settings (id, data, updated_at)
     VALUES (1, $1, $2)
     ON CONFLICT(id) DO UPDATE SET
       data = excluded.data,
       updated_at = excluded.updated_at`,
    [JSON.stringify(settings), Date.now()],
  );
}
