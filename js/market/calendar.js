/**
 * Trading calendar: the simulation counts trading days (0 = first session).
 * Weekends are skipped so date labels look like a real market calendar.
 */
const BASE_DATE = Date.UTC(2026, 0, 5); // Monday 2026-01-05
const MS_DAY = 24 * 60 * 60 * 1000;

export const TICKS_PER_DAY = 8;
export const SESSION_TICKS = TICKS_PER_DAY;

const WEEKEND_NAMES = { 'zh-CN': ['周日', '周一', '周二', '周三', '周四', '周五', '周六'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };

export function dateForTradingDay(dayIndex) {
  const safeDay = Math.floor(dayIndex || 0);
  // 5 trading days per week, works for negative (historical) day indexes too.
  const weeks = Math.floor(safeDay / 5);
  const rest = safeDay - weeks * 5;
  return new Date(BASE_DATE + weeks * 7 * MS_DAY + rest * MS_DAY);
}

export function formatMarketDate(dayIndex, locale = 'en') {
  const date = dateForTradingDay(dayIndex);
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return date.toISOString().slice(5, 10);
  }
}

export function formatMarketDateLong(dayIndex, locale = 'en') {
  const date = dateForTradingDay(dayIndex);
  const weekday = WEEKEND_NAMES[locale] ? WEEKEND_NAMES[locale][date.getUTCDay()] : '';
  try {
    const short = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);
    return `${short} ${weekday}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function sessionClock(tick) {
  // Simplified 09:30 -> 16:00 session with 8 hourly-ish bars.
  const minutes = 9 * 60 + 30 + Math.min(tick, SESSION_TICKS) * 48;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
