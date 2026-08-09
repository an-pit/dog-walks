import { happened } from './normalize.js';

// Окно базовой линии: ровно четыре недели, чтобы каждый день недели
// встретился четырежды и перекос выходных усреднился сам собой
export const BASELINE_DAYS = 28;

// Минимум данных, ниже которого сравнения не показываем:
// на трёх точках «норма» — это не норма, а случайность
export const MIN_DAYS_FOR_BASELINE = 14;

/**
 * Медиана, а не среднее: одна прогулка на три часа заметно сдвигает
 * среднее и почти не двигает медиану.
 */
export function median(values) {
  const clean = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (clean.length === 0) return null;

  const sorted = [...clean].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Суббота и воскресенье считаем выходными */
export function isWeekend(dateStr) {
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

/**
 * Сворачивает прогулки в показатели по дням.
 * Возвращает Map: дата → { minutes, walks, slots, poopYes, poopMarked, byPerson }
 */
export function byDay(walks) {
  const days = new Map();

  walks.forEach((walk) => {
    if (!days.has(walk.date)) {
      days.set(walk.date, {
        date: walk.date,
        minutes: 0,
        // Отдельно считаем, у скольких прогулок длительность вообще указана:
        // сумма по трём прогулкам, где засекли одну, несравнима с полной
        timedWalks: 0,
        walks: 0,
        slots: [],
        poopYes: 0,
        poopMarked: 0,
        byPerson: {},
      });
    }

    const day = days.get(walk.date);

    if (happened(walk)) {
      day.walks++;
      day.slots.push(walk.slot);

      if (walk.minutes !== null) {
        day.minutes += walk.minutes;
        day.timedWalks++;
      }

      walk.participants.forEach((person) => {
        if (!day.byPerson[person]) day.byPerson[person] = { walks: 0, minutes: 0 };
        day.byPerson[person].walks++;
        if (walk.minutes !== null) day.byPerson[person].minutes += walk.minutes;
      });
    }

    if (walk.poop === 'yes') {
      day.poopYes++;
      day.poopMarked++;
    }
    if (walk.poop === 'no') day.poopMarked++;
  });

  return days;
}

/**
 * Базовая линия по дням, предшествующим целевой дате.
 * Будни сравниваются с буднями, выходные с выходными.
 *
 * targetDate в выборку не входит: день не должен сравниваться сам с собой.
 */
export function baseline(days, targetDate, metric = 'minutes') {
  const weekendTarget = isWeekend(targetDate);

  const start = new Date(`${targetDate}T12:00:00`);
  start.setDate(start.getDate() - BASELINE_DAYS);
  const startStr = start.toISOString().slice(0, 10);

  const sameKind = [];
  const all = [];

  days.forEach((day) => {
    if (day.date >= targetDate || day.date < startStr) return;
    all.push(day[metric]);
    if (isWeekend(day.date) === weekendTarget) sameKind.push(day[metric]);
  });

  // Если однотипных дней набралось мало, честнее взять все,
  // чем считать медиану по двум значениям
  const useSameKind = sameKind.length >= 4;
  const sample = useSameKind ? sameKind : all;

  return {
    value: median(sample),
    sampleSize: sample.length,
    totalDays: all.length,
    splitByDayType: useSameKind,
    enough: all.length >= MIN_DAYS_FOR_BASELINE,
  };
}

/** Отклонение в процентах: +20 — на пятую часть больше обычного */
export function deviation(actual, base) {
  if (base === null || base === 0 || actual === null) return null;
  return Math.round(((actual - base) / base) * 100);
}

/**
 * Сколько дней подряд не было отметки «покакал».
 * Считаем от последнего дня назад; дни без единой отметки прерывают счёт
 * только если в них вообще были прогулки — иначе это просто пробел в данных.
 */
export function daysWithoutPoop(days, targetDate) {
  const sorted = [...days.values()]
    .filter((d) => d.date <= targetDate)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  let count = 0;
  for (const day of sorted) {
    if (day.poopYes > 0) break;
    if (day.poopMarked > 0 || day.walks > 0) count++;
  }

  return count;
}

/**
 * Разрывы между прогулками — только там, где известно время возвращения.
 * Прогулки без ended_at пропускаем: считать по ним значит выдумывать.
 */
export function longestGapHours(walks) {
  const times = walks
    .filter((w) => happened(w) && w.endedAt)
    .map((w) => new Date(w.endedAt).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  if (times.length < 2) return null;

  let longest = 0;
  for (let i = 1; i < times.length; i++) {
    longest = Math.max(longest, times[i] - times[i - 1]);
  }

  return Math.round((longest / 3600000) * 10) / 10;
}

/**
 * Распределение нагрузки. Считаем по участникам, найденным в данных,
 * а не по заранее известному списку — иначе третий человек не появится.
 */
export function loadByPerson(walks) {
  const totals = {};
  let totalWalks = 0;

  walks.filter(happened).forEach((walk) => {
    totalWalks++;
    walk.participants.forEach((person) => {
      if (!totals[person]) totals[person] = { walks: 0, minutes: 0 };
      totals[person].walks++;
      if (walk.minutes !== null) totals[person].minutes += walk.minutes;
    });
  });

  const result = {};
  Object.entries(totals).forEach(([person, value]) => {
    result[person] = {
      ...value,
      // Доли не сложатся в 100%: совместная прогулка засчитывается обоим
      share: totalWalks ? Math.round((value.walks / totalWalks) * 100) : 0,
    };
  });

  return result;
}
