import React, { useState, useEffect } from 'react'
import { api, dateUtils, SLOTS, PERSONS, PERSON_ORDER } from '../services/api'
import DurationModal from './DurationModal'
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
      })
      
      setWalks(walksMap)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDurationClick = (slot) => {
    setCurrentSlot(slot)
    setModalOpen(true)
  }

  const handleSaveDuration = async (duration) => {
    const currentPerson = walks[currentSlot] || 'none'
    
    try {
      await api.updateWalk(dateStr, currentSlot, currentPerson, duration)
      
      setWalks(prev => ({
        ...prev,
        [currentSlot]: currentPerson,
        [`${currentSlot}_duration`]: duration
      }))
    } catch (err) {
      setError(err.message)
    }
  }

  const handlePersonChange = async (slot) => {
    const currentPerson = walks[slot] || 'none'
    const currentIndex = PERSON_ORDER.indexOf(currentPerson)
    const nextIndex = (currentIndex + 1) % PERSON_ORDER.length
    const nextPerson = PERSON_ORDER[nextIndex]

    try {
      const currentDuration = walks[`${slot}_duration`] || 0
      await api.updateWalk(dateStr, slot, nextPerson, currentDuration)
      
      setWalks(prev => ({
        ...prev,
        [slot]: nextPerson
      }))
    } catch (err) {
      setError(err.message)
    }
  }

  const navigateDay = (direction) => {
    setCurrentDate(dateUtils.addDays(currentDate, direction))
  }

  if (loading) {
    return <div className="loading">Загрузка...</div>
  }

  return (
    <div className="day-view">
      <div className="day-navigation">
        <button onClick={() => navigateDay(-1)}>← Вчера</button>
        <h2>
          {currentDate.toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })}
        </h2>
        <button onClick={() => navigateDay(1)}>Завтра →</button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="slots-grid">
        {Object.entries(SLOTS).map(([slotKey, slotLabel]) => {
          const person = walks[slotKey] || 'none'
          const duration = walks[`${slotKey}_duration`] || 0
          const personInfo = PERSONS[person]
          
          return (
            <div
              key={slotKey}
              className={`slot-card ${person}`}
              style={{ backgroundColor: personInfo.color }}
            >
              <div className="slot-header">
                <span className="slot-time">{slotLabel}</span>
                <span className="slot-emoji">{personInfo.emoji}</span>
              </div>
              <div className="slot-person">{personInfo.label}</div>
              {duration > 0 && (
                <div className="slot-duration">
                  ⏱️ {duration} минут
                </div>
              )}
              <div className="slot-actions">
                <button
                  className="duration-btn"
                  onClick={() => handleDurationClick(slotKey)}
                >
                  Установить длительность
                </button>
                <button
                  className="person-btn"
                  onClick={() => handlePersonChange(slotKey)}
                >
                  Сменить человека
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="day-summary">
        <h3>Статистика за день:</h3>
        <div className="stats">
          <div className="stat">
            <span className="stat-emoji">🔵</span>
            <span>Андрей: {Object.values(walks).filter(p => p === 'andrey').length}</span>
          </div>
          <div className="stat">
            <span className="stat-emoji">🟣</span>
            <span>Ира: {Object.values(walks).filter(p => p === 'ira').length}</span>
          </div>
          <div className="stat">
            <span className="stat-emoji">🟢</span>
            <span>Оба: {Object.values(walks).filter(p => p === 'both').length}</span>
          </div>
        </div>
      </div>

      <DurationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveDuration}
        currentDuration={walks[`${currentSlot}_duration`] || 0}
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