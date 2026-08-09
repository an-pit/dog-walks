import React, { useState, useEffect } from 'react'
import { api } from '../services/api'
import './AiReport.css'

/**
 * Разбор периода языковой моделью.
 *
 * Сохранённый разбор подгружается сразу, генерация — только по кнопке:
 * каждый запрос стоит денег, поэтому он не должен случаться сам собой
 * при открытии вкладки или смене периода.
 */
function AiReport({ from, to }) {
  const [report, setReport] = useState(null)
  const [available, setAvailable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setReport(null)
    setError('')

    if (!from || !to) return undefined

    api
      .getAiReport(from, to)
      .then((data) => {
        if (cancelled) return
        setReport(data.report)
        setAvailable(data.available)
      })
      .catch(() => {
        // Отсутствие разбора — не ошибка, показывать нечего
      })

    return () => {
      cancelled = true
    }
  }, [from, to])

  const generate = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.generateAiReport(from, to)
      setReport(data.report)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!available && !report) return null

  return (
    <section className="ai-report">
      <div className="ai-head">
        <h3>Разбор периода</h3>
        <button
          type="button"
          className="ai-button"
          onClick={generate}
          disabled={loading}
        >
          {loading ? 'Считаем…' : report ? 'Перегенерировать' : 'AI-анализ за период'}
        </button>
      </div>

      {loading && (
        <p className="ai-hint">
          Модель читает записи за период. Обычно занимает до полуминуты.
        </p>
      )}

      {error && <div className="error">{error}</div>}

      {report && !loading && (
        <>
          <div className="ai-text">
            {report.content.split('\n').filter(Boolean).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
          {/* Обрыв по лимиту токенов выглядит как поломка приложения:
              текст просто кончается на полуслове. Говорим прямо, что случилось */}
          {report.finish_reason === 'length' && (
            <p className="ai-warning">
              Ответ оборван: модель упёрлась в лимит токенов. Увеличьте
              LLM_MAX_TOKENS в .env на сервере и перегенерируйте.
            </p>
          )}
          <p className="ai-meta">
            {new Date(report.created_at + 'Z').toLocaleString('ru-RU')} · {report.model}
          </p>
        </>
      )}

      {!report && !loading && (
        <p className="ai-hint">
          Модель прочитает цифры и заметки за выбранный период и опишет,
          что в них видно. Это не медицинское заключение.
        </p>
      )}
    </section>
  )
}

export default AiReport
