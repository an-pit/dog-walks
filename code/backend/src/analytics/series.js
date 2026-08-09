import { normalizeWalks } from './normalize.js';
import { byDay, baseline, isWeekend } from './metrics.js';

/**
 * Ряд по дням для графика: факт и скользящая медиана.
 *
 * Медиана считается на каждый день отдельно — по 28 дням, ему
 * предшествующим. Поэтому линия отражает норму «на тот момент»,
 * а не одно число на весь период.
 */
export function dailySeries(rows, from, to) {
  const walks = normalizeWalks(rows);
  const days = byDay(walks);

  const result = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const day = days.get(date);
    const base = baseline(days, date, 'minutes');

    result.push({
      date,
      minutes: day ? day.minutes : 0,
      walks: day ? day.walks : 0,
      // null, пока данных не хватает — на графике линия просто не рисуется
      baseline: base.enough ? Math.round(base.value) : null,
      weekend: isWeekend(date),
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}
