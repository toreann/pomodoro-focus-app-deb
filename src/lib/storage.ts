import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS } from "../constants";
import type {
  FocusHistoryDay,
  NonProductivityCategory,
  NonProductivityHistoryDay,
  Settings,
  Task,
  TaskStatus,
} from "../types";

const DATABASE_URL_COMMAND = "focusapp_database_url";
const LOCAL_STORAGE_KEY = "focusapp.storage.v1";
const SETTINGS_STORAGE_KEY = "focusapp.settings.v1";
const DEFAULT_DURATION_MIGRATION_KEY = "focusapp.default-duration-10-migrated.v1";
const LEGACY_DEFAULT_DURATION_MINUTES = 25;

type LocalStorageData = {
  tasks: Task[];
  settings: Settings;
  focusHistory: FocusHistoryDay[];
  nonProductivityHistory: NonProductivityHistoryDay[];
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

type FocusHistoryRow = {
  date: string;
  focused_seconds: number;
  updated_at: number;
};

type NonProductivityHistoryRow = {
  date: string;
  category: string;
  seconds: number;
  updated_at: number;
};

let dbPromise: Promise<Database> | null = null;
let dbUrlPromise: Promise<string> | null = null;

const NON_PRODUCTIVITY_CATEGORIES: NonProductivityCategory[] = ["Game", "Social media", "Binge", "Series", "Other"];

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
    return { tasks: [], settings: DEFAULT_SETTINGS, focusHistory: [], nonProductivityHistory: [] };
  }

  try {
    const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!storedData) {
      return { tasks: [], settings: readLocalSettings(), focusHistory: [], nonProductivityHistory: [] };
    }

    const parsedData = JSON.parse(storedData) as Partial<LocalStorageData>;
    return {
      tasks: Array.isArray(parsedData.tasks) ? parsedData.tasks.map(localValueToTask).filter((task) => task.id) : [],
      settings: readLocalSettings(normalizeSettings(parsedData.settings)),
      focusHistory: Array.isArray(parsedData.focusHistory)
        ? parsedData.focusHistory.map(localValueToFocusHistoryDay).filter((day) => day.date)
        : [],
      nonProductivityHistory: Array.isArray(parsedData.nonProductivityHistory)
        ? parsedData.nonProductivityHistory.map(localValueToNonProductivityHistoryDay).filter((day) => day.date)
        : [],
    };
  } catch {
    return { tasks: [], settings: readLocalSettings(), focusHistory: [], nonProductivityHistory: [] };
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

function rowToFocusHistoryDay(row: FocusHistoryRow): FocusHistoryDay {
  return {
    date: row.date,
    focusedSeconds: Math.max(0, Number(row.focused_seconds)),
    updatedAt: Number(row.updated_at),
  };
}

function localValueToFocusHistoryDay(value: Partial<FocusHistoryDay & FocusHistoryRow>): FocusHistoryDay {
  if (typeof value.focusedSeconds === "number") {
    return {
      date: String(value.date ?? ""),
      focusedSeconds: Math.max(0, Math.floor(value.focusedSeconds)),
      updatedAt: Number(value.updatedAt ?? Date.now()),
    };
  }

  return rowToFocusHistoryDay(value as FocusHistoryRow);
}

function isNonProductivityCategory(category: string): category is NonProductivityCategory {
  return NON_PRODUCTIVITY_CATEGORIES.includes(category as NonProductivityCategory);
}

function emptyNonProductivityCategories(): Partial<Record<NonProductivityCategory, number>> {
  return {};
}

function normalizeNonProductivityCategories(
  categories: Partial<Record<NonProductivityCategory, number>> | null | undefined,
) {
  const normalized = emptyNonProductivityCategories();

  for (const category of NON_PRODUCTIVITY_CATEGORIES) {
    const seconds = Math.max(0, Math.floor(Number(categories?.[category] ?? 0)));
    if (seconds > 0) {
      normalized[category] = seconds;
    }
  }

  return normalized;
}

function localValueToNonProductivityHistoryDay(value: Partial<NonProductivityHistoryDay>): NonProductivityHistoryDay {
  const categories = normalizeNonProductivityCategories(value.categories);
  const categorySeconds = Object.values(categories).reduce((total, seconds) => total + (seconds ?? 0), 0);

  return {
    date: String(value.date ?? ""),
    seconds: Math.max(0, Math.floor(Number(value.seconds ?? categorySeconds))),
    categories,
    updatedAt: Number(value.updatedAt ?? Date.now()),
  };
}

function rowsToNonProductivityHistoryDays(rows: NonProductivityHistoryRow[]): NonProductivityHistoryDay[] {
  const days = new Map<string, NonProductivityHistoryDay>();

  for (const row of rows) {
    if (!isNonProductivityCategory(row.category)) {
      continue;
    }

    const seconds = Math.max(0, Number(row.seconds));
    const existingDay =
      days.get(row.date) ??
      ({
        date: row.date,
        seconds: 0,
        categories: {},
        updatedAt: 0,
      } satisfies NonProductivityHistoryDay);

    existingDay.seconds += seconds;
    existingDay.categories[row.category] = (existingDay.categories[row.category] ?? 0) + seconds;
    existingDay.updatedAt = Math.max(existingDay.updatedAt, Number(row.updated_at));
    days.set(row.date, existingDay);
  }

  return [...days.values()];
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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS focus_history (
      date TEXT PRIMARY KEY NOT NULL,
      focused_seconds INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS non_productivity_history (
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      seconds INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (date, category)
    );
  `);
}

export async function loadFocusappData(): Promise<{
  tasks: Task[];
  settings: Settings;
  focusHistory: FocusHistoryDay[];
  nonProductivityHistory: NonProductivityHistoryDay[];
}> {
  if (!isTauriRuntime()) {
    return readLocalData();
  }

  const db = await getDatabase();
  await ensureSchema(db);

  const rows = await db.select<TaskRow[]>("SELECT * FROM tasks ORDER BY position ASC, created_at ASC");
  const settingsRows = await db.select<SettingsRow[]>("SELECT data FROM settings WHERE id = 1");
  const focusHistoryRows = await db.select<FocusHistoryRow[]>("SELECT * FROM focus_history ORDER BY date DESC");
  const nonProductivityHistoryRows = await db.select<NonProductivityHistoryRow[]>(
    "SELECT * FROM non_productivity_history ORDER BY date DESC, category ASC",
  );

  const databaseSettings = settingsRows[0]?.data
    ? normalizeSettings(JSON.parse(settingsRows[0].data) as Partial<Settings>)
    : DEFAULT_SETTINGS;
  const settings = readLocalSettings(databaseSettings);

  return {
    tasks: rows.map(rowToTask),
    settings,
    focusHistory: focusHistoryRows.map(rowToFocusHistoryDay),
    nonProductivityHistory: rowsToNonProductivityHistoryDays(nonProductivityHistoryRows),
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

export async function incrementFocusHistoryDay(date: string, elapsedSeconds: number) {
  const seconds = Math.floor(elapsedSeconds);
  if (seconds <= 0) {
    return;
  }

  if (!isTauriRuntime()) {
    const data = readLocalData();
    const existingDay = data.focusHistory.find((item) => item.date === date);
    const updatedDay: FocusHistoryDay = {
      date,
      focusedSeconds: (existingDay?.focusedSeconds ?? 0) + seconds,
      updatedAt: Date.now(),
    };
    const focusHistory =
      existingDay === undefined
        ? [...data.focusHistory, updatedDay]
        : data.focusHistory.map((item) => (item.date === date ? updatedDay : item));

    writeLocalData({ ...data, focusHistory });
    return;
  }

  const db = await getDatabase();
  await ensureSchema(db);

  await db.execute(
    `INSERT INTO focus_history (
      date,
      focused_seconds,
      updated_at
    ) VALUES ($1, $2, $3)
    ON CONFLICT(date) DO UPDATE SET
      focused_seconds = focus_history.focused_seconds + excluded.focused_seconds,
      updated_at = excluded.updated_at`,
    [date, seconds, Date.now()],
  );
}

export async function incrementNonProductivityHistoryDay(
  date: string,
  category: NonProductivityCategory,
  elapsedSeconds: number,
) {
  const seconds = Math.floor(elapsedSeconds);
  if (seconds <= 0) {
    return;
  }

  if (!isTauriRuntime()) {
    const data = readLocalData();
    const existingDay = data.nonProductivityHistory.find((item) => item.date === date);
    const categories = normalizeNonProductivityCategories(existingDay?.categories);
    categories[category] = (categories[category] ?? 0) + seconds;
    const updatedDay: NonProductivityHistoryDay = {
      date,
      seconds: (existingDay?.seconds ?? 0) + seconds,
      categories,
      updatedAt: Date.now(),
    };
    const nonProductivityHistory =
      existingDay === undefined
        ? [...data.nonProductivityHistory, updatedDay]
        : data.nonProductivityHistory.map((item) => (item.date === date ? updatedDay : item));

    writeLocalData({ ...data, nonProductivityHistory });
    return;
  }

  const db = await getDatabase();
  await ensureSchema(db);

  await db.execute(
    `INSERT INTO non_productivity_history (
      date,
      category,
      seconds,
      updated_at
    ) VALUES ($1, $2, $3, $4)
    ON CONFLICT(date, category) DO UPDATE SET
      seconds = non_productivity_history.seconds + excluded.seconds,
      updated_at = excluded.updated_at`,
    [date, category, seconds, Date.now()],
  );
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
