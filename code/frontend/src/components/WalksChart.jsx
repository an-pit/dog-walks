import React, { useMemo, useState } from 'react'
import { dateUtils, formatMinutes } from '../services/api'
import './WalksChart.css'

/**
 * График времени прогулок по дням.
 *
 * Нарисован вручную на SVG, без библиотеки: Chart.js весит больше,
 * чем весь остальной бандл, а нужны здесь всего столбики и одна линия.
 * Цвета берутся из токенов, поэтому тёмная тема работает сама.
 */
function WalksChart({ data }) {
  // Индекс дня под курсором. null — курсор вне графика, тогда в панели
  // показывается последний день периода: пустая панель дёргала бы вёрстку
  // при каждом наведении.
  const [active, setActive] = useState(null)

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

    // Столбик рисует минуты. Но нулевая высота означала сразу три разные вещи,
    // и день без единой записи выглядел так же, как день с прогулками
    // без засечённого времени. Поэтому дни без записей помечаем отдельной
    // бледной полосой на всю высоту, а прогулку без минут — заметным пеньком.
    const bars = data.map((d, i) => {
      const hasRecord = d.hasRecord !== false
      const barHeight = Math.max(0, padding.top + plotHeight - toY(d.minutes))

      return {
        ...d,
        index: i,
        hasRecord,
        centerX: toX(i),
        x: toX(i) - barWidth / 2,
        y: hasRecord && d.walks > 0 && barHeight < 3 ? padding.top + plotHeight - 3 : toY(d.minutes),
        width: barWidth,
        height: hasRecord && d.walks > 0 ? Math.max(3, barHeight) : barHeight,
        // Точка на линии медианы — рисуется только для выбранного дня
        baselineY: d.baseline === null ? null : toY(d.baseline),
        // Зона захвата шире столбика и на всю высоту: попасть пальцем
        // в пятнадцать пикселей на телефоне невозможно
        hitX: toX(i) - stepX / 2,
        hitWidth: stepX,
      }
    })

    const gaps = bars.filter((d) => !d.hasRecord)

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

    return { width, height, padding, plotHeight, bars, gaps, segments, ticks, ceiling }
  }, [data])

  if (!geometry) return null

  const { width, height, padding, plotHeight, bars, gaps, segments, ticks } = geometry

  // Подписи дат: показываем не все, иначе на месяце они сливаются
  const labelEvery = Math.ceil(bars.length / 8)

  const shown = bars[active ?? bars.length - 1]
  const pinned = active !== null

  return (
    <div className="chart">
      {/* Панель значений. Живёт над графиком, а не всплывающей подсказкой:
          подсказка на телефоне перекрывает то самое место, куда нажали */}
      <div className="chart-readout" aria-live="polite">
        <span className="chart-readout-date">{readoutDate(shown.date)}</span>
        <span className="chart-readout-values">{readoutValues(shown)}</span>
        {!pinned && <span className="chart-readout-hint">наведите на день</span>}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg"
        role="img"
        aria-label="График времени прогулок по дням со скользящей медианой"
        onMouseLeave={() => setActive(null)}
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

        {gaps.map((gap) => (
          <rect
            key={`gap-${gap.date}`}
            x={gap.hitX}
            y={padding.top}
            width={gap.hitWidth}
            height={plotHeight}
            className="chart-gap"
          />
        ))}

        {/* Вертикаль под выбранным днём: связывает столбик с линией медианы,
            иначе на глаз не понять, какое именно значение с каким сравнивается */}
        {pinned && (
          <line
            x1={shown.centerX}
            y1={padding.top}
            x2={shown.centerX}
            y2={padding.top + plotHeight}
            className="chart-cursor"
          />
        )}

        <g className={pinned ? 'chart-bars chart-bars-dimmed' : 'chart-bars'}>
          {bars.map((bar) => (
            <rect
              key={bar.date}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx="2"
              className={[
                'chart-bar',
                bar.weekend ? 'chart-bar-weekend' : '',
                pinned && bar.index === active ? 'chart-bar-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          ))}
        </g>

        {segments.map((points, i) => (
          <polyline key={i} points={points.join(' ')} className="chart-median" />
        ))}

        {pinned && shown.baselineY !== null && (
          <circle
            cx={shown.centerX}
            cy={shown.baselineY}
            r="3.5"
            className="chart-median-dot"
          />
        )}

        {bars.map((bar, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`label-${bar.date}`}
              x={bar.centerX}
              y={height - 8}
              className="chart-label"
            >
              {bar.date.slice(8, 10)}.{bar.date.slice(5, 7)}
            </text>
          ) : null
        )}

        {/* Прозрачные зоны захвата поверх всего. Отдельным слоем, потому что
            столбик нулевой высоты поймать курсором невозможно в принципе */}
        {bars.map((bar) => (
          <rect
            key={`hit-${bar.date}`}
            x={bar.hitX}
            y={padding.top}
            width={bar.hitWidth}
            height={plotHeight}
            className="chart-hit"
            onMouseEnter={() => setActive(bar.index)}
            onPointerDown={() => setActive(bar.index)}
          >
            <title>
              {readoutDate(bar.date)}: {readoutValues(bar)}
            </title>
          </rect>
        ))}
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
        {gaps.length > 0 && (
          <span className="chart-legend-item">
            <span className="chart-swatch chart-swatch-gap" aria-hidden="true" />
            нет записей
          </span>
        )}
      </div>
    </div>
  )
}

/** «9 августа, вс» — с днём недели: по нему сразу видно выходные */
function readoutDate(dateStr) {
  return dateUtils.parseDate(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  })
}

/**
 * Значения дня одной строкой.
 * Формулировки те же, что в подписях графика: «записей нет» и
 * «никто не гулял» — разные факты, и смешивать их нельзя.
 */
function readoutValues(bar) {
  if (!bar.hasRecord) return 'записей нет'
  if (bar.walks === 0) return 'никто не гулял'

  const parts = [
    bar.minutes > 0 ? formatMinutes(bar.minutes) : 'время не засекали',
    plural(bar.walks, 'прогулка', 'прогулки', 'прогулок'),
  ]

  if (bar.baseline !== null) {
    const percent =
      bar.baseline > 0 && bar.minutes > 0
        ? Math.round(((bar.minutes - bar.baseline) / bar.baseline) * 100)
        : null

    parts.push(
      percent === null
        ? `обычно ${formatMinutes(bar.baseline)}`
        : `обычно ${formatMinutes(bar.baseline)} (${percent > 0 ? '+' : ''}${percent}%)`
    )
  }

  return parts.join(' · ')
}

function plural(count, one, few, many) {
  const mod100 = count % 100
  const mod10 = count % 10

  if (mod100 >= 11 && mod100 <= 14) return `${count} ${many}`
  if (mod10 === 1) return `${count} ${one}`
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${few}`
  return `${count} ${many}`
}

export default WalksChart
