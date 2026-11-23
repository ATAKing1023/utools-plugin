import { jsonValueToDisplay } from './logic.js'

const KIB = 1024

export const GRAPH_LIMITS = Object.freeze({
  inputBytes: 768 * KIB,
  containerDepth: 128,
  cards: 500,
  rows: 2000,
  literalCharacters: 4096
})

export const GRAPH_LAYOUT = Object.freeze({
  cardWidth: 252,
  headerHeight: 50,
  rowHeight: 30,
  bodyPadding: 8,
  emptyHeight: 38,
  primitiveHeight: 46,
  horizontalGap: 120,
  verticalGap: 18,
  canvasPadding: 30
})

export const GRAPH_MIN_SCALE = 0.25
export const GRAPH_MAX_SCALE = 2

const LIMIT_META = Object.freeze({
  inputBytes: Object.freeze({
    label: 'UTF-8 输入大小',
    display: '768 KiB'
  }),
  containerDepth: Object.freeze({
    label: '容器嵌套层级',
    display: '128 层'
  }),
  cards: Object.freeze({
    label: '卡片数量',
    display: '500 张'
  }),
  rows: Object.freeze({
    label: '总行数',
    display: '2,000 行'
  }),
  literalCharacters: Object.freeze({
    label: '单个字面量字符数',
    display: '4,096 个字符'
  })
})

function limitFailure(key, actual) {
  const meta = LIMIT_META[key]
  return {
    ok: false,
    limit: key,
    limitLabel: meta.label,
    limitDisplay: meta.display,
    limitValue: GRAPH_LIMITS[key],
    actual
  }
}

function isContainer(value) {
  return value !== null && typeof value === 'object'
}

function inputTextOf(value) {
  if (typeof value === 'undefined') return ''
  const text = JSON.stringify(value)
  return typeof text === 'string' ? text : ''
}

export function utf8ByteLength(text) {
  return new TextEncoder().encode(typeof text === 'string' ? text : '').length
}

export function semanticTypeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value
}

export function truncateGraphText(text, maximum = 96) {
  const source = typeof text === 'string' ? text : String(text ?? '')
  const limit = Math.max(1, Math.trunc(maximum))
  if (source.length <= limit) return source
  return `${source.slice(0, Math.max(0, limit - 1))}…`
}

export function graphKeyLabel(label) {
  const source = String(label ?? '')
  return source.trim().length === 0 ? JSON.stringify(source) : source
}

export function formatGraphValue(value, type = semanticTypeOf(value)) {
  if (type === 'object' || type === 'array') {
    return JSON.stringify(value, null, 2)
  }
  return jsonValueToDisplay(value)
}

function containerCount(value, type) {
  if (type === 'array') return value.length
  return Object.keys(value).length
}

function containerSummary(value, type) {
  const count = containerCount(value, type)
  return type === 'array' ? `数组 · ${count} 项` : `对象 · ${count} 个属性`
}

export function previewGraphValue(value, type = semanticTypeOf(value)) {
  if (type === 'object' || type === 'array') {
    return containerSummary(value, type)
  }
  return truncateGraphText(jsonValueToDisplay(value), 120)
}

function checkPrimitiveLiteral(value, type) {
  const literal =
    type === 'string'
      ? value
      : type === 'number' || type === 'boolean'
        ? jsonValueToDisplay(value)
        : 'null'
  if (literal.length > GRAPH_LIMITS.literalCharacters) {
    return limitFailure('literalCharacters', literal.length)
  }
  return null
}

export function inspectJsonGraphLimits(
  value,
  inputText = inputTextOf(value)
) {
  const inputBytes = utf8ByteLength(inputText)
  if (inputBytes > GRAPH_LIMITS.inputBytes) {
    return limitFailure('inputBytes', inputBytes)
  }

  const rootType = semanticTypeOf(value)
  let cardCount = 0
  let rowCount = 0

  if (!isContainer(value)) {
    cardCount = 1
    const literalFailure = checkPrimitiveLiteral(value, rootType)
    if (literalFailure) return literalFailure
    return {
      ok: true,
      inputBytes,
      cardCount,
      rowCount
    }
  }

  const stack = [{ value, depth: 1 }]

  while (stack.length > 0) {
    const current = stack.pop()
    if (current.depth > GRAPH_LIMITS.containerDepth) {
      return limitFailure('containerDepth', current.depth)
    }

    cardCount += 1
    if (cardCount > GRAPH_LIMITS.cards) {
      return limitFailure('cards', cardCount)
    }

    const isArray = Array.isArray(current.value)
    const entries = isArray
      ? current.value.map((child, index) => [index, child])
      : Object.entries(current.value)

    if (rowCount + entries.length > GRAPH_LIMITS.rows) {
      return limitFailure('rows', rowCount + entries.length)
    }
    rowCount += entries.length

    for (let index = 0; index < entries.length; index += 1) {
      const [key, child] = entries[index]
      if (!isArray) {
        const keyLength = String(key).length
        if (keyLength > GRAPH_LIMITS.literalCharacters) {
          return limitFailure('literalCharacters', keyLength)
        }
      }

      const childType = semanticTypeOf(child)
      if (!isContainer(child)) {
        const literalFailure = checkPrimitiveLiteral(child, childType)
        if (literalFailure) return literalFailure
      }
    }

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const child = entries[index][1]
      if (isContainer(child)) {
        stack.push({ value: child, depth: current.depth + 1 })
      }
    }
  }

  return {
    ok: true,
    inputBytes,
    cardCount,
    rowCount
  }
}

function cardHeight(type, rowCount) {
  const chrome =
    2 +
    GRAPH_LAYOUT.headerHeight +
    GRAPH_LAYOUT.bodyPadding * 2
  if (type === 'object' || type === 'array') {
    return chrome + (rowCount > 0 ? rowCount * GRAPH_LAYOUT.rowHeight : GRAPH_LAYOUT.emptyHeight)
  }
  return chrome + GRAPH_LAYOUT.primitiveHeight
}

function childPath(parentId, key, isArray) {
  return isArray
    ? `${parentId}[${key}]`
    : `${parentId}[${JSON.stringify(key)}]`
}

export function buildJsonGraph(value, inputText = inputTextOf(value)) {
  const limits = inspectJsonGraphLimits(value, inputText)
  if (!limits.ok) return limits

  const cards = []
  const edges = []

  function createCard(current, id, label, depth, parentId) {
    const type = semanticTypeOf(current)
    const rows = []
    const childIds = []
    const card = {
      id,
      path: id,
      label,
      parentId,
      depth,
      type,
      rows,
      childIds,
      value: current,
      preview: previewGraphValue(current, type),
      count: isContainer(current) ? containerCount(current, type) : 0,
      height: cardHeight(type, isContainer(current) ? containerCount(current, type) : 0)
    }
    cards.push(card)

    if (!isContainer(current)) return card

    const isArray = Array.isArray(current)
    const entries = isArray
      ? current.map((child, index) => [index, child])
      : Object.entries(current)

    entries.forEach(([key, child], index) => {
      const path = childPath(id, key, isArray)
      const childType = semanticTypeOf(child)
      const label = isArray ? `[${key}]` : String(key)
      const row = {
        id: `row:${path}:${index}`,
        path,
        cardId: id,
        index,
        label,
        displayLabel: isArray ? label : graphKeyLabel(label),
        type: childType,
        isContainer: isContainer(child),
        childId: isContainer(child) ? path : null,
        preview: previewGraphValue(child, childType),
        value: child
      }
      rows.push(row)

      if (row.isContainer) {
        childIds.push(path)
        edges.push({
          id: `edge:${path}`,
          from: id,
          to: path,
          label: row.displayLabel,
          path
        })
        createCard(child, path, row.displayLabel, depth + 1, id)
      }
    })

    return card
  }

  const root = createCard(value, '$', '$', 0, null)

  return {
    ok: true,
    rootId: root.id,
    cards,
    edges,
    stats: {
      inputBytes: limits.inputBytes,
      cards: limits.cardCount,
      rows: limits.rowCount
    }
  }
}

function cardIsHidden(card, cardMap, collapsedIds) {
  let parentId = card.parentId
  while (parentId) {
    if (collapsedIds.has(parentId)) return true
    parentId = cardMap.get(parentId)?.parentId ?? null
  }
  return false
}

export function projectVisibleGraph(graph, collapsedIds = new Set()) {
  const collapsed = collapsedIds instanceof Set ? collapsedIds : new Set(collapsedIds)
  const cardMap = new Map(graph.cards.map((card) => [card.id, card]))
  const cards = graph.cards.filter(
    (card) => !cardIsHidden(card, cardMap, collapsed)
  )
  const visibleIds = new Set(cards.map((card) => card.id))
  const edges = graph.edges.filter(
    (edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)
  )

  return {
    rootId: graph.rootId,
    cards,
    edges,
    stats: {
      cards: cards.length,
      rows: cards.reduce((total, card) => total + card.rows.length, 0)
    }
  }
}

export function collapseAllCardIds(graph) {
  return graph.cards
    .filter((card) => card.id !== graph.rootId)
    .map((card) => card.id)
}

export function layoutGraph(visibleGraph) {
  const cards = Array.isArray(visibleGraph?.cards) ? visibleGraph.cards : []
  const edges = Array.isArray(visibleGraph?.edges) ? visibleGraph.edges : []
  if (cards.length === 0) {
    return {
      nodes: [],
      edges: [],
      width: 0,
      height: 0,
      rootNode: null
    }
  }

  const cardMap = new Map(cards.map((card) => [card.id, card]))
  const childMap = new Map(cards.map((card) => [card.id, []]))
  for (const edge of edges) {
    if (cardMap.has(edge.from) && cardMap.has(edge.to)) {
      childMap.get(edge.from).push(edge.to)
    }
  }

  const measurements = new Map()
  const measuring = new Set()

  function measure(cardId) {
    if (measurements.has(cardId)) return measurements.get(cardId)
    if (measuring.has(cardId)) {
      return { subtreeHeight: cardMap.get(cardId)?.height ?? 0, blockHeight: 0 }
    }

    measuring.add(cardId)
    const card = cardMap.get(cardId)
    const childIds = childMap.get(cardId) || []
    const childMeasurements = childIds.map((id) => measure(id))
    const blockHeight =
      childMeasurements.reduce(
        (total, child) => total + child.subtreeHeight,
        0
      ) +
      Math.max(0, childMeasurements.length - 1) * GRAPH_LAYOUT.verticalGap
    const subtreeHeight = Math.max(card.height, blockHeight)
    const result = { subtreeHeight, blockHeight, children: childMeasurements }
    measurements.set(cardId, result)
    measuring.delete(cardId)
    return result
  }

  const nodes = []
  const nodesById = new Map()

  function place(cardId, x, top, depth) {
    const card = cardMap.get(cardId)
    const measurement = measure(cardId)
    const y = top + (measurement.subtreeHeight - card.height) / 2
    const node = {
      id: card.id,
      card,
      depth,
      x,
      y,
      width: GRAPH_LAYOUT.cardWidth,
      height: card.height
    }
    nodes.push(node)
    nodesById.set(card.id, node)

    const childIds = childMap.get(cardId) || []
    if (childIds.length === 0) return

    let childTop = top + (measurement.subtreeHeight - measurement.blockHeight) / 2
    for (const childId of childIds) {
      place(
        childId,
        x + GRAPH_LAYOUT.cardWidth + GRAPH_LAYOUT.horizontalGap,
        childTop,
        depth + 1
      )
      childTop +=
        measure(childId).subtreeHeight + GRAPH_LAYOUT.verticalGap
    }
  }

  const rootId = cardMap.has(visibleGraph.rootId)
    ? visibleGraph.rootId
    : cards[0].id
  const rootMeasurement = measure(rootId)
  place(rootId, GRAPH_LAYOUT.canvasPadding, GRAPH_LAYOUT.canvasPadding, 0)

  const positionedEdges = edges
    .filter((edge) => nodesById.has(edge.from) && nodesById.has(edge.to))
    .map((edge) => {
      const from = nodesById.get(edge.from)
      const to = nodesById.get(edge.to)
      const startX = from.x + from.width
      const startY = from.y + from.height / 2
      const endX = to.x
      const endY = to.y + to.height / 2
      const controlOffset = GRAPH_LAYOUT.horizontalGap / 2
      return {
        ...edge,
        startX,
        startY,
        endX,
        endY,
        labelX: (startX + endX) / 2,
        labelY: (startY + endY) / 2 - 8,
        displayLabel: truncateGraphText(edge.label, 18),
        pathData: `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`
      }
    })

  const contentRight = Math.max(
    ...nodes.map((node) => node.x + node.width)
  )
  const width = contentRight + GRAPH_LAYOUT.canvasPadding
  const height =
    rootMeasurement.subtreeHeight + GRAPH_LAYOUT.canvasPadding * 2

  return {
    nodes,
    edges: positionedEdges,
    width,
    height,
    rootNode: nodesById.get(rootId) || null
  }
}

export function clampGraphScale(scale) {
  if (!Number.isFinite(scale)) return 1
  return Math.min(GRAPH_MAX_SCALE, Math.max(GRAPH_MIN_SCALE, scale))
}

export function fitGraphTransform(
  graphLayout,
  viewportWidth,
  viewportHeight,
  padding = 24
) {
  const width = Math.max(1, Number(viewportWidth) || 1)
  const height = Math.max(1, Number(viewportHeight) || 1)
  if (!graphLayout || !graphLayout.width || !graphLayout.height) {
    return { scale: 1, x: 0, y: 0 }
  }

  const availableWidth = Math.max(1, width - padding * 2)
  const availableHeight = Math.max(1, height - padding * 2)
  const scale = clampGraphScale(
    Math.min(
      1,
      availableWidth / graphLayout.width,
      availableHeight / graphLayout.height
    )
  )

  return {
    scale,
    x: (width - graphLayout.width * scale) / 2,
    y: (height - graphLayout.height * scale) / 2
  }
}

export function resetGraphTransform(
  graphLayout,
  viewportWidth,
  viewportHeight
) {
  const width = Math.max(1, Number(viewportWidth) || 1)
  const height = Math.max(1, Number(viewportHeight) || 1)
  const root = graphLayout?.rootNode
  if (!root) return { scale: 1, x: 0, y: 0 }

  return {
    scale: 1,
    x: width / 2 - (root.x + root.width / 2),
    y: height / 2 - (root.y + root.height / 2)
  }
}

export function revealGraphRectTransform(
  transform,
  viewport,
  rect,
  padding = 16,
  bottomPadding = padding
) {
  const scale = Number.isFinite(transform?.scale) ? transform.scale : 1
  let x = Number.isFinite(transform?.x) ? transform.x : 0
  let y = Number.isFinite(transform?.y) ? transform.y : 0
  const left = Number(viewport?.left) || 0
  const top = Number(viewport?.top) || 0
  const width = Math.max(0, Number(viewport?.width) || 0)
  const height = Math.max(0, Number(viewport?.height) || 0)
  const right = left + width
  const bottom = top + height
  const edgePadding = Math.max(0, Number(padding) || 0)
  const lowerPadding = Math.max(0, Number(bottomPadding) || 0)

  if (rect.left < left + edgePadding) {
    x += left + edgePadding - rect.left
  } else if (rect.right > right - edgePadding) {
    x -= rect.right - (right - edgePadding)
  }

  if (rect.top < top + edgePadding) {
    y += top + edgePadding - rect.top
  } else if (rect.bottom > bottom - lowerPadding) {
    y -= rect.bottom - (bottom - lowerPadding)
  }

  return { scale, x, y }
}
