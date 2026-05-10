import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCompactDuration,
  formatDuration,
  formatFinishTime,
  formatHistoryDayLabel,
  formatLocalDateKey,
  progressPercent,
  sortFocusHistoryDays,
} from "../.test-dist/time.js";

test("formatDuration renders seconds, minutes, and hours", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(3661), "1:01:01");
});

test("formatDuration clamps negative values", () => {
  assert.equal(formatDuration(-20), "0:00");
});

test("formatCompactDuration rounds up to the next visible minute", () => {
  assert.equal(formatCompactDuration(0), "0m");
  assert.equal(formatCompactDuration(1), "1m");
  assert.equal(formatCompactDuration(61), "2m");
  assert.equal(formatCompactDuration(3660), "1h 1m");
});

test("formatFinishTime handles an empty queue", () => {
  assert.equal(formatFinishTime(0), "All clear");
  assert.equal(formatFinishTime(-10), "All clear");
});

test("progressPercent clamps to the timer range", () => {
  assert.equal(progressPercent(100, 75), 25);
  assert.equal(progressPercent(100, -10), 100);
  assert.equal(progressPercent(100, 110), 0);
  assert.equal(progressPercent(0, 0), 0);
});

test("formatLocalDateKey renders a local YYYY-MM-DD key", () => {
  assert.equal(formatLocalDateKey(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});

test("formatHistoryDayLabel labels today and yesterday", () => {
  const today = new Date(2026, 4, 10, 12);

  assert.equal(formatHistoryDayLabel("2026-05-10", today), "Today");
  assert.equal(formatHistoryDayLabel("2026-05-09", today), "Yesterday");
  assert.equal(formatHistoryDayLabel("not-a-date", today), "not-a-date");
});

test("sortFocusHistoryDays sorts newest days first without mutating", () => {
  const history = [{ date: "2026-05-09" }, { date: "2026-05-10" }, { date: "2026-05-08" }];
  const sorted = sortFocusHistoryDays(history);

  assert.deepEqual(
    sorted.map((day) => day.date),
    ["2026-05-10", "2026-05-09", "2026-05-08"],
  );
  assert.deepEqual(
    history.map((day) => day.date),
    ["2026-05-09", "2026-05-10", "2026-05-08"],
  );
});
