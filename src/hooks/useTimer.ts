import { useCallback, useEffect, useRef, useState } from "react";
import { progressPercent } from "../lib/time";
import type { Task } from "../types";

const TIMER_TICK_MS = 250;
const TIMER_ADJUSTMENT_SECONDS = 5 * 60;

type TimerRun = {
  taskId: string;
  startedAtMs: number;
  startedRemainingSeconds: number;
  lastPersistedRemainingSeconds: number;
};

type UseTimerOptions = {
  activeTask: Task | null;
  isRunning: boolean;
  overtimeEnabled: boolean;
  onStart: () => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onReset: () => Promise<void>;
  onComplete: () => Promise<void>;
  onSetRemaining: (remainingSeconds: number) => Promise<void>;
  onAdjustTime: (deltaSeconds: number) => Promise<void>;
};

export function useTimer({
  activeTask,
  isRunning,
  overtimeEnabled,
  onStart,
  onPause,
  onResume,
  onReset,
  onComplete,
  onSetRemaining,
  onAdjustTime,
}: UseTimerOptions) {
  const runRef = useRef<TimerRun | null>(null);
  const overtimeStartedAtMs = useRef<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(activeTask?.remainingSeconds ?? 0);
  const [overtimeSeconds, setOvertimeSeconds] = useState(0);

  const currentRemainingSeconds = useCallback(() => {
    const run = runRef.current;
    if (!run) {
      return Math.max(0, activeTask?.remainingSeconds ?? 0);
    }

    const elapsedSeconds = (Date.now() - run.startedAtMs) / 1000;
    return Math.max(0, Math.ceil(run.startedRemainingSeconds - elapsedSeconds));
  }, [activeTask?.remainingSeconds]);

  useEffect(() => {
    if (!isRunning) {
      runRef.current = null;
      setRemainingSeconds(Math.max(0, activeTask?.remainingSeconds ?? 0));
      return;
    }

    if (!activeTask || activeTask.remainingSeconds <= 0) {
      runRef.current = null;
      setRemainingSeconds(0);
      void onSetRemaining(0);
      return;
    }

    runRef.current = {
      taskId: activeTask.id,
      startedAtMs: Date.now(),
      startedRemainingSeconds: activeTask.remainingSeconds,
      lastPersistedRemainingSeconds: activeTask.remainingSeconds,
    };
    setRemainingSeconds(activeTask.remainingSeconds);

    const syncRemaining = () => {
      const run = runRef.current;
      if (!run) {
        return;
      }

      const elapsedSeconds = (Date.now() - run.startedAtMs) / 1000;
      const nextRemaining = Math.max(0, Math.ceil(run.startedRemainingSeconds - elapsedSeconds));
      setRemainingSeconds(nextRemaining);

      if (nextRemaining !== run.lastPersistedRemainingSeconds) {
        run.lastPersistedRemainingSeconds = nextRemaining;
        void onSetRemaining(nextRemaining);
      }
    };

    syncRemaining();
    const interval = window.setInterval(syncRemaining, TIMER_TICK_MS);

    return () => window.clearInterval(interval);
  }, [activeTask?.durationSeconds, activeTask?.id, isRunning, onSetRemaining]);

  useEffect(() => {
    if (!overtimeEnabled || !activeTask || activeTask.remainingSeconds > 0) {
      overtimeStartedAtMs.current = null;
      setOvertimeSeconds(0);
      return;
    }

    overtimeStartedAtMs.current ??= Date.now();

    const syncOvertime = () => {
      const startedAtMs = overtimeStartedAtMs.current;
      if (!startedAtMs) {
        return;
      }

      setOvertimeSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    };

    syncOvertime();
    const interval = window.setInterval(syncOvertime, TIMER_TICK_MS);

    return () => window.clearInterval(interval);
  }, [activeTask?.id, activeTask?.remainingSeconds, overtimeEnabled]);

  const pause = useCallback(async () => {
    if (!activeTask) {
      return;
    }

    await onSetRemaining(currentRemainingSeconds());
    await onPause();
  }, [activeTask, currentRemainingSeconds, onPause, onSetRemaining]);

  const reset = useCallback(async () => {
    runRef.current = null;
    overtimeStartedAtMs.current = null;
    setOvertimeSeconds(0);
    setRemainingSeconds(activeTask?.durationSeconds ?? 0);
    await onReset();
  }, [activeTask?.durationSeconds, onReset]);

  const complete = useCallback(async () => {
    runRef.current = null;
    overtimeStartedAtMs.current = null;
    setOvertimeSeconds(0);
    await onComplete();
  }, [onComplete]);

  const addFiveMinutes = useCallback(async () => {
    const nextRemaining = currentRemainingSeconds() + TIMER_ADJUSTMENT_SECONDS;
    setRemainingSeconds(nextRemaining);

    if (isRunning) {
      await onSetRemaining(currentRemainingSeconds());
    }

    await onAdjustTime(TIMER_ADJUSTMENT_SECONDS);
  }, [currentRemainingSeconds, isRunning, onAdjustTime, onSetRemaining]);

  const subtractFiveMinutes = useCallback(async () => {
    const nextRemaining = Math.max(0, currentRemainingSeconds() - TIMER_ADJUSTMENT_SECONDS);
    setRemainingSeconds(nextRemaining);

    if (isRunning) {
      await onSetRemaining(currentRemainingSeconds());
    }

    await onAdjustTime(-TIMER_ADJUSTMENT_SECONDS);
  }, [currentRemainingSeconds, isRunning, onAdjustTime, onSetRemaining]);

  return {
    remainingSeconds,
    overtimeSeconds,
    progress: activeTask ? progressPercent(activeTask.durationSeconds, remainingSeconds) : 0,
    isReadyToComplete: Boolean(activeTask && remainingSeconds === 0),
    start: onStart,
    pause,
    resume: onResume,
    reset,
    complete,
    addFiveMinutes,
    subtractFiveMinutes,
  };
}
