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

  // Обновить прогулку
  async updateWalk(date, slot, person, duration = 0) {
    const response = await fetch(`${API_BASE}/walks/${date}/${slot}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ person, duration })
    })
    
    if (!response.ok) {
      throw new Error(`Ошибка обновления: ${response.status}`)
    }
    
    return await response.json()
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

// Вспомогательные функции для работы с датами
export const dateUtils = {
  formatDate(date) {
    return date.toISOString().split('T')[0]
  },

  getWeekDates(startDate = new Date()) {
    const date = new Date(startDate)
    const day = date.getDay()
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

// Константы для слотов и персонажей
export const SLOTS = {
  morning: 'Утро',
  afternoon: 'День', 
  evening: 'Вечер'
}

export const PERSONS = {
  none: { label: 'Никто', color: '#ecf0f1', emoji: '⬜' },
  andrey: { label: 'Андрей', color: '#3498db', emoji: '🔵' },
  ira: { label: 'Ира', color: '#9b59b6', emoji: '🟣' },
  both: { label: 'Оба', color: '#2ecc71', emoji: '🟢' }
}

export const PERSON_ORDER = ['none', 'andrey', 'ira', 'both']