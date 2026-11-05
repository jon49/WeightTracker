// Dates as the app writes them, YYYY-MM-DD in local time. The browser runs in
// the same time zone as the tests.

export function dateString(date: Date) {
  let pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: Date, days: number) {
  let d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function today() {
  let d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// The Sunday on or before today: weeks in the app start on Sunday.
export function thisSunday() {
  let d = today();
  return addDays(d, -d.getDay());
}

// The time `minutes` ago as HH:MM, as a time input gives it.
export function timeAgo(minutes: number) {
  let d = new Date(Date.now() - minutes * 60_000);
  return d.toTimeString().slice(0, 5);
}
