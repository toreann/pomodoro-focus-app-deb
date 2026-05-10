import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Flame,
  Gamepad2,
  GripVertical,
  Hammer,
  ListTodo,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  Sparkles,
  TimerReset,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./App.css";
import {
  getActiveTask,
  getCompletedTasks,
  getQueuedTasks,
  PRESET_ROUTINES,
  useFocusStore,
} from "./store/focusStore";
import type { FocusHistoryDay, NonProductivityCategory, NonProductivityHistoryDay, Settings, Task, ThemePreference } from "./types";
import { useTimer } from "./hooks/useTimer";
import { formatCompactDuration, formatDuration, formatFinishTime, formatHistoryDayLabel } from "./lib/time";

const emojiChoices = ["⚒️", "🔥", "✨", "🐾", "📓", "☕", "🗡️", "🪣"];
const COMPLETION_CHIME_INTERVAL_MS = 1800;
const DEFAULT_FREE_FOCUS_BREAK_MINUTES = 25;
const MIN_FREE_FOCUS_BREAK_MINUTES = 1;
const MAX_FREE_FOCUS_BREAK_MINUTES = 240;
const DEFAULT_GAME_CONTROL_MINUTES = 30;
const MIN_GAME_CONTROL_MINUTES = 1;
const MAX_GAME_CONTROL_MINUTES = 480;
const NON_PRODUCTIVITY_CATEGORIES: NonProductivityCategory[] = ["Game", "Social media", "Binge", "Series", "Other"];
const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "ember", label: "Minimal" },
  { value: "slate", label: "Slate" },
  { value: "forest", label: "Forest" },
  { value: "ocean", label: "Ocean" },
  { value: "cat", label: "Cat" },
];
const THEME_TIMER_STATES: Record<ThemePreference, { idleTitle: string; idleEmoji: string }> = {
  ember: { idleTitle: "Ready when you are", idleEmoji: "◎" },
  slate: { idleTitle: "The stone is quiet", idleEmoji: "🪨" },
  forest: { idleTitle: "The path is waiting", idleEmoji: "🌿" },
  ocean: { idleTitle: "The sea is waiting for you to sail", idleEmoji: "🌊" },
  cat: { idleTitle: "The sunbeam is waiting", idleEmoji: "🐾" },
};
type DropEdge = "top" | "bottom";
type DropTarget = { taskId: string; edge: DropEdge } | null;
type ToastTone = "success" | "info" | "warning";
type ToastMessage = {
  id: string;
  title: string;
  detail: string;
  tone: ToastTone;
};

function playCompletionChime() {
  const AudioContext =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
  if (!AudioContext) {
    return;
  }

  const context = new AudioContext();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
  gain.connect(context.destination);

  [440, 660].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.frequency.value = frequency;
    oscillator.type = "triangle";
    oscillator.connect(gain);
    oscillator.start(context.currentTime + index * 0.08);
    oscillator.stop(context.currentTime + 0.5);
  });

  window.setTimeout(() => void context.close(), 650);
}

function playCongratsChime() {
  const AudioContext =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
  if (!AudioContext) {
    return;
  }

  const context = new AudioContext();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.86);
  gain.connect(context.destination);

  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    oscillator.connect(gain);
    oscillator.start(context.currentTime + index * 0.08);
    oscillator.stop(context.currentTime + 0.82);
  });

  window.setTimeout(() => void context.close(), 1000);
}

function App() {
  const {
    tasks,
    focusHistory,
    nonProductivityHistory,
    settings,
    isHydrated,
    isRunning,
    storageError,
    lastCelebrationAt,
    initialize,
    addTask,
    applyPreset,
    startNext,
    pauseActive,
    resumeActive,
    resetActive,
    completeActive,
    deleteTask,
    updateQueuedTask,
    clearQueuedTasks,
    clearCompletedTasks,
    reorderQueuedTask,
    setActiveRemaining,
    adjustActiveTime,
    addFocusTime,
    addNonProductivityTime,
    updateSettings,
    clearStorageError,
  } = useFocusStore();

  const [currentPage, setCurrentPage] = useState<"timer" | "history">("timer");
  const [taskName, setTaskName] = useState("");
  const [taskEmoji, setTaskEmoji] = useState("⚒️");
  const [durationMinutes, setDurationMinutes] = useState(settings.defaultDurationMinutes);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [freeFocusModalOpen, setFreeFocusModalOpen] = useState(false);
  const [freeFocusBreakMinutes, setFreeFocusBreakMinutes] = useState(DEFAULT_FREE_FOCUS_BREAK_MINUTES);
  const [freeFocusDraftMinutes, setFreeFocusDraftMinutes] = useState(DEFAULT_FREE_FOCUS_BREAK_MINUTES);
  const [freeFocusStartedAt, setFreeFocusStartedAt] = useState<number | null>(null);
  const [freeFocusElapsedSeconds, setFreeFocusElapsedSeconds] = useState(0);
  const [freeFocusBreakDue, setFreeFocusBreakDue] = useState(false);
  const [gameControlModalOpen, setGameControlModalOpen] = useState(false);
  const [gameControlLimitMinutes, setGameControlLimitMinutes] = useState(DEFAULT_GAME_CONTROL_MINUTES);
  const [gameControlDraftMinutes, setGameControlDraftMinutes] = useState(DEFAULT_GAME_CONTROL_MINUTES);
  const [gameControlCategory, setGameControlCategory] = useState<NonProductivityCategory>("Game");
  const [gameControlDraftCategory, setGameControlDraftCategory] = useState<NonProductivityCategory>("Game");
  const [gameControlStartedAt, setGameControlStartedAt] = useState<number | null>(null);
  const [gameControlElapsedSeconds, setGameControlElapsedSeconds] = useState(0);
  const [gameControlLimitReached, setGameControlLimitReached] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const finishedToastTaskId = useRef<string | null>(null);
  const freeFocusPersistedSeconds = useRef(0);
  const gameControlPersistedSeconds = useRef(0);

  const activeTask = useMemo(() => getActiveTask(tasks), [tasks]);
  const queued = useMemo(() => getQueuedTasks(tasks), [tasks]);
  const completed = useMemo(() => getCompletedTasks(tasks), [tasks]);
  const freeFocusRunning = freeFocusStartedAt !== null;
  const gameControlRunning = gameControlStartedAt !== null;

  const timer = useTimer({
    activeTask,
    isRunning,
    overtimeEnabled: settings.overtimeEnabled,
    onStart: startNext,
    onPause: pauseActive,
    onResume: resumeActive,
    onReset: resetActive,
    onComplete: completeActive,
    onSetRemaining: setActiveRemaining,
    onAdjustTime: adjustActiveTime,
    onFocusElapsed: addFocusTime,
  });

  const displayActiveTask = useMemo(
    () => (activeTask ? { ...activeTask, remainingSeconds: timer.remainingSeconds } : null),
    [activeTask, timer.remainingSeconds],
  );
  const totalQueueSeconds = useMemo(
    () => (displayActiveTask?.remainingSeconds ?? 0) + queued.reduce((total, task) => total + task.remainingSeconds, 0),
    [displayActiveTask?.remainingSeconds, queued],
  );
  const finishTime = useMemo(() => formatFinishTime(totalQueueSeconds), [totalQueueSeconds]);
  const timerIsDone = timer.isReadyToComplete;

  const addToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setToasts((currentToasts) => [...currentToasts.slice(-2), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((currentToast) => currentToast.id !== id));
    }, 3600);
  }, []);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    setDurationMinutes(settings.defaultDurationMinutes);
  }, [settings.defaultDurationMinutes]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    if (!lastCelebrationAt) {
      return;
    }

    if (settings.soundEnabled) {
      playCongratsChime();
    }

    addToast({
      title: "Task completed",
      detail: "Nice work. The task moved to your finished list.",
      tone: "success",
    });

    if (settings.confettiEnabled) {
      setShowConfetti(true);
      const timeout = window.setTimeout(() => setShowConfetti(false), 1500);
      return () => window.clearTimeout(timeout);
    }
  }, [addToast, lastCelebrationAt, settings.confettiEnabled, settings.soundEnabled]);

  useEffect(() => {
    if (!timerIsDone || !displayActiveTask) {
      if (!timerIsDone) {
        finishedToastTaskId.current = null;
      }
      return;
    }

    if (finishedToastTaskId.current !== displayActiveTask.id) {
      finishedToastTaskId.current = displayActiveTask.id;
      addToast({
        title: "Timer finished",
        detail: "Mark the task complete when you are ready.",
        tone: "warning",
      });
    }

    if (!settings.soundEnabled) {
      return;
    }

    playCompletionChime();
    const interval = window.setInterval(playCompletionChime, COMPLETION_CHIME_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [addToast, displayActiveTask, settings.soundEnabled, timerIsDone]);

  useEffect(() => {
    if (!freeFocusStartedAt) {
      return;
    }

    const breakAfterSeconds = freeFocusBreakMinutes * 60;

    const syncFreeFocus = () => {
      const nextElapsedSeconds = Math.max(0, Math.floor((Date.now() - freeFocusStartedAt) / 1000));
      setFreeFocusElapsedSeconds(nextElapsedSeconds);

      if (nextElapsedSeconds > freeFocusPersistedSeconds.current) {
        const elapsedDelta = nextElapsedSeconds - freeFocusPersistedSeconds.current;
        freeFocusPersistedSeconds.current = nextElapsedSeconds;
        void addFocusTime(elapsedDelta);
      }

      if (nextElapsedSeconds >= breakAfterSeconds) {
        setFreeFocusBreakDue(true);
      }
    };

    syncFreeFocus();
    const interval = window.setInterval(syncFreeFocus, 250);

    return () => window.clearInterval(interval);
  }, [addFocusTime, freeFocusBreakMinutes, freeFocusStartedAt]);

  useEffect(() => {
    if (!freeFocusBreakDue) {
      return;
    }

    addToast({
      title: "Break reminder",
      detail: "Your focus interval is done. Stop the timer when you are ready.",
      tone: "warning",
    });

    if (!settings.soundEnabled) {
      return;
    }

    playCompletionChime();
    const interval = window.setInterval(playCompletionChime, COMPLETION_CHIME_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [addToast, freeFocusBreakDue, settings.soundEnabled]);

  useEffect(() => {
    if (!gameControlStartedAt) {
      return;
    }

    const limitSeconds = gameControlLimitMinutes * 60;

    const syncGameControl = () => {
      const nextElapsedSeconds = Math.max(0, Math.floor((Date.now() - gameControlStartedAt) / 1000));
      setGameControlElapsedSeconds(nextElapsedSeconds);

      if (nextElapsedSeconds > gameControlPersistedSeconds.current) {
        const elapsedDelta = nextElapsedSeconds - gameControlPersistedSeconds.current;
        gameControlPersistedSeconds.current = nextElapsedSeconds;
        void addNonProductivityTime(gameControlCategory, elapsedDelta);
      }

      if (nextElapsedSeconds >= limitSeconds) {
        setGameControlLimitReached(true);
      }
    };

    syncGameControl();
    const interval = window.setInterval(syncGameControl, 250);

    return () => window.clearInterval(interval);
  }, [addNonProductivityTime, gameControlCategory, gameControlLimitMinutes, gameControlStartedAt]);

  useEffect(() => {
    if (!gameControlLimitReached) {
      return;
    }

    addToast({
      title: "Pastime Control limit reached",
      detail: "Your No-count timer reached the limit. Stop it when you are done.",
      tone: "warning",
    });

    if (!settings.soundEnabled) {
      return;
    }

    playCompletionChime();
    const interval = window.setInterval(playCompletionChime, COMPLETION_CHIME_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [addToast, gameControlLimitReached, settings.soundEnabled]);

  function openFreeFocusModal() {
    if (gameControlRunning) {
      return;
    }

    setFreeFocusDraftMinutes(freeFocusBreakMinutes);
    setFreeFocusModalOpen(true);
    setGameControlModalOpen(false);
    setSettingsOpen(false);
    setPresetsOpen(false);
  }

  function handleStartFreeFocus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeTask || freeFocusRunning || gameControlRunning) {
      return;
    }

    const safeMinutes = Math.min(
      MAX_FREE_FOCUS_BREAK_MINUTES,
      Math.max(MIN_FREE_FOCUS_BREAK_MINUTES, Math.round(Number(freeFocusDraftMinutes) || DEFAULT_FREE_FOCUS_BREAK_MINUTES)),
    );

    freeFocusPersistedSeconds.current = 0;
    setFreeFocusBreakMinutes(safeMinutes);
    setFreeFocusElapsedSeconds(0);
    setFreeFocusBreakDue(false);
    setFreeFocusStartedAt(Date.now());
    setFreeFocusModalOpen(false);
    addToast({
      title: "Focus timer started",
      detail: `Break reminder set for ${safeMinutes} minutes.`,
      tone: "info",
    });
  }

  function stopFreeFocus() {
    if (freeFocusStartedAt) {
      const finalElapsedSeconds = Math.max(0, Math.floor((Date.now() - freeFocusStartedAt) / 1000));
      if (finalElapsedSeconds > freeFocusPersistedSeconds.current) {
        void addFocusTime(finalElapsedSeconds - freeFocusPersistedSeconds.current);
      }
    }

    setFreeFocusStartedAt(null);
    setFreeFocusElapsedSeconds(0);
    setFreeFocusBreakDue(false);
    freeFocusPersistedSeconds.current = 0;
    addToast({
      title: "Focus timer stopped",
      detail: "The no-task timer is idle again.",
      tone: "info",
    });
  }

  function openGameControlModal() {
    if (freeFocusRunning) {
      return;
    }

    setGameControlDraftMinutes(gameControlLimitMinutes);
    setGameControlDraftCategory(gameControlCategory);
    setGameControlModalOpen(true);
    setFreeFocusModalOpen(false);
    setSettingsOpen(false);
    setPresetsOpen(false);
  }

  function handleStartGameControl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeTask || freeFocusRunning || gameControlRunning) {
      return;
    }

    const safeMinutes = Math.min(
      MAX_GAME_CONTROL_MINUTES,
      Math.max(MIN_GAME_CONTROL_MINUTES, Math.round(Number(gameControlDraftMinutes) || DEFAULT_GAME_CONTROL_MINUTES)),
    );

    gameControlPersistedSeconds.current = 0;
    setGameControlLimitMinutes(safeMinutes);
    setGameControlCategory(gameControlDraftCategory);
    setGameControlElapsedSeconds(0);
    setGameControlLimitReached(false);
    setGameControlStartedAt(Date.now());
    setGameControlModalOpen(false);
    addToast({
      title: "Pastime Control started",
      detail: `${gameControlDraftCategory} limit set for ${safeMinutes} minutes.`,
      tone: "info",
    });
  }

  function stopGameControl() {
    if (gameControlStartedAt) {
      const finalElapsedSeconds = Math.max(0, Math.floor((Date.now() - gameControlStartedAt) / 1000));
      if (finalElapsedSeconds > gameControlPersistedSeconds.current) {
        void addNonProductivityTime(gameControlCategory, finalElapsedSeconds - gameControlPersistedSeconds.current);
      }
    }

    setGameControlStartedAt(null);
    setGameControlElapsedSeconds(0);
    setGameControlLimitReached(false);
    gameControlPersistedSeconds.current = 0;
    addToast({
      title: "Pastime Control stopped",
      detail: "No-count time was recorded.",
      tone: "info",
    });
  }

  async function handleAddTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await addTask({
      name: taskName,
      emoji: taskEmoji,
      durationMinutes,
    });
    addToast({
      title: "Task added",
      detail: "It is waiting in your queue.",
      tone: "info",
    });
    setTaskName("");
  }

  return (
    <main className="min-h-screen overflow-y-auto bg-[var(--app-bg)] text-[var(--ink)]">
      <div className="forge-glow" />
      {showConfetti ? <Confetti /> : null}
      <ToastStack toasts={toasts} onDismiss={(toastId) => setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId))} />

      <div className="app-layout relative mx-auto flex min-h-screen w-full flex-col">
        <header className="app-shell compact-header">
          <div className="header-title-row">
            <div className="flex min-w-0 items-center gap-3">
              <div className="brand-mark" aria-hidden="true">
                <Hammer size={20} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-black leading-none text-[var(--ink-strong)]">Focusapp</h1>
              </div>
            </div>
            <button
              className="subtle-button compact history-nav-button"
              type="button"
              onClick={() => {
                setCurrentPage("history");
                setSettingsOpen(false);
                setPresetsOpen(false);
              }}
              disabled={currentPage === "history"}
            >
              <BarChart3 size={16} />
              Productivity History
            </button>
          </div>

          <div className="compact-metrics">
            <Metric label="Queue" value={formatCompactDuration(totalQueueSeconds)} icon={<ListTodo size={17} />} />
            <Metric label="Finish" value={finishTime} icon={<Flame size={17} />} />
            <button className="icon-button" type="button" title="Open settings" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon size={20} />
            </button>
          </div>
        </header>

        {storageError ? (
          <div className="app-shell flex items-center justify-between gap-3 border-[var(--danger)]/50 px-4 py-3 text-sm text-[var(--danger-text)]">
            <span>{storageError}</span>
            <button className="subtle-button" type="button" onClick={clearStorageError}>
              Dismiss
            </button>
          </div>
        ) : null}

        {currentPage === "history" ? (
          <HistoryPage
            focusHistory={focusHistory}
            nonProductivityHistory={nonProductivityHistory}
            onBack={() => setCurrentPage("timer")}
          />
        ) : (
          <section className="grid flex-1 gap-3">
            <TimerPanel
              activeTask={displayActiveTask}
              isHydrated={isHydrated}
              isRunning={isRunning}
              isDone={timerIsDone}
              shouldHighlightComplete={timerIsDone}
              progress={timer.progress}
              overtimeSeconds={timer.overtimeSeconds}
              freeFocusRunning={freeFocusRunning}
              freeFocusBreakDue={freeFocusBreakDue}
              freeFocusElapsedSeconds={freeFocusElapsedSeconds}
              freeFocusBreakMinutes={freeFocusBreakMinutes}
              gameControlRunning={gameControlRunning}
              gameControlLimitReached={gameControlLimitReached}
              gameControlElapsedSeconds={gameControlElapsedSeconds}
              gameControlLimitMinutes={gameControlLimitMinutes}
              gameControlCategory={gameControlCategory}
              hasQueuedTasks={queued.length > 0}
              theme={settings.theme}
              onStart={timer.start}
              onPause={timer.pause}
              onResume={timer.resume}
              onReset={timer.reset}
              onComplete={timer.complete}
              onAddFiveMinutes={timer.addFiveMinutes}
              onSubtractFiveMinutes={timer.subtractFiveMinutes}
              onOpenFreeFocus={openFreeFocusModal}
              onStopFreeFocus={stopFreeFocus}
              onOpenGameControl={openGameControlModal}
              onStopGameControl={stopGameControl}
            />

            <div className="flex min-w-0 flex-col gap-3">
              <form className="app-shell compact-section grid gap-3" onSubmit={handleAddTask}>
                <div className="task-form-header">
                  <div>
                    <h2 className="panel-title">New task</h2>
                  </div>
                  <div className="form-actions">
                    <button className="subtle-button" type="button" onClick={() => setPresetsOpen(true)}>
                      <Sparkles size={17} />
                      Presets
                    </button>
                    <button className="primary-button" type="submit">
                      <Plus size={18} />
                      Add task
                    </button>
                  </div>
                </div>

                <div className="task-form-fields">
                  <label className="field">
                    <span>Task name</span>
                    <input
                      value={taskName}
                      onChange={(event) => setTaskName(event.target.value)}
                      placeholder="What are you focusing on?"
                    />
                  </label>
                  <label className="field">
                    <span>Emoji</span>
                    <select value={taskEmoji} onChange={(event) => setTaskEmoji(event.target.value)}>
                      {emojiChoices.map((emoji) => (
                        <option key={emoji} value={emoji}>
                          {emoji}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Minutes</span>
                    <input
                      min="1"
                      max="240"
                      type="number"
                      value={durationMinutes}
                      onChange={(event) => setDurationMinutes(Number(event.target.value))}
                    />
                  </label>
                </div>
              </form>

              <QueuePanel
                activeTask={displayActiveTask}
                queued={queued}
                completed={completed}
                onDelete={deleteTask}
                onUpdateQueuedTask={updateQueuedTask}
                onClearQueuedTasks={clearQueuedTasks}
                onClearCompletedTasks={clearCompletedTasks}
                onReorder={reorderQueuedTask}
              />
            </div>
          </section>
        )}
      </div>

      {presetsOpen ? (
        <PresetOverlay
          hasCurrentTasks={Boolean(activeTask || queued.length > 0)}
          onClose={() => setPresetsOpen(false)}
          onApply={applyPreset}
          onLoaded={(presetName) => {
            setPresetsOpen(false);
            addToast({
              title: "Preset loaded",
              detail: `${presetName} replaced the current queue.`,
              tone: "info",
            });
          }}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsPanel settings={settings} onClose={() => setSettingsOpen(false)} onChange={updateSettings} />
      ) : null}

      {freeFocusModalOpen ? (
        <FreeFocusModal
          minutes={freeFocusDraftMinutes}
          onMinutesChange={setFreeFocusDraftMinutes}
          onClose={() => setFreeFocusModalOpen(false)}
          onStart={handleStartFreeFocus}
        />
      ) : null}

      {gameControlModalOpen ? (
        <GameControlModal
          category={gameControlDraftCategory}
          minutes={gameControlDraftMinutes}
          onCategoryChange={setGameControlDraftCategory}
          onMinutesChange={setGameControlDraftMinutes}
          onClose={() => setGameControlModalOpen(false)}
          onStart={handleStartGameControl}
        />
      ) : null}
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="metric">
      <span className="text-[var(--ember)]">{icon}</span>
      <span>
        <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
        <span className="block text-sm font-black text-[var(--ink-strong)]">{value}</span>
      </span>
    </div>
  );
}

function HistoryPage({
  focusHistory,
  nonProductivityHistory,
  onBack,
}: {
  focusHistory: FocusHistoryDay[];
  nonProductivityHistory: NonProductivityHistoryDay[];
  onBack: () => void;
}) {
  const totalFocusedSeconds = useMemo(
    () => focusHistory.reduce((total, day) => total + day.focusedSeconds, 0),
    [focusHistory],
  );
  const totalNonProductiveSeconds = useMemo(
    () => nonProductivityHistory.reduce((total, day) => total + day.seconds, 0),
    [nonProductivityHistory],
  );

  return (
    <section className="history-page app-shell compact-section">
      <div className="mb-4 flex items-start justify-between gap-3">
        <button className="icon-button" type="button" title="Back to timer" aria-label="Back to timer" onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Productivity history</p>
          <h2 className="panel-title">Focused by day</h2>
        </div>
        <div className="history-total" aria-label={`Total focus time ${formatCompactDuration(totalFocusedSeconds)}`}>
          <span>Total</span>
          <strong>{formatCompactDuration(totalFocusedSeconds)}</strong>
        </div>
      </div>

      {focusHistory.length > 0 ? (
        <div className="history-list">
          {focusHistory.map((day) => (
            <article className="history-row" key={day.date}>
              <div className="min-w-0">
                <h3>{formatHistoryDayLabel(day.date)}</h3>
                <p>{day.date}</p>
              </div>
              <strong>{formatCompactDuration(day.focusedSeconds)}</strong>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <BarChart3 size={22} />
          <span>
            <strong>No focus time recorded yet.</strong>
            <span>Start a timer and your daily totals will appear here.</span>
          </span>
        </div>
      )}

      <div className="no-count-history">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow danger-eyebrow">No-count</p>
            <h2 className="panel-title">Non-productivity history</h2>
          </div>
          <div className="history-total no-count-total" aria-label={`No-count time ${formatCompactDuration(totalNonProductiveSeconds)}`}>
            <span>No-count</span>
            <strong>{formatCompactDuration(totalNonProductiveSeconds)}</strong>
          </div>
        </div>

        {nonProductivityHistory.length > 0 ? (
          <div className="history-list">
            {nonProductivityHistory.map((day) => (
              <article className="history-row no-count-row" key={day.date}>
                <div className="min-w-0">
                  <div className="history-row-heading">
                    <h3>{formatHistoryDayLabel(day.date)}</h3>
                    <span>No-count</span>
                  </div>
                  <p>{day.date}</p>
                  <p className="category-breakdown">{formatCategoryBreakdown(day.categories)}</p>
                </div>
                <strong>{formatCompactDuration(day.seconds)}</strong>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state no-count-empty">
            <Gamepad2 size={22} />
            <span>
              <strong>No No-count time recorded yet.</strong>
              <span>Pastime Control sessions will appear here.</span>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function formatCategoryBreakdown(categories: NonProductivityHistoryDay["categories"]) {
  const categoryLabels = NON_PRODUCTIVITY_CATEGORIES.flatMap((category) => {
    const seconds = categories[category] ?? 0;
    return seconds > 0 ? [`${category}: ${formatCompactDuration(seconds)}`] : [];
  });

  return categoryLabels.length > 0 ? categoryLabels.join(" · ") : "No categories yet";
}

function TimerPanel({
  activeTask,
  isHydrated,
  isRunning,
  isDone,
  shouldHighlightComplete,
  progress,
  overtimeSeconds,
  freeFocusRunning,
  freeFocusBreakDue,
  freeFocusElapsedSeconds,
  freeFocusBreakMinutes,
  gameControlRunning,
  gameControlLimitReached,
  gameControlElapsedSeconds,
  gameControlLimitMinutes,
  gameControlCategory,
  hasQueuedTasks,
  theme,
  onStart,
  onPause,
  onResume,
  onReset,
  onComplete,
  onAddFiveMinutes,
  onSubtractFiveMinutes,
  onOpenFreeFocus,
  onStopFreeFocus,
  onOpenGameControl,
  onStopGameControl,
}: {
  activeTask: Task | null;
  isHydrated: boolean;
  isRunning: boolean;
  isDone: boolean;
  shouldHighlightComplete: boolean;
  progress: number;
  overtimeSeconds: number;
  freeFocusRunning: boolean;
  freeFocusBreakDue: boolean;
  freeFocusElapsedSeconds: number;
  freeFocusBreakMinutes: number;
  gameControlRunning: boolean;
  gameControlLimitReached: boolean;
  gameControlElapsedSeconds: number;
  gameControlLimitMinutes: number;
  gameControlCategory: NonProductivityCategory;
  hasQueuedTasks: boolean;
  theme: ThemePreference;
  onStart: () => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onReset: () => Promise<void>;
  onComplete: () => Promise<void>;
  onAddFiveMinutes: () => Promise<void>;
  onSubtractFiveMinutes: () => Promise<void>;
  onOpenFreeFocus: () => void;
  onStopFreeFocus: () => void;
  onOpenGameControl: () => void;
  onStopGameControl: () => void;
}) {
  const idleThemeState = THEME_TIMER_STATES[theme];
  const freeFocusBreakSeconds = freeFocusBreakMinutes * 60;
  const gameControlLimitSeconds = gameControlLimitMinutes * 60;
  const noTaskTimerRunning = freeFocusRunning || gameControlRunning;
  const timerTitle = activeTask
    ? activeTask.name
    : gameControlRunning
      ? `${gameControlCategory} control`
      : freeFocusRunning
        ? "Free focus timer"
        : idleThemeState.idleTitle;
  const timerStatus = activeTask
    ? isRunning
      ? "Running"
      : isDone
        ? "Ready"
        : "Idle"
    : gameControlLimitReached
      ? "No-count limit"
      : gameControlRunning
        ? "Running"
        : freeFocusBreakDue
          ? "Break due"
          : freeFocusRunning
            ? "Running"
            : "Idle";
  const timerProgress = activeTask
    ? progress
    : gameControlRunning
      ? Math.min(100, (gameControlElapsedSeconds / gameControlLimitSeconds) * 100)
      : freeFocusRunning
        ? Math.min(100, (freeFocusElapsedSeconds / freeFocusBreakSeconds) * 100)
        : 0;
  const timerAttention = freeFocusBreakDue || gameControlLimitReached;

  return (
    <section className="timer-panel app-shell compact-section relative flex flex-col justify-between overflow-hidden">
      <div className="anvil-line" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Active task</p>
          <h2 className="panel-title">{timerTitle}</h2>
        </div>
        <div className={`status-pill ${timerAttention ? "attention" : ""}`}>
          {activeTask ? (
            isRunning ? (
              <Flame size={16} />
            ) : (
              <TimerReset size={16} />
            )
          ) : gameControlRunning ? (
            <Gamepad2 size={16} />
          ) : freeFocusRunning ? (
            <Flame size={16} />
          ) : (
            <TimerReset size={16} />
          )}
          {timerStatus}
        </div>
      </div>

      <div className="grid place-items-center py-4">
        <div className="timer-ring" style={{ "--progress": `${timerProgress}%` } as CSSProperties}>
          <div className="timer-core">
            <span className="text-4xl" aria-hidden="true">
              {activeTask?.emoji ?? (gameControlRunning ? "🎮" : freeFocusRunning ? "◎" : idleThemeState.idleEmoji)}
            </span>
            <strong className="timer-time">
              {activeTask
                ? formatDuration(activeTask.remainingSeconds)
                : gameControlRunning
                  ? formatDuration(gameControlElapsedSeconds)
                  : freeFocusRunning
                    ? formatDuration(freeFocusElapsedSeconds)
                    : "--:--"}
            </strong>
            {isDone && overtimeSeconds > 0 ? (
              <span className="overtime-pill">+{formatDuration(overtimeSeconds)} overtime</span>
            ) : null}
            {freeFocusBreakDue ? <span className="overtime-pill break-due">5m break due</span> : null}
            {gameControlLimitReached ? <span className="overtime-pill break-due">No-count limit reached</span> : null}
            <span className="max-w-[230px] text-center text-sm font-semibold text-[var(--muted)]">
              {activeTask
                ? isDone
                  ? "Mark it complete when you are ready."
                  : `${formatCompactDuration(activeTask.durationSeconds)} focus block`
                : gameControlLimitReached
                  ? "Stop the timer to silence the chime."
                  : gameControlRunning
                    ? `${gameControlCategory} limit at ${formatCompactDuration(gameControlLimitSeconds)}.`
                : freeFocusBreakDue
                  ? "Stop the timer to silence the chime."
                  : freeFocusRunning
                    ? `Break reminder at ${formatCompactDuration(freeFocusBreakSeconds)}.`
                : isHydrated
                  ? "Time to get to work."
                  : "Loading..."}
            </span>
          </div>
        </div>
      </div>

      <div className="timer-adjustments">
        <button className="tool-button" type="button" onClick={() => void onSubtractFiveMinutes()} disabled={!activeTask || noTaskTimerRunning}>
          -5m
        </button>
        <button className="tool-button" type="button" onClick={() => void onAddFiveMinutes()} disabled={!activeTask || noTaskTimerRunning}>
          +5m
        </button>
      </div>

      <div className="grid gap-2">
        {gameControlRunning ? (
          <button className={`primary-button justify-center ${gameControlLimitReached ? "attention" : ""}`} type="button" onClick={onStopGameControl}>
            <X size={19} />
            Stop Pastime Control
          </button>
        ) : freeFocusRunning ? (
          <button className={`primary-button justify-center ${freeFocusBreakDue ? "attention" : ""}`} type="button" onClick={onStopFreeFocus}>
            <X size={19} />
            Stop timer
          </button>
        ) : !activeTask || isDone ? (
          <button className="primary-button justify-center" type="button" onClick={() => void onStart()} disabled={isDone || !hasQueuedTasks}>
            <Play size={19} />
            Start next task
          </button>
        ) : isRunning ? (
          <button className="primary-button justify-center" type="button" onClick={() => void onPause()}>
            <Pause size={19} />
            Pause
          </button>
        ) : (
          <button className="primary-button justify-center" type="button" onClick={() => void onResume()}>
            <Play size={19} />
            Resume
          </button>
        )}

        {activeTask ? (
          <div className="grid grid-cols-2 gap-2">
            <button className="tool-button" type="button" onClick={() => void onReset()} disabled={!activeTask}>
              <RotateCcw size={18} />
              Reset
            </button>
            <button
              className={`tool-button success ${shouldHighlightComplete ? "attention" : ""}`}
              type="button"
              onClick={() => void onComplete()}
              disabled={!activeTask}
            >
              <CheckCircle2 size={18} />
              Complete
            </button>
          </div>
        ) : !noTaskTimerRunning ? (
          <div className="grid grid-cols-2 gap-2">
            <button className="tool-button success" type="button" onClick={onOpenFreeFocus} disabled={!isHydrated || freeFocusRunning}>
              <Play size={18} />
              Start focus timer
            </button>
            <button className="tool-button danger-accent" type="button" onClick={onOpenGameControl} disabled={!isHydrated || gameControlRunning}>
              <Gamepad2 size={18} />
              Pastime Control
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FreeFocusModal({
  minutes,
  onMinutesChange,
  onClose,
  onStart,
}: {
  minutes: number;
  onMinutesChange: (minutes: number) => void;
  onClose: () => void;
  onStart: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <aside className="preset-backdrop" aria-label="Start focus timer">
      <form className="free-focus-panel app-shell compact-section" onSubmit={onStart}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">No-task timer</p>
            <h2 className="panel-title">When should the break chime play?</h2>
          </div>
          <button className="icon-button" type="button" title="Close focus timer setup" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <label className="field">
          <span>Minutes before 5m break</span>
          <input
            min={MIN_FREE_FOCUS_BREAK_MINUTES}
            max={MAX_FREE_FOCUS_BREAK_MINUTES}
            type="number"
            value={minutes}
            onChange={(event) => onMinutesChange(Number(event.target.value))}
            autoFocus
          />
        </label>

        <div className="free-focus-actions">
          <button className="subtle-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            <Play size={18} />
            Start timer
          </button>
        </div>
      </form>
    </aside>
  );
}

function GameControlModal({
  category,
  minutes,
  onCategoryChange,
  onMinutesChange,
  onClose,
  onStart,
}: {
  category: NonProductivityCategory;
  minutes: number;
  onCategoryChange: (category: NonProductivityCategory) => void;
  onMinutesChange: (minutes: number) => void;
  onClose: () => void;
  onStart: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <aside className="preset-backdrop" aria-label="Start Pastime Control timer">
      <form className="free-focus-panel app-shell compact-section" onSubmit={onStart}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow danger-eyebrow">Pastime Control</p>
            <h2 className="panel-title">Set a No-count limit</h2>
          </div>
          <button className="icon-button" type="button" title="Close Pastime Control setup" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-3">
          <label className="field">
            <span>Activity</span>
            <select value={category} onChange={(event) => onCategoryChange(event.target.value as NonProductivityCategory)}>
              {NON_PRODUCTIVITY_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Allowed minutes</span>
            <input
              min={MIN_GAME_CONTROL_MINUTES}
              max={MAX_GAME_CONTROL_MINUTES}
              type="number"
              value={minutes}
              onChange={(event) => onMinutesChange(Number(event.target.value))}
              autoFocus
            />
          </label>
        </div>

        <div className="free-focus-actions">
          <button className="subtle-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button danger-primary" type="submit">
            <Gamepad2 size={18} />
            Start control
          </button>
        </div>
      </form>
    </aside>
  );
}

function QueuePanel({
  activeTask,
  queued,
  completed,
  onDelete,
  onUpdateQueuedTask,
  onClearQueuedTasks,
  onClearCompletedTasks,
  onReorder,
}: {
  activeTask: Task | null;
  queued: Task[];
  completed: Task[];
  onDelete: (taskId: string) => Promise<void>;
  onUpdateQueuedTask: (taskId: string, input: { name: string; durationMinutes: number }) => Promise<void>;
  onClearQueuedTasks: () => Promise<void>;
  onClearCompletedTasks: () => Promise<void>;
  onReorder: (taskId: string, nextPosition: number) => Promise<void>;
}) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);

  function getDropEdge(event: DragEvent<HTMLElement>): DropEdge {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY - bounds.top < bounds.height / 2 ? "top" : "bottom";
  }

  function getDropPosition(sourceTaskId: string, targetTaskId: string, edge: DropEdge) {
    const draggedIndex = queued.findIndex((task) => task.id === sourceTaskId);
    const targetIndex = queued.findIndex((task) => task.id === targetTaskId);
    if (draggedIndex === -1 || targetIndex === -1 || sourceTaskId === targetTaskId) {
      return null;
    }

    let nextPosition = edge === "bottom" ? targetIndex + 1 : targetIndex;
    if (draggedIndex < nextPosition) {
      nextPosition -= 1;
    }

    return nextPosition;
  }

  function handleDragStart(event: DragEvent<HTMLElement>, taskId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
    setDraggedTaskId(taskId);
  }

  function handleDragOver(event: DragEvent<HTMLElement>, taskId: string) {
    if (!draggedTaskId || draggedTaskId === taskId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget({ taskId, edge: getDropEdge(event) });
  }

  function handleDrop(event: DragEvent<HTMLElement>, taskId: string) {
    event.preventDefault();

    const taskIdFromDrop = event.dataTransfer.getData("text/plain") || draggedTaskId;
    const edge = getDropEdge(event);
    const nextPosition = taskIdFromDrop ? getDropPosition(taskIdFromDrop, taskId, edge) : null;

    setDraggedTaskId(null);
    setDropTarget(null);

    if (taskIdFromDrop && nextPosition !== null) {
      void onReorder(taskIdFromDrop, nextPosition);
    }
  }

  function handleKeyboardReorder(event: KeyboardEvent<HTMLButtonElement>, taskId: string) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    const currentPosition = queued.findIndex((task) => task.id === taskId);
    if (currentPosition === -1) {
      return;
    }

    const nextPosition = currentPosition + (event.key === "ArrowUp" ? -1 : 1);
    if (nextPosition < 0 || nextPosition >= queued.length) {
      return;
    }

    event.preventDefault();
    void onReorder(taskId, nextPosition);
  }

  function clearDragState() {
    setDraggedTaskId(null);
    setDropTarget(null);
  }

  function handleClearQueuedTasks() {
    if (queued.length === 0) {
      return;
    }

    if (window.confirm("Clear all queued tasks?")) {
      void onClearQueuedTasks();
    }
  }

  function handleClearCompletedTasks() {
    if (completed.length === 0) {
      return;
    }

    if (window.confirm("Clear all finished tasks?")) {
      void onClearCompletedTasks();
    }
  }

  return (
    <section className="app-shell compact-section">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Task queue</p>
          <h2 className="panel-title">Next strikes</h2>
        </div>
        <div className="queue-actions">
          <span className="count-pill">{queued.length} queued</span>
          <button className="subtle-button compact danger" type="button" onClick={handleClearQueuedTasks} disabled={queued.length === 0}>
            <Trash2 size={15} />
            Clear
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        <AnimatePresence initial={false}>
          {activeTask ? <TaskRow key={activeTask.id} task={activeTask} active onDelete={onDelete} /> : null}
          {queued.map((task) => {
            const dropEdge = dropTarget?.taskId === task.id ? dropTarget.edge : null;

            return (
              <TaskRow
                key={task.id}
                task={task}
                draggableTask
                dropEdge={dropEdge}
                isDragging={draggedTaskId === task.id}
                onDelete={onDelete}
                onUpdateQueuedTask={onUpdateQueuedTask}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={clearDragState}
                onKeyboardReorder={handleKeyboardReorder}
              />
            );
          })}
        </AnimatePresence>
        {!activeTask && queued.length === 0 ? <EmptyQueueState /> : null}
      </div>

      {completed.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Finished</p>
            <button className="subtle-button compact danger" type="button" onClick={handleClearCompletedTasks}>
              <Trash2 size={15} />
              Clear
            </button>
          </div>
          <div className="grid gap-2">
            <AnimatePresence initial={false}>
              {completed.slice(0, 4).map((task) => (
                <TaskRow key={task.id} task={task} completed onDelete={onDelete} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TaskRow({
  task,
  active = false,
  completed = false,
  draggableTask = false,
  dropEdge = null,
  isDragging = false,
  onDelete,
  onUpdateQueuedTask,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onKeyboardReorder,
}: {
  task: Task;
  active?: boolean;
  completed?: boolean;
  draggableTask?: boolean;
  dropEdge?: DropEdge | null;
  isDragging?: boolean;
  onDelete: (taskId: string) => Promise<void>;
  onUpdateQueuedTask?: (taskId: string, input: { name: string; durationMinutes: number }) => Promise<void>;
  onDragStart?: (event: DragEvent<HTMLElement>, taskId: string) => void;
  onDragOver?: (event: DragEvent<HTMLElement>, taskId: string) => void;
  onDrop?: (event: DragEvent<HTMLElement>, taskId: string) => void;
  onDragEnd?: () => void;
  onKeyboardReorder?: (event: KeyboardEvent<HTMLButtonElement>, taskId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(task.name);
  const [draftMinutes, setDraftMinutes] = useState(Math.max(1, Math.round(task.durationSeconds / 60)));
  const canEdit = draggableTask && !completed && !active && Boolean(onUpdateQueuedTask);

  useEffect(() => {
    if (isEditing) {
      return;
    }

    setDraftName(task.name);
    setDraftMinutes(Math.max(1, Math.round(task.durationSeconds / 60)));
  }, [isEditing, task.durationSeconds, task.name]);

  function cancelEdit() {
    setDraftName(task.name);
    setDraftMinutes(Math.max(1, Math.round(task.durationSeconds / 60)));
    setIsEditing(false);
  }

  async function saveEdit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!onUpdateQueuedTask) {
      return;
    }

    await onUpdateQueuedTask(task.id, {
      name: draftName,
      durationMinutes: draftMinutes,
    });
    setIsEditing(false);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: isDragging ? 0.48 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 22, scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <article
        className={`task-row ${active ? "active" : ""} ${completed ? "completed" : ""} ${draggableTask ? "draggable" : ""} ${
          isDragging ? "dragging" : ""
        } ${dropEdge ? `drop-${dropEdge}` : ""}`}
        draggable={draggableTask && !isEditing}
        onDragStart={draggableTask && !isEditing ? (event) => onDragStart?.(event, task.id) : undefined}
        onDragOver={draggableTask && !isEditing ? (event) => onDragOver?.(event, task.id) : undefined}
        onDrop={draggableTask && !isEditing ? (event) => onDrop?.(event, task.id) : undefined}
        onDragEnd={draggableTask && !isEditing ? onDragEnd : undefined}
      >
        {draggableTask ? (
          <button
            className="drag-handle"
            type="button"
            title="Drag to reorder"
            aria-label={`Reorder ${task.name}`}
            onKeyDown={(event) => onKeyboardReorder?.(event, task.id)}
          >
            <GripVertical size={17} />
          </button>
        ) : null}
        <div className="task-emoji" aria-hidden="true">
          {task.emoji}
        </div>
        {isEditing ? (
          <form className="task-edit-form" onSubmit={(event) => void saveEdit(event)}>
            <label className="field compact-field">
              <span>Name</span>
              <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
            </label>
            <label className="field compact-field">
              <span>Min</span>
              <input
                min="1"
                max="240"
                type="number"
                value={draftMinutes}
                onChange={(event) => setDraftMinutes(Number(event.target.value))}
              />
            </label>
          </form>
        ) : (
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black text-[var(--ink-strong)]">{task.name}</h3>
            <p className="text-xs font-semibold text-[var(--muted)]">
              {active ? task.status : task.status === "queued" ? "Queued" : "Completed"} ·{" "}
              {formatCompactDuration(task.remainingSeconds || task.durationSeconds)}
            </p>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {canEdit ? (
            isEditing ? (
              <>
                <button className="icon-button small" type="button" title="Save task" onClick={() => void saveEdit()}>
                  <Save size={17} />
                </button>
                <button className="icon-button small" type="button" title="Cancel editing" onClick={cancelEdit}>
                  <X size={17} />
                </button>
              </>
            ) : (
              <button className="icon-button small" type="button" title="Edit task" onClick={() => setIsEditing(true)}>
                <Pencil size={17} />
              </button>
            )
          ) : null}
          <button className="icon-button small danger" type="button" title="Delete task" onClick={() => void onDelete(task.id)}>
            <Trash2 size={17} />
          </button>
        </div>
      </article>
    </motion.div>
  );
}

function EmptyQueueState() {
  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <Hammer size={22} />
      <span>
        <strong>No tasks queued.</strong>
        <span> Add a task or load a preset to set up your next focus run.</span>
      </span>
    </motion.div>
  );
}

function PresetOverlay({
  hasCurrentTasks,
  onClose,
  onApply,
  onLoaded,
}: {
  hasCurrentTasks: boolean;
  onClose: () => void;
  onApply: (preset: (typeof PRESET_ROUTINES)[number]) => Promise<void>;
  onLoaded: (presetName: string) => void;
}) {
  async function handleApplyPreset(preset: (typeof PRESET_ROUTINES)[number]) {
    if (
      hasCurrentTasks &&
      !window.confirm(`Replace the current task queue with "${preset.name}"? Active and queued tasks will be removed.`)
    ) {
      return;
    }

    await onApply(preset);
    onLoaded(preset.name);
  }

  return (
    <aside className="preset-backdrop" aria-label="Preset routines">
      <div className="preset-panel app-shell compact-section">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Preset routines</p>
            <h2 className="panel-title">Ready-made heats</h2>
          </div>
          <button className="icon-button" type="button" title="Close presets" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="grid gap-2">
          {PRESET_ROUTINES.map((preset) => (
            <button
              key={preset.id}
              className="preset-button"
              type="button"
              style={{ "--preset": preset.accent } as CSSProperties}
              onClick={() => handleApplyPreset(preset)}
            >
              <span className="preset-spark" />
              <strong>{preset.name}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function SettingsPanel({
  settings,
  onClose,
  onChange,
}: {
  settings: Settings;
  onClose: () => void;
  onChange: (settings: Partial<Settings>) => Promise<void>;
}) {
  return (
    <aside className="settings-backdrop" aria-label="Settings panel">
      <div className="settings-panel">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Bellows and polish</p>
            <h2 className="panel-title">Settings</h2>
          </div>
          <button className="icon-button" type="button" title="Close settings" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-5">
          <div>
            <p className="setting-label">Theme</p>
            <div className="segmented theme-segmented">
              {THEME_OPTIONS.map((theme) => (
                <ThemeButton
                  key={theme.value}
                  active={settings.theme === theme.value}
                  theme={theme.value}
                  label={theme.label}
                  onClick={() => onChange({ theme: theme.value })}
                />
              ))}
            </div>
          </div>

          <label className="field">
            <span>Default duration</span>
            <input
              min="1"
              max="240"
              type="number"
              value={settings.defaultDurationMinutes}
              onChange={(event) => void onChange({ defaultDurationMinutes: Number(event.target.value) })}
            />
          </label>

          <ToggleRow
            label="Completion sound"
            description="A soft two-note chime when a task is completed."
            checked={settings.soundEnabled}
            icon={settings.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            onChange={(checked) => onChange({ soundEnabled: checked })}
          />
          <ToggleRow
            label="Confetti sparks"
            description="A brief ember burst after completing the active task."
            checked={settings.confettiEnabled}
            icon={<Sparkles size={18} />}
            onChange={(checked) => onChange({ confettiEnabled: checked })}
          />
          <ToggleRow
            label="Overtime counting"
            description="Keep counting after the timer reaches zero."
            checked={settings.overtimeEnabled}
            icon={<TimerReset size={18} />}
            onChange={(checked) => onChange({ overtimeEnabled: checked })}
          />
        </div>
      </div>
    </aside>
  );
}

function ThemeButton({
  active,
  theme,
  label,
  onClick,
}: {
  active: boolean;
  theme: ThemePreference;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "active" : ""} type="button" onClick={onClick}>
      <span className={`theme-swatch ${theme}`} aria-hidden="true" />
      {label}
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  icon,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  icon: ReactNode;
  onChange: (checked: boolean) => Promise<void>;
}) {
  return (
    <label className="toggle-row">
      <span className="toggle-icon">{icon}</span>
      <span className="min-w-0 flex-1">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => void onChange(event.target.checked)} />
    </label>
  );
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (toastId: string) => void;
}) {
  return (
    <div className="toast-stack" aria-live="polite" aria-label="Notifications">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            className={`toast ${toast.tone}`}
            type="button"
            onClick={() => onDismiss(toast.id)}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 18, scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <strong>{toast.title}</strong>
            <span>{toast.detail}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => (
        <motion.span
          key={index}
          style={{ "--i": index } as CSSProperties}
          initial={{ opacity: 0, y: -24, rotate: 0 }}
          animate={{ opacity: [0, 1, 0], y: "76vh", rotate: 260 }}
          transition={{ duration: 1.3, delay: index * 0.018, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

export default App;
