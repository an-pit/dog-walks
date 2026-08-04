import React, { useState } from 'react'
import './DurationModal.css'

function DurationModal({ isOpen, onClose, onSave, currentDuration = 0, currentComments = '', slotLabel, dateLabel }) {
  const [duration, setDuration] = useState(currentDuration)
  const [comments, setComments] = useState(currentComments)

  if (!isOpen) return null

  const handleSave = () => {
    onSave(parseInt(duration) || 0, comments)
    onClose()
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSave()
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Длительность прогулки</h3>
        <p className="modal-info">
          {dateLabel} - {slotLabel}
        </p>
        
        <div className="duration-input">
          <label htmlFor="duration">Длительность (минуты):</label>
          <input
            id="duration"
            type="number"
            min="0"
            max="480"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="0-480 минут"
            autoFocus
          />
        </div>

        <div className="duration-presets">
          <span>Быстрый выбор:</span>
          <button onClick={() => setDuration(15)}>15 мин</button>
          <button onClick={() => setDuration(30)}>30 мин</button>
          <button onClick={() => setDuration(45)}>45 мин</button>
          <button onClick={() => setDuration(60)}>60 мин</button>
        </div>

        <div className="comments-input">
          <label htmlFor="comments">Комментарий (необязательно):</label>
          <textarea
            id="comments"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Заметки о прогулке..."
            rows="3"
            maxLength="500"
          />
        </div>

        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose}>
            Отмена
          </button>
          <button className="save-btn" onClick={handleSave}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}

export default DurationModal