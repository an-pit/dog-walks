import React, { useState, useEffect } from 'react'
import { api, formatMinutes } from '../services/api'
import './Observations.css'

/**
 * Наблюдения за день.
 *
 * Показываем факт и отклонение, вывод оставляем человеку: «на 40% меньше
 * обычного», а не «мало гуляли». Никаких медицинских порогов —
 * приложение не ветеринар.
 */
function Observations({ date, revision = 0 }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [methodOpen, setMethodOpen] = useState(false)

  // revision меняется при каждой правке карточки. Наблюдения считаются
  // на сервере — из состояния страницы их не пересчитать, нужен запрос.
  // Раньше зависимость была только от даты, и цифры оставались вчерашними
  // до перезагрузки страницы.
  useEffect(() => {
    let cancelled = false

    api
      .getInsights(date)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [date, revision])

  if (error) return <div className="error">{error}</div>
  if (!data) return null

  const { facts, comparisons, baselineReady, daysCollected, minDaysRequired, notes } = data

  return (
    <section className="observations">
      <div className="obs-head">
        <h3>Наблюдения за день</h3>
        <button
          type="button"
          className="obs-method-toggle"
          onClick={() => setMethodOpen((v) => !v)}
          aria-expanded={methodOpen}
        >
          Как считаем
        </button>
      </div>

      {methodOpen && (
        <div className="obs-method">
          <p>
            Сравниваем с медианой за последние 28 дней — это ровно четыре недели,
            поэтому каждый день недели попадает в выборку четырежды.
          </p>
          <p>
            Будни сравниваются с буднями, выходные с выходными: по субботам
            и воскресеньям прогулки обычно длиннее, и смешивать их с рабочими
            днями значит получать шум вместо сигнала.
          </p>
          <p>
            Берём медиану, а не среднее. Медиана — значение, выше и ниже которого
            ровно половина дней. Одна прогулка на три часа заметно сдвигает
            среднее и почти не двигает медиану.
          </p>
          <p>
            Пока накоплено меньше {minDaysRequired} дней, сравнения не показываем:
            «норма», выведенная из трёх дней, — это не норма.
          </p>
          {comparisons && (
            <p className="obs-method-current">
              Сейчас в выборке {comparisons.method.sampleSize} дней
              {comparisons.method.splitByDayType
                ? ' того же типа (будни или выходные)'
                : ' — однотипных набралось мало, поэтому взяты все подряд'}
              .
            </p>
          )}
        </div>
      )}

      <dl className="obs-facts">
        <div>
          <dt>Прогулок</dt>
          <dd>{facts.walks}</dd>
        </div>
        <div>
          <dt>Время</dt>
          <dd>{facts.minutes > 0 ? formatMinutes(facts.minutes) : '—'}</dd>
        </div>
        {facts.longestGapHours !== null && (
          <div>
            <dt>Перерыв</dt>
            <dd>{facts.longestGapHours} ч</dd>
          </div>
        )}
        <div>
          <dt>Покакал</dt>
          <dd>{facts.poopMarked > 0 ? `${facts.poopYes} из ${facts.poopMarked}` : '—'}</dd>
        </div>
      </dl>

      {!baselineReady && (
        <p className="obs-hint">
          Сравнения появятся, когда накопится {minDaysRequired} дней данных.
          Сейчас: {daysCollected}.
        </p>
      )}

      {comparisons && facts.minutes > 0 && (
        <p className="obs-baseline">
          Обычно в такой день — {formatMinutes(Math.round(comparisons.minutes.baseline))}
          {comparisons.minutes.deviationPercent !== null && (
            <span
              className={
                comparisons.minutes.deviationPercent < 0 ? 'obs-down' : 'obs-up'
              }
            >
              {' '}
              {comparisons.minutes.deviationPercent > 0 ? '+' : ''}
              {comparisons.minutes.deviationPercent}%
            </span>
          )}
        </p>
      )}

      {notes.length > 0 && (
        <ul className="obs-notes">
          {notes.map((note, i) => (
            <li key={i} className={`obs-note obs-${note.kind}`}>
              {note.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default Observations
