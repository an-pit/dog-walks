import React, { useState, useEffect, useMemo } from 'react'
import {
  api,
  dateUtils,
  formatMinutes,
  summarize,
  poopInfo,
  SLOTS,
  PERSONS,
} from '../services/api'
import SlotEditor from './SlotEditor'
import SummaryStats from './SummaryStats'
import Observations from './Observations'
import './DayView.css'

function DayView() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [walks, setWalks] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [currentSlot, setCurrentSlot] = useState('')

  const dateStr = dateUtils.formatDate(currentDate)

  useEffect(() => {
    loadWalks()
  }, [currentDate])

  const loadWalks = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getWalks(dateStr, dateStr)

      const walksMap = {}
      data.forEach(walk => {
        walksMap[walk.slot] = walk.person
        walksMap[`${walk.slot}_duration`] = walk.duration || 0
        walksMap[`${walk.slot}_comments`] = walk.comments || ''
        walksMap[`${walk.slot}_poop`] = walk.poop ?? null
        walksMap[`${walk.slot}_endedAt`] = walk.ended_at ?? null
      })
      
      setWalks(walksMap)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const openEditor = (slot) => {
    setCurrentSlot(slot)
    setModalOpen(true)
  }

  const slotValue = (slot) => ({
    date: dateStr,
    person: walks[slot] || 'none',
    duration: walks[`${slot}_duration`] || 0,
    comments: walks[`${slot}_comments`] || '',
    poop: walks[`${slot}_poop`] ?? null,
    endedAt: walks[`${slot}_endedAt`] ?? null,
  })

  // Сохранение мгновенное: панель шлёт только изменившееся поле,
  // остальное подставляем из текущего состояния слота
  const handlePatch = async (patch) => {
    const slot = currentSlot
    const next = { ...slotValue(slot), ...patch }

    // Сначала показываем результат, потом отправляем: интерфейс
    // не должен ждать сеть на каждое нажатие
    setWalks((prev) => ({
      ...prev,
      [slot]: next.person,
      [`${slot}_duration`]: next.duration,
      [`${slot}_comments`]: next.comments,
      [`${slot}_poop`]: next.poop,
      [`${slot}_endedAt`]: next.endedAt,
    }))

    try {
      await api.updateWalk(dateStr, slot, next)
    } catch (err) {
      setError(err.message)
      loadWalks()
    }
  }

  const navigateDay = (direction) => {
    setCurrentDate(dateUtils.addDays(currentDate, direction))
  }

  // Итоги за день считаем из тех же слотов, что рисуем выше.
  // Раньше здесь фильтровались все значения объекта подряд, включая
  // ключи вида morning_duration — работало по совпадению.
  const summary = useMemo(() => {
    const slotWalks = Object.keys(SLOTS).map((slotKey) => ({
      person: walks[slotKey],
      duration: walks[`${slotKey}_duration`] || 0,
    }))
    return summarize(slotWalks)
  }, [walks])

  if (loading) {
    return <div className="loading">Загрузка...</div>
  }

  return (
    <div className="day-view view-card">
      <div className="view-nav">
        <button onClick={() => navigateDay(-1)} title="Предыдущий день">
          ←<span className="nav-text"> Предыдущий день</span>
        </button>
        <h2>
          {currentDate.toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })}
        </h2>
        <button onClick={() => navigateDay(1)} title="Следующий день">
          <span className="nav-text">Следующий день </span>→
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="slots-grid">
        {Object.entries(SLOTS).map(([slotKey, slotLabel]) => {
          const person = walks[slotKey] || 'none'
          const duration = walks[`${slotKey}_duration`] || 0
          const comments = walks[`${slotKey}_comments`] || ''
          const poop = walks[`${slotKey}_poop`] ?? null
          const personInfo = PERSONS[person]

          return (
            <button
              key={slotKey}
              type="button"
              className={`slot-card ${person}`}
              onClick={() => openEditor(slotKey)}
            >
              <div className="slot-header">
                <span className="slot-time">{slotLabel}</span>
                <span className="slot-emoji">{personInfo.emoji}</span>
              </div>
              <div className="slot-person">{personInfo.label}</div>

              {/* Строка признаков: показываем только заполненное,
                  чтобы пустая карточка оставалась пустой */}
              {(duration > 0 || poop || comments) && (
                <div className="slot-badges">
                  {duration > 0 && (
                    <span className="badge" title="Длительность">
                      ⏱️ {formatMinutes(duration)}
                    </span>
                  )}
                  {poop && (
                    <span className="badge" title={poopInfo(poop).label}>
                      {poopInfo(poop).emoji} {poopInfo(poop).short}
                    </span>
                  )}
                  {comments && (
                    <span className="badge badge-icon" title={comments}>
                      💬
                    </span>
                  )}
                </div>
              )}
              <span className="slot-edit-hint">Изменить</span>
            </button>
          )
        })}
      </div>

      <SummaryStats summary={summary} title="Статистика за день" />

      {/* key по дате: при смене дня наблюдения перезапрашиваются */}
      <Observations key={dateStr} date={dateStr} />

      <SlotEditor
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onChange={handlePatch}
        value={currentSlot ? slotValue(currentSlot) : null}
        slotLabel={SLOTS[currentSlot]}
        dateLabel={currentDate.toLocaleDateString('ru-RU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })}
      />
    </div>
  )
}

export default DayView