// FILE: statusBarClock.ts
// Purpose: Pure local date/time formatting for the app status-bar clock
// (MissionDeck-style `YYYY-MM-DD HH:mm`).

export function formatStatusBarDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
