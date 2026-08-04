import React, { useState, useEffect } from 'react'
import { api, dateUtils, SLOTS, PERSONS, PERSON_ORDER } from '../services/api'
import DurationModal from './DurationModal'
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
      })
      
      setWalks(walksMap)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSlotClick = (date, slot) => {
    setCurrentDate(date)
    setCurrentSlot(slot)
    setModalOpen(true)
  }

  const handleSaveDuration = async (duration, comments) => {
    const currentPerson = walks[currentDate]?.[currentSlot] || 'none'
    
    try {
      await api.updateWalk(currentDate, currentSlot, currentPerson, duration, comments)
      
      // Обновляем локальное состояние
      setWalks(prev => ({
        ...prev,
        [currentDate]: {
          ...prev[currentDate],
          [currentSlot]: currentPerson,
          [`${currentSlot}_duration`]: duration,
          [`${currentSlot}_comments`]: comments
        }
      }))
    } catch (err) {
      setError(err.message)
    }
  }

  const handlePersonChange = async (date, slot) => {
    const currentPerson = walks[date]?.[slot] || 'none'
    const currentIndex = PERSON_ORDER.indexOf(currentPerson)
    const nextIndex = (currentIndex + 1) % PERSON_ORDER.length
    const nextPerson = PERSON_ORDER[nextIndex]

    try {
      const currentDuration = walks[date]?.[`${slot}_duration`] || 0
      const currentComments = walks[date]?.[`${slot}_comments`] || ''
      await api.updateWalk(date, slot, nextPerson, currentDuration, currentComments)
      
      // Обновляем локальное состояние
      setWalks(prev => ({
        ...prev,
        [date]: {
          ...prev[date],
          [slot]: nextPerson
        }
      }))
    } catch (err) {
      setError(err.message)
    }
  }

  const navigateWeek = (direction) => {
    setCurrentWeek(dateUtils.addDays(currentWeek, direction * 7))
  }

  if (loading) {
    return <div className="loading">Загрузка...</div>
  }

  return (
    <div className="week-view">
      <div className="week-navigation">
        <button onClick={() => navigateWeek(-1)}>← Предыдущая неделя</button>
        <h2>
          Неделя {weekDates[0].getDate()}-{weekDates[6].getDate()} {weekDates[0].toLocaleDateString('ru-RU', { month: 'long' })}
        </h2>
        <button onClick={() => navigateWeek(1)}>Следующая неделя →</button>
      </div>

      {error && <div className="error">{error}</div>}

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
              const personInfo = PERSONS[person]
              
              return (
                <div
                  key={`${dateStr}-${slotKey}`}
                  className={`slot-cell ${person}`}
                  style={{ backgroundColor: personInfo.color }}
                  title={`${dateUtils.formatDisplayDate(date)} ${slotLabel}: ${personInfo.label}${duration > 0 ? ` (${duration} мин)` : ''}`}
                >
                  <div className="slot-header">
                    <span className="emoji">{personInfo.emoji}</span>
                    <button
                      className="duration-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        setCurrentDate(dateStr)
                        setCurrentSlot(slotKey)
                        setModalOpen(true)
                      }}
                      title="Установить длительность"
                    >
                      ⏱️
                    </button>
                  </div>
                  <span className="person-label">{personInfo.label}</span>
                  {duration > 0 && (
                    <span className="duration-label">{duration} мин</span>
                  )}
                  <button
                    className="person-change-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handlePersonChange(dateStr, slotKey)
                    }}
                    title="Сменить человека"
                  >
                    🔄
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <DurationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveDuration}
        currentDuration={walks[currentDate]?.[`${currentSlot}_duration`] || 0}
        currentComments={walks[currentDate]?.[`${currentSlot}_comments`] || ''}
        slotLabel={SLOTS[currentSlot]}
        dateLabel={currentDate ? new Date(currentDate).toLocaleDateString('ru-RU') : ''}
      />
    </div>
  )
}

export default WeekView