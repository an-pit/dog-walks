import React, { useState, useEffect } from 'react'
import { api, dateUtils } from '../services/api'
import SummaryStats from './SummaryStats'
import './StatsPage.css'

function StatsPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    loadStats()
  }, [period])

  const getDateRange = () => {
    const today = new Date()
    
    switch (period) {
      case 'week':
        const weekAgo = dateUtils.addDays(today, -7)
        return {
          from: dateUtils.formatDate(weekAgo),
          to: dateUtils.formatDate(today)
        }
      case 'month':
        const monthAgo = dateUtils.addDays(today, -30)
        return {
          from: dateUtils.formatDate(monthAgo),
          to: dateUtils.formatDate(today)
        }
      case 'custom':
        return {
          from: customFrom,
          to: customTo
        }
      default:
        return {
          from: dateUtils.formatDate(today),
          to: dateUtils.formatDate(today)
        }
    }
  }

  const loadStats = async () => {
    if (period === 'custom' && (!customFrom || !customTo)) {
      return
    }

    setLoading(true)
    setError('')
    
    try {
      const range = getDateRange()
      const data = await api.getStats(range.from, range.to)
      setStats(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (period === 'custom' && (!customFrom || !customTo)) {
      setError('Укажите даты для экспорта')
      return
    }

    try {
      const range = getDateRange()
      await api.exportCSV(range.from, range.to)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return <div className="loading">Загрузка статистики...</div>
  }

  return (
    <div className="stats-page view-card">
      <div className="stats-header">
        <h2>Статистика прогулок</h2>
        
        <div className="period-tabs">
          {[
            ['week', 'Неделя'],
            ['month', 'Месяц'],
            ['custom', 'Период'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={period === key ? 'active' : ''}
              onClick={() => setPeriod(key)}
              aria-pressed={period === key}
            >
              {label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="custom-dates">
            <label>
              <span>С</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label>
              <span>По</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
            <button className="apply-btn" onClick={loadStats}>Применить</button>
          </div>
        )}

        <button className="export-btn" onClick={handleExport}>
          Экспорт в CSV
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {stats && (
        <div className="stats-content">
          <div className="period-info">
            <h3>Период: {stats.period.from} - {stats.period.to}</h3>
          </div>

          <SummaryStats
            summary={{
              andrey: stats.statistics.andrey,
              ira: stats.statistics.ira,
              total: stats.statistics.total,
              andreyMinutes: stats.statistics.andreyDuration,
              iraMinutes: stats.statistics.iraDuration,
              totalMinutes: stats.statistics.totalDuration,
            }}
            poop={{
              yes: stats.statistics.poopYes ?? 0,
              marked: stats.statistics.poopMarked ?? 0,
            }}
          />

          <div className="walks-table">
            <h3>Детализация по дням</h3>
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Утро</th>
                  <th>Длительность</th>
                  <th>День</th>
                  <th>Длительность</th>
                  <th>Вечер</th>
                  <th>Длительность</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupWalksByDate(stats.walks)).map(([date, walksBySlot]) => (
                  <tr key={date}>
                    <td>{date}</td>
                    <td>{getPersonEmoji(walksBySlot.morning?.person)}</td>
                    <td>{walksBySlot.morning?.duration > 0 ? `${walksBySlot.morning.duration}м` : '-'}</td>
                    <td>{getPersonEmoji(walksBySlot.afternoon?.person)}</td>
                    <td>{walksBySlot.afternoon?.duration > 0 ? `${walksBySlot.afternoon.duration}м` : '-'}</td>
                    <td>{getPersonEmoji(walksBySlot.evening?.person)}</td>
                    <td>{walksBySlot.evening?.duration > 0 ? `${walksBySlot.evening.duration}м` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function groupWalksByDate(walks) {
  const grouped = {}
  
  walks.forEach(walk => {
    if (!grouped[walk.walk_date]) {
      grouped[walk.walk_date] = {}
    }
    grouped[walk.walk_date][walk.slot] = {
      person: walk.person,
      duration: walk.duration || 0
    }
  })
  
  return grouped
}

function getPersonEmoji(person) {
  const emojis = {
    'andrey': '🔵',
    'ira': '🟣',
    'both': '🟢',
    'none': '⬜'
  }
  return emojis[person] || '❓'
}

export default StatsPage