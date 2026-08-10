import { describe, it, expect } from 'vitest'
import { dateUtils, localDateTime } from '../src/services/api'

/**
 * Тесты дат.
 *
 * Запускаются в зоне Europe/Moscow — это задано в npm-скрипте. Без сдвига
 * от Гринвича они бессмысленны: в UTC ошибка с toISOString() не проявляется
 * вовсе, и зелёные тесты ничего не доказывают.
 *
 * Дата прогулки — календарный день по местным часам, а не момент времени.
 * Всё, что здесь проверяется, сводится к этому одному утверждению.
 */

// Ночь — единственное время суток, когда ошибка видна. Днём местная дата
// и дата по Гринвичу совпадают, и сломанный код выглядит рабочим.
const NIGHT = new Date(2026, 7, 10, 1, 30) // 10 августа 2026, 01:30 местного
const EVENING = new Date(2026, 7, 9, 23, 40) // 9 августа 2026, 23:40 местного

describe('часовой пояс', () => {
  it('тесты идут в зоне со сдвигом — иначе они ничего не проверяют', () => {
    expect(new Date().getTimezoneOffset()).not.toBe(0)
  })
})

describe('formatDate', () => {
  it('ночью отдаёт сегодняшнюю дату, а не вчерашнюю', () => {
    // Ровно этот случай ломал приложение: страница подписана десятым числом,
    // а записи читались и писались за девятое
    expect(dateUtils.formatDate(NIGHT)).toBe('2026-08-10')
  })

  it('поздним вечером не убегает на завтра', () => {
    expect(dateUtils.formatDate(EVENING)).toBe('2026-08-09')
  })

  it('совпадает с тем, что видит пользователь в заголовке', () => {
    for (const hour of [0, 1, 2, 3, 12, 21, 23]) {
      const date = new Date(2026, 7, 10, hour, 15)
      const shown = date.toLocaleDateString('sv-SE') // 'sv-SE' даёт YYYY-MM-DD
      expect(dateUtils.formatDate(date)).toBe(shown)
    }
  })
})

describe('parseDate', () => {
  it('строка возвращается той же датой', () => {
    expect(dateUtils.formatDate(dateUtils.parseDate('2026-08-09'))).toBe('2026-08-09')
  })

  it('день недели сохраняется: 9 августа 2026 — воскресенье', () => {
    expect(dateUtils.parseDate('2026-08-09').getDay()).toBe(0)
  })
})

describe('getWeekDates', () => {
  it('неделя начинается с понедельника', () => {
    const week = dateUtils.getWeekDates(new Date(2026, 7, 5, 15, 0)) // среда
    expect(dateUtils.formatDate(week[0])).toBe('2026-08-03')
    expect(dateUtils.formatDate(week[6])).toBe('2026-08-09')
  })

  it('воскресенье закрывает неделю, а не открывает следующую', () => {
    const week = dateUtils.getWeekDates(new Date(2026, 7, 9, 15, 0))
    expect(dateUtils.formatDate(week[0])).toBe('2026-08-03')
    expect(dateUtils.formatDate(week[6])).toBe('2026-08-09')
  })

  it('ночью показывает ту же неделю, что и днём', () => {
    const night = dateUtils.getWeekDates(new Date(2026, 7, 10, 0, 30)).map(dateUtils.formatDate)
    const day = dateUtils.getWeekDates(new Date(2026, 7, 10, 14, 0)).map(dateUtils.formatDate)
    expect(night).toEqual(day)
    expect(night[0]).toBe('2026-08-10')
  })
})

describe('addDays', () => {
  it('шаг назад через границу месяца', () => {
    expect(dateUtils.formatDate(dateUtils.addDays(new Date(2026, 7, 1, 10, 0), -1))).toBe(
      '2026-07-31'
    )
  })

  it('ночной шаг не теряет и не добавляет день', () => {
    const from = new Date(2026, 7, 10, 0, 30)
    expect(dateUtils.formatDate(dateUtils.addDays(from, -7))).toBe('2026-08-03')
  })
})

describe('localDateTime', () => {
  it('отдаёт местное время, а не гринвичское', () => {
    expect(localDateTime(EVENING)).toBe('2026-08-09T23:40')
  })
})
