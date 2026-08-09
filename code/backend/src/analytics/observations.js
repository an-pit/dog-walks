import { normalizeWalks } from './normalize.js';
import {
  byDay,
  baseline,
  deviation,
  daysWithoutPoop,
  longestGapHours,
  loadByPerson,
  BASELINE_DAYS,
  MIN_DAYS_FOR_BASELINE,
} from './metrics.js';

/**
 * Наблюдения за днём.
 *
 * Приложение показывает отклонение, а вывод делает человек. Поэтому
 * формулировки описывают факт («на 40% меньше обычного»), а не оценку
 * («мало гуляли»), и никаких медицинских порогов здесь нет.
 */
export function observationsForDate(rows, targetDate) {
  const walks = normalizeWalks(rows);
  const days = byDay(walks);
  const today = days.get(targetDate) || {
    date: targetDate,
    minutes: 0,
    timedWalks: 0,
    walks: 0,
    slots: [],
    poopYes: 0,
    poopMarked: 0,
    byPerson: {},
  };

  const minutesBase = baseline(days, targetDate, 'minutes');
  const walksBase = baseline(days, targetDate, 'walks');

  const todayWalks = walks.filter((w) => w.date === targetDate);

  const facts = {
    date: targetDate,
    walks: today.walks,
    minutes: today.minutes,
    timedWalks: today.timedWalks,
    missingSlots: ['morning', 'afternoon', 'evening'].filter(
      (slot) => !today.slots.includes(slot)
    ),
    poopYes: today.poopYes,
    poopMarked: today.poopMarked,
    longestGapHours: longestGapHours(todayWalks),
    daysWithoutPoop: daysWithoutPoop(days, targetDate),
  };

  const comparisons = minutesBase.enough
    ? {
        minutes: {
          actual: today.minutes,
          baseline: minutesBase.value,
          deviationPercent: deviation(today.minutes, minutesBase.value),
        },
        walks: {
          actual: today.walks,
          baseline: walksBase.value,
          deviationPercent: deviation(today.walks, walksBase.value),
        },
        method: {
          windowDays: BASELINE_DAYS,
          sampleSize: minutesBase.sampleSize,
          splitByDayType: minutesBase.splitByDayType,
        },
      }
    : null;

  return {
    facts,
    comparisons,
    // Пока данных мало, сравнивать не с чем — и лучше сказать об этом прямо,
    // чем показать цифру, построенную на трёх днях
    baselineReady: minutesBase.enough,
    daysCollected: minutesBase.totalDays,
    minDaysRequired: MIN_DAYS_FOR_BASELINE,
    notes: buildNotes(facts, comparisons),
  };
}

/** Короткие формулировки для интерфейса. Только факты и отклонения. */
function buildNotes(facts, comparisons) {
  const notes = [];

  if (facts.missingSlots.length > 0 && facts.walks > 0) {
    const names = { morning: 'утро', afternoon: 'день', evening: 'вечер' };
    notes.push({
      kind: 'info',
      text: `Не отмечено: ${facts.missingSlots.map((s) => names[s]).join(', ')}`,
    });
  }

  // Проверяем сам объект, а не через ?.: оптическая цепочка защищает
  // вычисление условия, но не тело блока — на этом уже спотыкались
  if (comparisons && comparisons.minutes.deviationPercent !== null && facts.minutes > 0) {
    const percent = comparisons.minutes.deviationPercent;
    if (Math.abs(percent) >= 25) {
      notes.push({
        kind: percent < 0 ? 'attention' : 'info',
        text:
          percent < 0
            ? `Времени на ${Math.abs(percent)}% меньше обычного`
            : `Времени на ${percent}% больше обычного`,
      });
    }
  }

  if (facts.daysWithoutPoop >= 2) {
    notes.push({
      kind: 'attention',
      text: `${facts.daysWithoutPoop}-й день без отметки «покакал»`,
    });
  }

  if (facts.longestGapHours !== null && facts.longestGapHours >= 12) {
    notes.push({
      kind: 'attention',
      text: `Самый длинный перерыв между прогулками — ${facts.longestGapHours} ч`,
    });
  }

  if (facts.timedWalks < facts.walks) {
    notes.push({
      kind: 'info',
      text: `Длительность указана у ${facts.timedWalks} из ${facts.walks} прогулок`,
    });
  }

  return notes;
}

/** Сводка за период — для страницы статистики */
export function periodSummary(rows) {
  const walks = normalizeWalks(rows);
  const days = byDay(walks);

  const dayValues = [...days.values()];
  const withWalks = dayValues.filter((d) => d.walks > 0);

  return {
    daysObserved: withWalks.length,
    load: loadByPerson(walks),
    medianMinutesPerDay:
      withWalks.length > 0
        ? Math.round(
            withWalks.reduce((sum, d) => sum + d.minutes, 0) / withWalks.length
          )
        : 0,
    poopYes: dayValues.reduce((sum, d) => sum + d.poopYes, 0),
    poopMarked: dayValues.reduce((sum, d) => sum + d.poopMarked, 0),
  };
}
