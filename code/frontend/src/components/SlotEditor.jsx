import React, { useState, useEffect, useRef } from 'react'
import { PERSONS, PERSON_ORDER, POOP_ORDER, poopInfo, formatMinutes } from '../services/api'
import './SlotEditor.css'

const PRESETS = [15, 30, 45, 60]

/**
 * Панель редактирования слота. Открывается тапом по карточке и правит
 * всё сразу: кто гулял, сколько, туалет, заметка.
 *
 * Сохранение мгновенное: каждый выбор сразу уходит в onChange,
 * поэтому кнопки «Сохранить» нет — только «Готово» для закрытия.
 * Исключение — текст заметки: его сохраняем при потере фокуса,
 * иначе запрос уходил бы на каждое нажатие клавиши.
 */
function SlotEditor({ isOpen, onClose, onChange, value, slotLabel, dateLabel }) {
  const { person = 'none', duration = 0, comments = '', poop = null } = value || {}

  const [draftComments, setDraftComments] = useState('')
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const dialogRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setDraftComments(comments || '')
      // Заметку раскрываем сразу, если она уже написана
      setCommentsOpen(Boolean(comments))
      setCustomOpen(duration > 0 && !PRESETS.includes(duration))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const commitComments = () => {
    if (draftComments !== comments) onChange({ comments: draftComments })
  }

  const handleClose = () => {
    commitComments()
    onClose()
  }

  return (
    <div className="editor-overlay" onClick={handleClose}>
      <div
        className="editor-sheet"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${dateLabel}, ${slotLabel}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="editor-head">
          <div>
            <p className="editor-date">{dateLabel}</p>
            <h3 className="editor-slot">{slotLabel}</h3>
          </div>
          <button className="editor-close" onClick={handleClose} aria-label="Закрыть">
            ✕
          </button>
        </header>

        {/* Кто гулял — самое частое действие, поэтому крупнее всего */}
        <div className="person-grid">
          {PERSON_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className={`person-tile ${key} ${person === key ? 'selected' : ''}`}
              onClick={() => onChange({ person: key })}
              aria-pressed={person === key}
            >
              <span className="person-emoji">{PERSONS[key].emoji}</span>
              {PERSONS[key].label}
            </button>
          ))}
        </div>

        <div className="editor-row">
          <span className="editor-value">
            {duration > 0 ? formatMinutes(duration) : 'Длительность не указана'}
          </span>
          <button
            type="button"
            className="editor-link"
            onClick={() => setCustomOpen((v) => !v)}
          >
            {customOpen ? 'Скрыть' : 'Другое'}
          </button>
        </div>

        <div className="preset-row">
          {PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              className={`preset ${duration === value ? 'selected' : ''}`}
              onClick={() => onChange({ duration: duration === value ? 0 : value })}
              aria-pressed={duration === value}
            >
              {value}
            </button>
          ))}
        </div>

        {customOpen && (
          <input
            className="editor-input"
            type="number"
            min="0"
            max="480"
            value={duration || ''}
            placeholder="Минуты"
            onChange={(e) => onChange({ duration: parseInt(e.target.value, 10) || 0 })}
            autoFocus
          />
        )}

        <div className="poop-row">
          {POOP_ORDER.map((key) => (
            <button
              key={String(key)}
              type="button"
              className={`poop-option poop-${key ?? 'none'} ${poop === key ? 'selected' : ''}`}
              onClick={() => onChange({ poop: key })}
              aria-pressed={poop === key}
            >
              <span aria-hidden="true">{poopInfo(key).emoji}</span> {poopInfo(key).label}
            </button>
          ))}
        </div>

        {commentsOpen ? (
          <textarea
            className="editor-textarea"
            value={draftComments}
            onChange={(e) => setDraftComments(e.target.value)}
            onBlur={commitComments}
            placeholder="Заметка о прогулке"
            rows="2"
            maxLength="500"
          />
        ) : (
          <button
            type="button"
            className="editor-add-note"
            onClick={() => setCommentsOpen(true)}
          >
            + Добавить заметку
          </button>
        )}

        <button type="button" className="editor-done" onClick={handleClose}>
          Готово
        </button>
      </div>
    </div>
  )
}

export default SlotEditor
