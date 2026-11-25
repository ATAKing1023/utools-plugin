import { GRAPH_LAYOUT, truncateGraphText } from './graph.js'

const CARD_HEADER_HEIGHT = GRAPH_LAYOUT.headerHeight
const ROW_HEIGHT = GRAPH_LAYOUT.rowHeight
const BODY_PADDING = GRAPH_LAYOUT.bodyPadding

const THEME = Object.freeze({
  background: '#ffffff',
  surface: '#f8f8f9',
  surfaceRaised: '#ffffff',
  border: '#e8e8eb',
  borderStrong: '#d8d8dd',
  textPrimary: '#24252a',
  textSecondary: '#4c4e55',
  textMuted: '#888a91',
  value: '#a24800'
})

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function textNode(x, y, content, options = {}) {
  const {
    fill = THEME.textPrimary,
    size = 12,
    weight = 400,
    anchor = 'start',
    family = 'sans-serif',
    halo = null
  } = options

  const haloMarkup = halo
    ? ` stroke="${halo}" stroke-width="4" paint-order="stroke" stroke-linejoin="round"`
    : ''

  return (
    `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" ` +
    `font-size="${size}" font-weight="${weight}" text-anchor="${anchor}"` +
    `${haloMarkup}>${escapeXml(content)}</text>`
  )
}

function cardSvg(card, typeLabel, countLabel, rowTypeLabelOf) {
  const parts = []
  const width = card.width
  const height = card.height

  parts.push(
    `<rect x="${card.x}" y="${card.y}" width="${width}" height="${height}" ` +
      `rx="9" fill="${THEME.surfaceRaised}" stroke="${THEME.borderStrong}" ` +
      `stroke-width="1"/>`
  )
  parts.push(
    `<rect x="${card.x}" y="${card.y}" width="${width}" height="${CARD_HEADER_HEIGHT}" ` +
      `rx="9" fill="${THEME.surface}" stroke="${THEME.border}" stroke-width="1"/>`
  )
  parts.push(
    `<line x1="${card.x}" y1="${card.y + CARD_HEADER_HEIGHT}" ` +
      `x2="${card.x + width}" y2="${card.y + CARD_HEADER_HEIGHT}" ` +
      `stroke="${THEME.border}" stroke-width="1"/>`
  )

  const headerY = card.y + 21
  parts.push(
    textNode(card.x + 10, headerY, truncateGraphText(card.path, 36), {
      fill: THEME.textPrimary,
      size: 12,
      weight: 650,
      family: 'monospace'
    })
  )

  const metaParts = [typeLabel]
  if (card.type === 'object') metaParts.push(`· ${card.count} ${countLabel}`)
  if (card.type === 'array') metaParts.push(`· ${card.count} ${countLabel}`)
  parts.push(
    textNode(card.x + 10, headerY + 15, metaParts.join(' '), {
      fill: THEME.textMuted,
      size: 10
    })
  )

  if (card.rows.length === 0) {
    parts.push(
      textNode(card.x + 10, card.y + CARD_HEADER_HEIGHT + 22, '空元素', {
        fill: THEME.textMuted,
        size: 11
      })
    )
    return parts.join('')
  }

  card.rows.forEach((row, index) => {
    const rowY = card.y + CARD_HEADER_HEIGHT + BODY_PADDING + index * ROW_HEIGHT
    const baseline = rowY + ROW_HEIGHT / 2 + 4

    parts.push(
      textNode(card.x + 10, baseline, truncateGraphText(row.label, 24), {
        fill: THEME.textPrimary,
        size: 12,
        weight: 600
      })
    )

    const typeX = card.x + width * 0.42
    parts.push(
      `<rect x="${typeX}" y="${rowY + 6}" width="52" height="16" rx="3" ` +
        `fill="none" stroke="${THEME.borderStrong}" stroke-width="1"/>`
    )
    parts.push(
      textNode(typeX + 26, rowY + 18, rowTypeLabelOf(row.type), {
        fill: THEME.textMuted,
        size: 10,
        anchor: 'middle'
      })
    )

    parts.push(
      textNode(typeX + 60, baseline, truncateGraphText(row.preview, 30), {
        fill: THEME.value,
        size: 11,
        family: 'monospace'
      })
    )
  })

  return parts.join('')
}

export function buildGraphSvg({
  cards,
  edges,
  width,
  height,
  typeLabels = {},
  countLabels = {},
  emptyLabels = {}
}) {
  const labelOf = (type) => typeLabels[type] || type
  const countOf = (type) => countLabels[type] || ''

  const parts = []

  parts.push(
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${THEME.background}"/>`
  )

  for (const edge of edges) {
    parts.push(
      `<path d="${edge.pathData}" fill="none" stroke="${THEME.borderStrong}" ` +
        `stroke-width="1.5"/>`
    )
    parts.push(
      textNode(edge.labelX, edge.labelY, edge.displayLabel, {
        fill: THEME.textSecondary,
        size: 11,
        anchor: 'middle',
        family: 'monospace',
        halo: THEME.background
      })
    )
  }

  for (const card of cards) {
    parts.push(
      cardSvg(
        {
          ...card,
          type: card.card.type,
          path: card.card.path,
          count: card.card.count,
          rows: card.card.rows.map((row) => ({
            label: row.displayLabel,
            preview: row.preview,
            type: row.type
          }))
        },
        labelOf(card.card.type),
        countOf(card.card.type),
        labelOf
      )
    )
  }

  const body = parts.join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${body}</svg>`
  )
}

export async function renderGraphSvgToPng(svgMarkup, width, height) {
  const blob = new Blob([svgMarkup], {
    type: 'image/svg+xml;charset=utf-8'
  })
  const url = URL.createObjectURL(blob)

  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('SVG 光栅化失败'))
      element.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(width))
    canvas.height = Math.max(1, Math.ceil(height))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建画布上下文')

    context.fillStyle = THEME.background
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function buildGraphPng({
  cards,
  edges,
  width,
  height,
  typeLabels,
  countLabels,
  emptyLabels
}) {
  const svgMarkup = buildGraphSvg({
    cards,
    edges,
    width,
    height,
    typeLabels,
    countLabels,
    emptyLabels
  })

  return renderGraphSvgToPng(svgMarkup, width, height)
}
