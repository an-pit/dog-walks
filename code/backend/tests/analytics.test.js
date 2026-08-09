import { describe, it, expect } from 'vitest';
import { normalizeWalk, participantsFrom } from '../src/analytics/normalize.js';
import {
  median,
  isWeekend,
  byDay,
  baseline,
  deviation,
  daysWithoutPoop,
  longestGapHours,
  loadByPerson,
} from '../src/analytics/metrics.js';
import { observationsForDate } from '../src/analytics/observations.js';

// Хелпер: строка в том виде, в каком её отдаёт база
const row = (date, slot, person, duration = null, extra = {}) => ({
  walk_date: date,
  slot,
  person,
  duration,
  comments: '',
  poop: null,
  ended_at: null,
  ...extra,
});

describe('адаптер участников', () => {
  it('both разворачивается в двоих', () => {
    expect(participantsFrom('both')).toEqual(['andrey', 'ira']);
  });

  it('none даёт пустой список', () => {
    expect(participantsFrom('none')).toEqual([]);
    expect(participantsFrom(null)).toEqual([]);
  });

  it('обычный участник — список из одного', () => {
    expect(participantsFrom('andrey')).toEqual(['andrey']);
  });

  it('null в duration остаётся null, а не превращается в ноль', () => {
    expect(normalizeWalk(row('2026-08-01', 'morning', 'andrey', null)).minutes).toBeNull();
    expect(normalizeWalk(row('2026-08-01', 'morning', 'andrey', 0)).minutes).toBe(0);
  });
});

describe('медиана', () => {
  it('нечётное количество', () => {
    expect(median([10, 50, 30])).toBe(30);
  });

  it('чётное количество — среднее двух средних', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it('устойчива к выбросу, в отличие от среднего', () => {
    const values = [40, 45, 50, 45, 300];
    expect(median(values)).toBe(45);
    // среднее было бы 96 — именно поэтому берём медиану
  });

  it('пустой набор даёт null', () => {
    expect(median([])).toBeNull();
    expect(median([null, undefined])).toBeNull();
  });
});

describe('будни и выходные', () => {
  it('2026-08-08 — суббота', () => {
    expect(isWeekend('2026-08-08')).toBe(true);
  });

  it('2026-08-06 — четверг', () => {
    expect(isWeekend('2026-08-06')).toBe(false);
  });
});

describe('свёртка по дням', () => {
  it('суммирует минуты и считает прогулки', () => {
    const days = byDay([
      normalizeWalk(row('2026-08-01', 'morning', 'andrey', 40)),
      normalizeWalk(row('2026-08-01', 'evening', 'ira', 50)),
    ]);

    const day = days.get('2026-08-01');
    expect(day.walks).toBe(2);
    expect(day.minutes).toBe(90);
    expect(day.timedWalks).toBe(2);
  });

  it('не считает прогулкой запись «никто»', () => {
    const days = byDay([normalizeWalk(row('2026-08-01', 'morning', 'none'))]);
    expect(days.get('2026-08-01').walks).toBe(0);
  });

  it('отличает прогулку без засечённого времени', () => {
    const days = byDay([
      normalizeWalk(row('2026-08-01', 'morning', 'andrey', 40)),
      normalizeWalk(row('2026-08-01', 'evening', 'ira', null)),
    ]);

    const day = days.get('2026-08-01');
    expect(day.walks).toBe(2);
    expect(day.timedWalks).toBe(1);
    expect(day.minutes).toBe(40);
  });

  it('совместная прогулка засчитывается обоим', () => {
    const days = byDay([normalizeWalk(row('2026-08-01', 'morning', 'both', 60))]);
    const day = days.get('2026-08-01');

    expect(day.byPerson.andrey.minutes).toBe(60);
    expect(day.byPerson.ira.minutes).toBe(60);
    expect(day.walks).toBe(1);
  });
});

describe('базовая линия', () => {
  // 30 дней по 60 минут, кроме последнего
  const walks = [];
  for (let i = 1; i <= 30; i++) {
    const date = `2026-07-${String(i).padStart(2, '0')}`;
    walks.push(normalizeWalk(row(date, 'morning', 'andrey', 60)));
  }

  it('не включает целевой день в выборку', () => {
    const days = byDay(walks);
    const result = baseline(days, '2026-07-30', 'minutes');
    expect(result.value).toBe(60);
    expect(result.enough).toBe(true);
  });

  it('сообщает, что данных мало', () => {
    const few = byDay([
      normalizeWalk(row('2026-08-01', 'morning', 'andrey', 60)),
      normalizeWalk(row('2026-08-02', 'morning', 'andrey', 60)),
    ]);
    const result = baseline(few, '2026-08-03', 'minutes');
    expect(result.enough).toBe(false);
  });
});

describe('отклонение', () => {
  it('считает процент', () => {
    expect(deviation(60, 100)).toBe(-40);
    expect(deviation(120, 100)).toBe(20);
  });

  it('не делит на ноль', () => {
    expect(deviation(60, 0)).toBeNull();
    expect(deviation(null, 100)).toBeNull();
  });
});

describe('серия без отметки о туалете', () => {
  it('считает дни подряд', () => {
    const days = byDay([
      normalizeWalk(row('2026-08-01', 'morning', 'andrey', 40, { poop: 'yes' })),
      normalizeWalk(row('2026-08-02', 'morning', 'andrey', 40)),
      normalizeWalk(row('2026-08-03', 'morning', 'andrey', 40)),
    ]);

    expect(daysWithoutPoop(days, '2026-08-03')).toBe(2);
  });

  it('обнуляется в день с отметкой', () => {
    const days = byDay([
      normalizeWalk(row('2026-08-01', 'morning', 'andrey', 40)),
      normalizeWalk(row('2026-08-02', 'morning', 'andrey', 40, { poop: 'yes' })),
    ]);

    expect(daysWithoutPoop(days, '2026-08-02')).toBe(0);
  });
});

describe('разрыв между прогулками', () => {
  it('считает только по известному времени возвращения', () => {
    const walks = [
      normalizeWalk(row('2026-08-01', 'morning', 'andrey', 40, { ended_at: '2026-08-01T08:00' })),
      normalizeWalk(row('2026-08-01', 'evening', 'ira', 40, { ended_at: '2026-08-01T21:30' })),
    ];

    expect(longestGapHours(walks)).toBe(13.5);
  });

  it('без времени возвращения возвращает null, а не выдуманное число', () => {
    const walks = [
      normalizeWalk(row('2026-08-01', 'morning', 'andrey', 40)),
      normalizeWalk(row('2026-08-01', 'evening', 'ira', 40)),
    ];

    expect(longestGapHours(walks)).toBeNull();
  });
});

describe('распределение нагрузки', () => {
  it('считает по найденным в данных участникам', () => {
    const walks = [
      normalizeWalk(row('2026-08-01', 'morning', 'andrey', 40)),
      normalizeWalk(row('2026-08-01', 'afternoon', 'ira', 20)),
      normalizeWalk(row('2026-08-01', 'evening', 'both', 60)),
    ];

    const load = loadByPerson(walks);
    expect(load.andrey.walks).toBe(2);
    expect(load.ira.walks).toBe(2);
    expect(load.andrey.minutes).toBe(100);
  });
});

describe('наблюдения за день', () => {
  it('сообщает о нехватке данных вместо ложного сравнения', () => {
    const rows = [row('2026-08-01', 'morning', 'andrey', 40)];
    const result = observationsForDate(rows, '2026-08-01');

    expect(result.baselineReady).toBe(false);
    expect(result.comparisons).toBeNull();
  });

  it('перечисляет незаполненные слоты', () => {
    const rows = [row('2026-08-01', 'morning', 'andrey', 40)];
    const result = observationsForDate(rows, '2026-08-01');

    expect(result.facts.missingSlots).toEqual(['afternoon', 'evening']);
  });

  it('сравнивает с базовой линией, когда данных достаточно', () => {
    const rows = [];
    for (let i = 1; i <= 20; i++) {
      rows.push(row(`2026-07-${String(i).padStart(2, '0')}`, 'morning', 'andrey', 60));
    }
    rows.push(row('2026-07-21', 'morning', 'andrey', 30));

    const result = observationsForDate(rows, '2026-07-21');

    expect(result.baselineReady).toBe(true);
    expect(result.comparisons.minutes.deviationPercent).toBe(-50);
    expect(result.notes.some((n) => n.text.includes('50%'))).toBe(true);
  });
});
