export interface ReportWindow {
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
}

//* "en-CA" FORMATS AS YYYY-MM-DD — THE SAME SHAPE GA ACCEPTS AS A CONCRETE DATE
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

//* PURE CALENDAR ARITHMETIC ON A YYYY-MM-DD STRING — DONE IN UTC SO NO
//* DST/OFFSET CAN SKIP OR REPEAT A DAY
export function shiftDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The selected window and the equally long window right before it.
 *
 * The window ends **yesterday**, not today: today's GA data is still being
 * processed, so including it would make every period-over-period comparison
 * look like a drop. This is also what GA's own "Last N days" presets do.
 */
export function buildReportWindow(
  days: number,
  timeZone: string,
): ReportWindow {
  const endDate = shiftDays(todayIn(timeZone), -1);
  const startDate = shiftDays(endDate, -(days - 1));
  const previousEndDate = shiftDays(startDate, -1);
  const previousStartDate = shiftDays(previousEndDate, -(days - 1));
  return { startDate, endDate, previousStartDate, previousEndDate };
}

/** Every calendar day from `start` to `end`, inclusive. */
export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = shiftDays(day, 1)) {
    days.push(day);
  }
  return days;
}
