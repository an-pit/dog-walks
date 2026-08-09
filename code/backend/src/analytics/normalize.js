/**
 * Адаптер между схемой базы и тем, с чем работает аналитика.
 *
 * Смысл в одной вещи: метрики оперируют массивом participants, а не
 * колонкой person. Сейчас массив собирается из одной колонки, где 'both'
 * означает двоих. Когда появятся произвольные участники и связь
 * многие-ко-многим, поменяется только эта функция — метрики не заметят.
 */

// Сколько людей стоит за значением колонки person
export function participantsFrom(person) {
  if (!person || person === 'none') return [];
  if (person === 'both') return ['andrey', 'ira'];
  return [person];
}

export function normalizeWalk(row) {
  return {
    date: row.walk_date,
    slot: row.slot,
    participants: participantsFrom(row.person),
    // null означает «не засекали», 0 после миграции v4 не встречается
    minutes: row.duration === null || row.duration === undefined ? null : row.duration,
    poop: row.poop ?? null,
    endedAt: row.ended_at ?? null,
    comments: row.comments || '',
  };
}

export function normalizeWalks(rows) {
  return rows.map(normalizeWalk);
}

/** Прогулка состоялась, если у неё есть хотя бы один участник */
export function happened(walk) {
  return walk.participants.length > 0;
}
