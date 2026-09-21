/** Each ISO date from start to end inclusive. */
export function eachDay(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const end = new Date(`${endDate}T00:00:00`);
  const cur = new Date(`${startDate}T00:00:00`);
  while (cur <= end && days.length < 31) {
    days.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(
        cur.getDate(),
      ).padStart(2, "0")}`,
    );
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function fmtDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
