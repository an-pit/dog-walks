import { normalizeWalks } from '../analytics/normalize.js';
import { byDay, loadByPerson } from '../analytics/metrics.js';

/**
 * Собирает данные для запроса к модели.
 *
 * Функция чистая: никакой сети, только преобразование. Благодаря этому
 * её можно тестировать обычным способом, а сам вызов модели подменять.
 *
 * Сырые записи целиком не отправляем. Отправляем агрегаты плюс все
 * комментарии: цифры модель всё равно пересчитывать не должна — это
 * работа SQL, а вот текст заметок интерпретировать может только она.
 */
export function buildPayload(rows, from, to) {
  const walks = normalizeWalks(rows);
  const days = byDay(walks);
  const dayList = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  const withWalks = dayList.filter((d) => d.walks > 0);
  const totalMinutes = dayList.reduce((sum, d) => sum + d.minutes, 0);

  const comments = walks
    .filter((w) => w.comments)
    .map((w) => ({ date: w.date, slot: w.slot, text: w.comments }));

  return {
    period: { from, to, daysWithWalks: withWalks.length },

    totals: {
      walks: dayList.reduce((sum, d) => sum + d.walks, 0),
      minutes: totalMinutes,
      averageMinutesPerDay: withWalks.length
        ? Math.round(totalMinutes / withWalks.length)
        : 0,
      poopYes: dayList.reduce((sum, d) => sum + d.poopYes, 0),
      poopMarked: dayList.reduce((sum, d) => sum + d.poopMarked, 0),
    },

    load: loadByPerson(walks),

    // По дням — только то, что нужно для поиска закономерностей
    byDay: dayList.map((d) => ({
      date: d.date,
      walks: d.walks,
      minutes: d.minutes,
      timed: d.timedWalks,
      poopYes: d.poopYes,
      poopMarked: d.poopMarked,
    })),

    comments,

    // Явно сообщаем модели, чего в данных нет — иначе она додумает
    dataNotes: {
      minutesMayBeMissing:
        'Длительность указана не у всех прогулок; поле timed показывает, у скольких из них она есть.',
      poopMayBeUnmarked:
        'Отметка о туалете появилась недавно. poopMarked — сколько прогулок вообще отмечено; остальные означают «не проверяли», а не «не было».',
    },
  };
}

/** Грубая оценка размера — чтобы не отправить случайно гигантский запрос */
export function estimateSize(payload) {
  return JSON.stringify(payload).length;
}
