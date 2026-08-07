import React from 'react'
import { formatMinutes, PERSONS } from '../services/api'
import './SummaryStats.css'

/**
 * Блок итогов. Один на все вкладки: «День», «Неделя» и «Статистика»
 * показывают одно и то же, поэтому и выглядеть должны одинаково.
 *
 * Ожидает объект вида { andrey, ira, total, andreyMinutes, iraMinutes,
 * totalMinutes } — его отдают и summarize() на клиенте, и /api/stats.
 */
function SummaryStats({ summary, poop, title }) {
  if (!summary) return null

  const items = [
    {
      key: 'andrey',
      emoji: PERSONS.andrey.emoji,
      label: PERSONS.andrey.label,
      count: summary.andrey,
      minutes: summary.andreyMinutes,
    },
    {
      key: 'ira',
      emoji: PERSONS.ira.emoji,
      label: PERSONS.ira.label,
      count: summary.ira,
      minutes: summary.iraMinutes,
    },
    {
      key: 'total',
      emoji: '🐕',
      label: 'Всего',
      count: summary.total,
      minutes: summary.totalMinutes,
    },
  ]

  return (
    <section className="summary">
      {title && <h3 className="summary-title">{title}</h3>}

      <div className="summary-grid">
        {items.map((item) => (
          <div key={item.key} className={`summary-item ${item.key}`}>
            <span className="summary-emoji" aria-hidden="true">{item.emoji}</span>
            <span className="summary-label">{item.label}</span>
            <span className="summary-count">
              {item.count}
              <span className="summary-unit"> прогулок</span>
            </span>
            <span className="summary-minutes">{formatMinutes(item.minutes)}</span>
          </div>
        ))}

        {/* Отметки о туалете показываем, только если они переданы:
            на вкладке «День» этой статистики нет */}
        {poop && (
          <div className="summary-item poop">
            <span className="summary-emoji" aria-hidden="true">💩</span>
            <span className="summary-label">Покакал</span>
            <span className="summary-count">
              {poop.yes}
              <span className="summary-unit"> из {poop.marked}</span>
            </span>
            <span className="summary-minutes">
              {poop.marked
                ? `${Math.round((poop.yes / poop.marked) * 100)}% отмеченных`
                : 'нет отметок'}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

export default SummaryStats
