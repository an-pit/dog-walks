import React, { useMemo } from 'react'
import './WalksChart.css'

/**
 * График времени прогулок по дням.
 *
 * Нарисован вручную на SVG, без библиотеки: Chart.js весит больше,
 * чем весь остальной бандл, а нужны здесь всего столбики и одна линия.
 * Цвета берутся из токенов, поэтому тёмная тема работает сама.
 */
function WalksChart({ data }) {
  const geometry = useMemo(() => {
    if (!data || data.length === 0) return null

    const width = 720
    const height = 220
    const padding = { top: 16, right: 12, bottom: 28, left: 40 }

    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom

    const maxValue = Math.max(
      60,
      ...data.map((d) => Math.max(d.minutes, d.baseline || 0))
    )
    // Округляем потолок до получаса вверх — иначе подписи оси выглядят случайными
    const ceiling = Math.ceil(maxValue / 30) * 30

    const stepX = plotWidth / data.length
    const barWidth = Math.max(2, Math.min(stepX * 0.7, 24))

    const toY = (value) => padding.top + plotHeight - (value / ceiling) * plotHeight
    const toX = (index) => padding.left + index * stepX + stepX / 2

    const bars = data.map((d, i) => ({
      ...d,
      x: toX(i) - barWidth / 2,
      y: toY(d.minutes),
      width: barWidth,
      height: Math.max(0, padding.top + plotHeight - toY(d.minutes)),
    }))

    // Линия медианы рвётся там, где базовой линии ещё нет
    const segments = []
    let current = []
    data.forEach((d, i) => {
      if (d.baseline === null) {
        if (current.length > 1) segments.push(current)
        current = []
        return
      }
      current.push(`${toX(i)},${toY(d.baseline)}`)
    })
    if (current.length > 1) segments.push(current)

    const ticks = [0, ceiling / 2, ceiling].map((value) => ({
      value,
      y: toY(value),
    }))

    return { width, height, padding, plotHeight, bars, segments, ticks, ceiling }
  }, [data])

  if (!geometry) return null

  const { width, height, padding, bars, segments, ticks } = geometry

  // Подписи дат: показываем не все, иначе на месяце они сливаются
  const labelEvery = Math.ceil(bars.length / 8)

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg"
        role="img"
        aria-label="График времени прогулок по дням со скользящей медианой"
      >
        {ticks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={padding.left}
              y1={tick.y}
              x2={width - padding.right}
              y2={tick.y}
              className="chart-grid"
            />
            <text x={padding.left - 6} y={tick.y + 4} className="chart-tick">
              {Math.round(tick.value)}
            </text>
          </g>
        ))}

        {bars.map((bar) => (
          <rect
            key={bar.date}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx="2"
            className={bar.weekend ? 'chart-bar chart-bar-weekend' : 'chart-bar'}
          >
            <title>
              {bar.date}: {bar.minutes} мин, прогулок {bar.walks}
              {bar.baseline !== null ? `, обычно ${bar.baseline}` : ''}
            </title>
          </rect>
        ))}

        {segments.map((points, i) => (
          <polyline key={i} points={points.join(' ')} className="chart-median" />
        ))}

        {bars.map((bar, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`label-${bar.date}`}
              x={bar.x + bar.width / 2}
              y={height - 8}
              className="chart-label"
            >
              {bar.date.slice(8, 10)}.{bar.date.slice(5, 7)}
            </text>
          ) : null
        )}
      </svg>

      <div className="chart-legend">
        <span className="chart-legend-item">
          <span className="chart-swatch chart-swatch-bar" aria-hidden="true" />
          минут за день
        </span>
        <span className="chart-legend-item">
          <span className="chart-swatch chart-swatch-weekend" aria-hidden="true" />
          выходные
        </span>
        <span className="chart-legend-item">
          <span className="chart-swatch chart-swatch-median" aria-hidden="true" />
          медиана за 28 дней
        </span>
      </div>
    </div>
  )
}

export default WalksChart
