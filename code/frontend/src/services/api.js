// API сервис для взаимодействия с бэкендом
const API_BASE = '/api'

export const api = {
  // Получить прогулки за период
  async getWalks(from, to) {
    const response = await fetch(`${API_BASE}/walks?from=${from}&to=${to}`)
    if (!response.ok) {
      throw new Error(`Ошибка получения данных: ${response.status}`)
    }
    return await response.json()
  },

  // Обновить прогулку.
  // Детали передаются объектом, а не позиционными аргументами: полей уже
  // четыре, и при добавлении следующего не придётся править все вызовы.
  async updateWalk(date, slot, { person, duration = null, comments = '', poop = null, endedAt = null }) {
    const response = await fetch(`${API_BASE}/walks/${date}/${slot}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ person, duration, comments, poop, endedAt })
    })

    if (!response.ok) {
      throw new Error(`Ошибка обновления: ${response.status}`)
    }

    return await response.json()
  },

  // Наблюдения за день: факты и отклонения от собственной нормы
  async getInsights(date) {
    const response = await fetch(`${API_BASE}/insights?date=${date}`)
    if (!response.ok) {
      throw new Error(`Ошибка получения наблюдений: ${response.status}`)
    }
    return await response.json()
  },

  // Журнал изменений записи
  async getChanges(date, slot) {
    const response = await fetch(`${API_BASE}/changes?date=${date}&slot=${slot}`)
    if (!response.ok) {
      throw new Error(`Ошибка получения журнала: ${response.status}`)
    }
    return await response.json()
  },

  // Ряд по дням для графика
  async getSeries(from, to) {
    const response = await fetch(`${API_BASE}/series?from=${from}&to=${to}`)
    if (!response.ok) {
      throw new Error(`Ошибка получения ряда: ${response.status}`)
    }
    return await response.json()
  },

  // Сохранённый разбор периода
  async getAiReport(from, to) {
    const response = await fetch(`${API_BASE}/ai-report?from=${from}&to=${to}`)
    if (!response.ok) {
      throw new Error(`Ошибка получения разбора: ${response.status}`)
    }
    return await response.json()
  },

  // Сгенерировать разбор заново. POST, а не GET: запрос стоит денег
  // и меняет состояние — такое не должно случаться от перехода по ссылке.
  async generateAiReport(from, to) {
    const response = await fetch(`${API_BASE}/ai-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.error || `Ошибка генерации: ${response.status}`)
    }
    return data
  },

  // Получить статистику
  async getStats(from, to) {
    const response = await fetch(`${API_BASE}/stats?from=${from}&to=${to}`)
    if (!response.ok) {
      throw new Error(`Ошибка получения статистики: ${response.status}`)
    }
    return await response.json()
  },

  // Экспорт в CSV
  async exportCSV(from, to) {
    const response = await fetch(`${API_BASE}/export?from=${from}&to=${to}`)
    if (!response.ok) {
      throw new Error(`Ошибка экспорта: ${response.status}`)
    }
    
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `walks_${from}_${to}.csv`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }
}

// Вспомогательные функции для работы с датами.
//
// ГЛАВНОЕ ПРАВИЛО: дата прогулки — это календарный день по местным часам,
// а не момент времени. Ни одна из функций здесь не имеет права трогать UTC.
export const dateUtils = {
  /**
   * Объект Date → 'YYYY-MM-DD' по местному календарю.
   *
   * Раньше здесь был toISOString(), и это молча ломало всё приложение
   * по ночам: в UTC+3 объект «10 августа 01:00» превращается в строку
   * «2026-08-09», потому что в Гринвиче ещё девятое. Заголовок страницы
   * при этом рисуется локальным toLocaleDateString и показывает десятое.
   * Получалось, что страница подписана одним днём, а читает и пишет другой.
   */
  formatDate(date) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  },

  /**
   * 'YYYY-MM-DD' → объект Date на полдень местного времени.
   *
   * Полдень, а не полночь: new Date('2026-08-09') парсится как UTC,
   * и в зонах западнее Гринвича даёт восьмое число. Середина суток
   * переживает сдвиг в любую сторону до двенадцати часов.
   */
  parseDate(dateStr) {
    return new Date(`${dateStr}T12:00:00`)
  },

  getWeekDates(startDate = new Date()) {
    const date = new Date(startDate)
    // Время сбрасываем в полдень: дальше идёт арифметика по дням,
    // а от полуночи она уязвима к переводу часов и к сдвигу в UTC
    date.setHours(12, 0, 0, 0)

    const day = date.getDay()
    // Неделя начинается с понедельника, поэтому воскресенье (day === 0)
    // относится к предыдущей неделе, а не открывает следующую
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(date.setDate(diff))

    const week = []
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(monday)
      currentDate.setDate(monday.getDate() + i)
      week.push(currentDate)
    }

    return week
  },

  addDays(date, days) {
    const result = new Date(date)
    result.setHours(12, 0, 0, 0)
    result.setDate(result.getDate() + days)
    return result
  },

  formatDisplayDate(date) {
    return date.toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    })
  }
}

/**
 * Текущее локальное время как 'YYYY-MM-DDTHH:MM'.
 * toISOString() не подходит: он переводит в UTC, и вечерняя прогулка
 * в UTC+3 записалась бы вчерашним днём.
 */
export function localDateTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

// Минуты в читаемый вид: 0 → «0 мин», 45 → «45 мин», 125 → «2 ч 5 мин»
export function formatMinutes(totalMinutes) {
  const total = Number(totalMinutes) || 0
  if (total < 60) return `${total} мин`

  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`
}

/**
 * Считает итоги по набору прогулок.
 * Логика повторяет бэкенд: прогулка «Оба» засчитывается обоим,
 * и её длительность тоже идёт в зачёт каждому.
 */
export function summarize(walks) {
  const result = {
    andrey: 0,
    ira: 0,
    total: 0,
    andreyMinutes: 0,
    iraMinutes: 0,
    totalMinutes: 0,
  }

  walks.forEach(({ person, duration = 0 }) => {
    if (!person) return

    result.total++
    result.totalMinutes += duration

    if (person === 'andrey' || person === 'both') {
      result.andrey++
      result.andreyMinutes += duration
    }
    if (person === 'ira' || person === 'both') {
      result.ira++
      result.iraMinutes += duration
    }
  })

  return result
}

// Константы для слотов и персонажей
export const SLOTS = {
  morning: 'Утро',
  afternoon: 'День',
  evening: 'Вечер'
}

export const PERSONS = {
  // ○ вместо ⬜: текстовый глиф наследует currentColor,
  // поэтому виден и на светлой плашке, и в тёмной теме
  none: { label: 'Никто', color: '#ecf0f1', emoji: '○' },
  andrey: { label: 'Андрей', color: '#3498db', emoji: '🔵' },
  ira: { label: 'Ира', color: '#9b59b6', emoji: '🟣' },
  both: { label: 'Оба', color: '#2ecc71', emoji: '🟢' }
}

// Отметка о туалете. null — не отмечено, и это не то же самое, что «нет»:
// «не проверяли» и «проверили, не было» — разные факты.
export const POOP = {
  null: { label: '?', short: 'не отмечено', title: 'Не отмечено', emoji: '' },
  yes: { label: 'Покакал', short: 'покакал', emoji: '💩' },
  no: { label: 'Не покакал', short: 'не покакал', emoji: '🚫' }
}

// Порядок перебора по кругу — как у смены человека
export const POOP_ORDER = [null, 'yes', 'no']

export function poopInfo(value) {
  return POOP[value === null || value === undefined ? 'null' : value] || POOP.null
}

export function nextPoop(value) {
  const current = value === undefined ? null : value
  const index = POOP_ORDER.indexOf(current)
  return POOP_ORDER[(index + 1) % POOP_ORDER.length]
}

export const PERSON_ORDER = ['none', 'andrey', 'ira', 'both']