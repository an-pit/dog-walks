import React, { useState, useEffect } from 'react'
import './DurationModal.css'

const PRESETS = [15, 30, 45, 60]

function DurationModal({
  isOpen,
  onClose,
  onSave,
  currentDuration = 0,
  currentComments = '',
  slotLabel,
  dateLabel,
}) {
  // Длительность храним строкой, а не числом: так поле может быть пустым.
  // Ноль показывать не нужно — вместо него подсказка в placeholder.
  const [duration, setDuration] = useState('')
  const [comments, setComments] = useState('')

  // Модалка не размонтируется при закрытии (ниже стоит `return null`),
  // поэтому useState отработал бы ровно один раз и при следующем открытии
  // показывал бы данные от прошлого слота. Синхронизируем при каждом открытии.
  useEffect(() => {
    if (isOpen) {
      setDuration(currentDuration > 0 ? String(currentDuration) : '')
      setComments(currentComments || '')
    }
    // Зависим только от isOpen: пропсы приходят вместе с открытием,
    // а во время редактирования меняться не должны.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  const handleSave = () => {
    // Пустое поле означает «не засекали» — в базу пишем 0
    onSave(parseInt(duration, 10) || 0, comments)
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') onClose()
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
            onKeyDown={handleKeyDown}
            placeholder="Не указана"
            autoFocus
          />
        </div>

        <div className="duration-presets">
          <span>Быстрый выбор:</span>
          {PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              className={parseInt(duration, 10) === value ? 'preset-active' : ''}
              onClick={() => setDuration(String(value))}
            >
              {value} мин
            </button>
          ))}
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
          <button className="cancel-btn" type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="save-btn" type="button" onClick={handleSave}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}

export default DurationModal
