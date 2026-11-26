import { mock } from "node:test";

// Preload only in disposable integration processes. Keep API and test inputs on
// the same day, hour and minute even when the real clock crosses a boundary.
export const scoreTestTime = new Date("2026-11-17T16:00:00Z").getTime();
mock.timers.enable({ apis: ["Date"], now: scoreTestTime });
