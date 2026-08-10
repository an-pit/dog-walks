import React, { useState, useEffect, useMemo } from 'react'
import { api, dateUtils, poopInfo, summarize, SLOTS, PERSONS } from '../services/api'
import SlotEditor from './SlotEditor'
import SummaryStats from './SummaryStats'
import './WeekView.css'

function WeekView() {
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [walks, setWalks] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [currentSlot, setCurrentSlot] = useState(null)
  const [currentDate, setCurrentDate] = useState('')

  const weekDates = dateUtils.getWeekDates(currentWeek)
  const weekStart = dateUtils.formatDate(weekDates[0])
  const weekEnd = dateUtils.formatDate(weekDates[6])

  useEffect(() => {
    loadWalks()
  }, [currentWeek])

  const loadWalks = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getWalks(weekStart, weekEnd)
      
      // Преобразуем в удобный формат: { '2024-01-01': { morning: 'andrey', morning_duration: 30, morning_comments: '...' } }
      const walksMap = {}
      data.forEach(walk => {
        if (!walksMap[walk.walk_date]) {
          walksMap[walk.walk_date] = {}
        }
        walksMap[walk.walk_date][walk.slot] = walk.person
        walksMap[walk.walk_date][`${walk.slot}_duration`] = walk.duration || 0
        walksMap[walk.walk_date][`${walk.slot}_comments`] = walk.comments || ''
        walksMap[walk.walk_date][`${walk.slot}_poop`] = walk.poop ?? null
        walksMap[walk.walk_date][`${walk.slot}_endedAt`] = walk.ended_at ?? null
      })
      
      setWalks(walksMap)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const openEditor = (date, slot) => {
    setCurrentDate(date)
    setCurrentSlot(slot)
    setModalOpen(true)
  }

  const slotValue = (date, slot) => ({
    date,
    person: walks[date]?.[slot] || 'none',
    duration: walks[date]?.[`${slot}_duration`] || 0,
    comments: walks[date]?.[`${slot}_comments`] || '',
    poop: walks[date]?.[`${slot}_poop`] ?? null,
    endedAt: walks[date]?.[`${slot}_endedAt`] ?? null,
  })

  const handlePatch = async (patch) => {
    const date = currentDate
    const slot = currentSlot
    const next = { ...slotValue(date, slot), ...patch }

    setWalks((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        [slot]: next.person,
        [`${slot}_duration`]: next.duration,
        [`${slot}_comments`]: next.comments,
        [`${slot}_poop`]: next.poop,
        [`${slot}_endedAt`]: next.endedAt,
      },
    }))

    try {
      await api.updateWalk(date, slot, next)
    } catch (err) {
      setError(err.message)
      loadWalks()
    }
  }

  // Итоги за неделю: на этой вкладке они полезнее, чем на дневной —
  // видно, как распределилась нагрузка между двумя людьми
  const summary = useMemo(() => {
    const flat = []
    Object.values(walks).forEach((day) => {
      Object.keys(SLOTS).forEach((slot) => {
        if (day[slot]) flat.push({ person: day[slot], duration: day[`${slot}_duration`] || 0 })
      })
    })
    return summarize(flat)
  }, [walks])

  const navigateWeek = (direction) => {
    setCurrentWeek(dateUtils.addDays(currentWeek, direction * 7))
  }

  if (loading) {
    return <div className="loading">Загрузка...</div>
  }

  return (
    <div className="week-view view-card">
      <div className="view-nav">
        <button onClick={() => navigateWeek(-1)} title="Предыдущая неделя">
          ←<span className="nav-text"> Предыдущая неделя</span>
        </button>
        <h2>
          Неделя {weekDates[0].getDate()}-{weekDates[6].getDate()} {weekDates[0].toLocaleDateString('ru-RU', { month: 'long' })}
        </h2>
        <button onClick={() => navigateWeek(1)} title="Следующая неделя">
          <span className="nav-text">Следующая неделя </span>→
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Прокручивается только таблица: навигация и заголовок
          остаются на месте */}
      <div className="week-grid-scroll">
        <div className="week-grid">
          {/* Заголовки дней */}
        <div className="grid-header">
          <div className="time-header">Время</div>
          {weekDates.map(date => (
            <div key={dateUtils.formatDate(date)} className="day-header">
              <div className="weekday">
                {date.toLocaleDateString('ru-RU', { weekday: 'short' })}
              </div>
              <div className="date">
                {date.getDate()}
              </div>
            </div>
          ))}
        </div>

        {/* Строки слотов */}
        {Object.entries(SLOTS).map(([slotKey, slotLabel]) => (
          <div key={slotKey} className="slot-row">
            <div className="slot-label">{slotLabel}</div>
            {weekDates.map(date => {
              const dateStr = dateUtils.formatDate(date)
              const person = walks[dateStr]?.[slotKey] || 'none'
              const duration = walks[dateStr]?.[`${slotKey}_duration`] || 0
              const comments = walks[dateStr]?.[`${slotKey}_comments`] || ''
              const poop = walks[dateStr]?.[`${slotKey}_poop`] ?? null
              const personInfo = PERSONS[person]

              // Подсказка собирает всё, что не помещается в ячейку
              const tooltip = [
                `${dateUtils.formatDisplayDate(date)} ${slotLabel}: ${personInfo.label}`,
                duration > 0 ? `${duration} мин` : null,
                poop ? poopInfo(poop).label : null,
                comments || null,
              ]
                .filter(Boolean)
                .join(' • ')

              return (
                <button
                  key={`${dateStr}-${slotKey}`}
                  type="button"
                  className={`slot-cell ${person}`}
                  title={tooltip}
                  onClick={() => openEditor(dateStr, slotKey)}
                >
                  <span className="emoji">{personInfo.emoji}</span>
                  <span className="person-label">{personInfo.label}</span>
                  {duration > 0 && (
                    <span className="duration-label">{duration} мин</span>
                  )}
                  {/* Признаки компактно, только иконками — в ячейке
                      недельной сетки места на подписи нет */}
                  {(poop || comments) && (
                    <span className="cell-marks">
                      {poop && <span title={poopInfo(poop).label}>{poopInfo(poop).emoji}</span>}
                      {comments && <span title={comments}>💬</span>}
                    </span>
                  )}
                </button>
              )
            })}
            </div>
          ))}
        </div>
      </div>

      <SummaryStats summary={summary} title="Статистика за неделю" />

      <SlotEditor
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onChange={handlePatch}
        value={currentSlot ? slotValue(currentDate, currentSlot) : null}
        slotLabel={SLOTS[currentSlot]}
        dateLabel={
          currentDate ? dateUtils.parseDate(currentDate).toLocaleDateString('ru-RU') : ''
        }
      />
    </div>
  )
}

export default WeekView