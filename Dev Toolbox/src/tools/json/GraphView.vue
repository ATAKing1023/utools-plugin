<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'
import {
  GRAPH_MAX_SCALE,
  GRAPH_MIN_SCALE,
  clampGraphScale,
  collapseAllCardIds,
  fitGraphTransform,
  formatGraphValue,
  layoutGraph,
  projectVisibleGraph,
  resetGraphTransform,
  revealGraphRectTransform,
  truncateGraphText
} from './graph.js'

const props = defineProps({
  graph: {
    type: Object,
    required: true
  },
  ariaLabel: {
    type: String,
    default: 'JSON 关系图'
  }
})

const FALLBACK_VIEWPORT_WIDTH = 720
const FALLBACK_VIEWPORT_HEIGHT = 420
const FOCUS_REVEAL_PADDING = 16
const FOCUS_REVEAL_BOTTOM_PADDING = 150

const shellElement = ref(null)
const viewportElement = ref(null)
const inspectorElement = ref(null)
const collapsedIds = ref(new Set())
const transform = ref({ scale: 1, x: 0, y: 0 })
const tooltip = ref(null)
const selected = ref(null)
const activeFocusIndex = ref(0)
const liveMessage = ref('')

let pointerState = null
let pointerDragging = false
let suppressClickUntil = 0

const projection = computed(() =>
  projectVisibleGraph(props.graph, collapsedIds.value)
)
const layout = computed(() => layoutGraph(projection.value))
const positionedNodes = computed(() => layout.value.nodes)
const positionedEdges = computed(() => layout.value.edges)
const visibleRowCount = computed(() =>
  projection.value.cards.reduce(
    (total, card) => total + card.rows.length,
    0
  )
)
const cardHasChildren = computed(() => {
  const ids = new Set()
  for (const card of props.graph.cards) {
    if (card.childIds.length > 0) ids.add(card.id)
  }
  return ids
})
const focusItems = computed(() => {
  const items = []
  const visibleIds = new Set(projection.value.cards.map((card) => card.id))
  const cardMap = new Map(projection.value.cards.map((card) => [card.id, card]))
  const visited = new Set()

  function appendCard(cardId) {
    if (visited.has(cardId) || !visibleIds.has(cardId)) return
    visited.add(cardId)
    const card = cardMap.get(cardId)
    items.push({
      kind: 'card',
      focusKey: `card:${card.id}`,
      path: card.path,
      type: card.type,
      preview: card.preview,
      value: card.value,
      cardId: card.id
    })

    for (const row of card.rows) {
      items.push({
        kind: 'row',
        focusKey: `row:${row.id}`,
        path: row.path,
        type: row.type,
        preview: row.preview,
        value: row.value,
        cardId: card.id,
        rowId: row.id
      })
    }

    for (const row of card.rows) {
      if (row.childId) appendCard(row.childId)
    }
  }

  appendCard(props.graph.rootId)
  return items.map((item, index) => ({ ...item, focusIndex: index }))
})
const focusIndexes = computed(
  () =>
    new Map(
      focusItems.value.map((item) => [item.focusKey, item.focusIndex])
    )
)
const inspectorValue = computed(() => {
  if (!selected.value) return ''
  return formatGraphValue(selected.value.value, selected.value.type)
})
const surfaceStyle = computed(() => ({
  width: `${layout.value.width}px`,
  height: `${layout.value.height}px`,
  transform: `translate(${transform.value.x}px, ${transform.value.y}px) scale(${transform.value.scale})`
}))
const zoomPercent = computed(() => Math.round(transform.value.scale * 100))
const canCollapseAll = computed(() => props.graph.edges.length > 0)
const canExpandAll = computed(() => collapsedIds.value.size > 0)

function announce(message) {
  liveMessage.value = message
}

function cardFocusIndex(cardId) {
  return focusIndexes.value.get(`card:${cardId}`) ?? 0
}

function rowFocusIndex(rowId) {
  return focusIndexes.value.get(`row:${rowId}`) ?? 0
}

function cardDescribedBy(cardId) {
  return tooltip.value?.focusKey === `card:${cardId}`
    ? 'json-graph-tooltip'
    : undefined
}

function rowDescribedBy(rowId) {
  return tooltip.value?.focusKey === `row:${rowId}`
    ? 'json-graph-tooltip'
    : undefined
}

function isCollapsed(cardId) {
  return collapsedIds.value.has(cardId)
}

function toggleCollapse(cardId) {
  if (!cardHasChildren.value.has(cardId)) return
  const next = new Set(collapsedIds.value)
  if (next.has(cardId)) next.delete(cardId)
  else next.add(cardId)
  collapsedIds.value = next
  announce(next.has(cardId) ? '卡片已收起' : '卡片已展开')
  nextTick(reconcileAfterVisibilityChange)
}

function collapseAll() {
  collapsedIds.value = new Set(collapseAllCardIds(props.graph))
  announce('已收起所有子卡片')
  nextTick(reconcileAfterVisibilityChange)
}

function expandAll() {
  collapsedIds.value = new Set()
  announce('已展开所有卡片')
}

function tooltipForItem(item) {
  return {
    focusKey: item.focusKey,
    path: item.path,
    type: item.type,
    preview: item.preview,
    cardId: item.cardId
  }
}

function itemForCard(card) {
  return focusItems.value[cardFocusIndex(card.id)]
}

function itemForRow(row) {
  return focusItems.value[rowFocusIndex(row.id)]
}

function showCardTooltip(card) {
  const item = itemForCard(card)
  if (item) tooltip.value = tooltipForItem(item)
}

function showRowTooltip(row) {
  const item = itemForRow(row)
  if (item) tooltip.value = tooltipForItem(item)
}

function clearTooltip() {
  tooltip.value = null
}

function closeOverlays() {
  tooltip.value = null
  selected.value = null
}

function openInspector(item) {
  if (!item) return
  selected.value = {
    ...tooltipForItem(item),
    value: item.value
  }
  announce(`已打开 ${item.type} 检查器`)
}

function closeInspector({ restoreFocus = false } = {}) {
  const target = selected.value
    ? {
        focusKey: selected.value.focusKey,
        cardId: selected.value.cardId
      }
    : null
  tooltip.value = null
  selected.value = null
  announce('检查器已关闭')
  if (restoreFocus) {
    nextTick(() => restoreFocusFor(target))
  }
}

function handleItemClick(event, item) {
  if (Date.now() < suppressClickUntil) {
    event.preventDefault()
    return
  }
  event.currentTarget?.focus?.({ preventScroll: true })
  openInspector(item)
}

function handleCardClick(event, card) {
  handleItemClick(event, itemForCard(card))
}

function handleRowClick(event, row) {
  handleItemClick(event, itemForRow(row))
}

function focusIndexFromEvent(event) {
  const target = event.target
  if (!(target instanceof Element)) return null
  const itemElement = target.closest('[data-graph-focus-index]')
  if (!itemElement || !shellElement.value?.contains(itemElement)) return null
  const index = Number(itemElement.dataset.graphFocusIndex)
  return Number.isInteger(index) ? index : null
}

function focusItemAt(index) {
  const item = focusItems.value[index]
  if (!item) return
  activeFocusIndex.value = index
  const element = shellElement.value?.querySelector(
    `[data-graph-focus-index="${index}"]`
  )
  element?.focus?.({ preventScroll: true })
  revealFocusedElement(element)
}

function revealFocusedElement(element) {
  const viewport = viewportElement.value
  if (
    !element ||
    !viewport ||
    viewport.clientWidth <= 0 ||
    viewport.clientHeight <= 0
  ) {
    return
  }

  const viewportRect = viewport.getBoundingClientRect()
  const itemRect = element.getBoundingClientRect()
  const next = revealGraphRectTransform(
    transform.value,
    {
      left: viewportRect.left + viewport.clientLeft,
      top: viewportRect.top + viewport.clientTop,
      width: viewport.clientWidth,
      height: viewport.clientHeight
    },
    itemRect,
    FOCUS_REVEAL_PADDING,
    FOCUS_REVEAL_BOTTOM_PADDING
  )
  if (
    next.x !== transform.value.x ||
    next.y !== transform.value.y
  ) {
    transform.value = next
  }
}

function nearestVisibleCardIndex(cardId) {
  const visibleCards = new Set(projection.value.cards.map((card) => card.id))
  const cardMap = new Map(props.graph.cards.map((card) => [card.id, card]))
  let currentId = cardId

  while (currentId) {
    if (visibleCards.has(currentId)) {
      const index = focusIndexes.value.get(`card:${currentId}`)
      if (Number.isInteger(index)) return index
    }
    currentId = cardMap.get(currentId)?.parentId ?? null
  }

  return null
}

function restoreFocusFor(target) {
  if (!target) {
    viewportElement.value?.focus()
    return
  }

  const stableIndex = focusIndexes.value.get(target.focusKey)
  if (Number.isInteger(stableIndex)) {
    focusItemAt(stableIndex)
    return
  }

  const fallbackIndex = nearestVisibleCardIndex(target.cardId)
  if (Number.isInteger(fallbackIndex)) {
    focusItemAt(fallbackIndex)
    return
  }

  viewportElement.value?.focus()
}

function handleViewportFocus(event) {
  if (event.target !== viewportElement.value) return
  focusItemAt(0)
}

function handleFocusIn(event) {
  const index = focusIndexFromEvent(event)
  if (index === null) return
  const item = focusItems.value[index]
  if (!item) return
  activeFocusIndex.value = index
  tooltip.value = tooltipForItem(item)
  announce(`${item.type} ${item.path}`)
}

function handleFocusOut(event) {
  const nextTarget = event.relatedTarget
  if (
    !nextTarget ||
    !(nextTarget instanceof Element) ||
    !nextTarget.closest('[data-graph-focus-index]')
  ) {
    clearTooltip()
  }
}

function handleShellFocusOut(event) {
  const nextTarget = event.relatedTarget
  if (
    !nextTarget ||
    !(nextTarget instanceof Node) ||
    !shellElement.value?.contains(nextTarget)
  ) {
    closeOverlays()
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    if (!tooltip.value && !selected.value) return
    event.preventDefault()
    if (selected.value) closeInspector({ restoreFocus: true })
    else closeOverlays()
    return
  }

  const target = event.target
  if (
    target instanceof Element &&
    target.closest('button, a, input, textarea, select, pre')
  ) {
    return
  }

  let index = focusIndexFromEvent(event)
  if (index === null && target === viewportElement.value) {
    index = activeFocusIndex.value
  }
  if (index === null) return

  const item = focusItems.value[index]
  if (!item) return

  if (event.key === 'Enter') {
    event.preventDefault()
    openInspector(item)
    return
  }

  if (event.key === ' ') {
    event.preventDefault()
    if (item.kind === 'card' && cardHasChildren.value.has(item.cardId)) {
      toggleCollapse(item.cardId)
    }
    return
  }

  let nextIndex = null
  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    nextIndex = Math.max(0, index - 1)
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    nextIndex = Math.min(focusItems.value.length - 1, index + 1)
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = focusItems.value.length - 1
  }

  if (nextIndex === null) return
  event.preventDefault()
  focusItemAt(nextIndex)
}

function reconcileAfterVisibilityChange() {
  const visibleKeys = new Set(
    focusItems.value.map((item) => item.focusKey)
  )
  if (tooltip.value && !visibleKeys.has(tooltip.value.focusKey)) {
    tooltip.value = null
  }
  const hiddenSelection =
    selected.value && !visibleKeys.has(selected.value.focusKey)
      ? {
          focusKey: selected.value.focusKey,
          cardId: selected.value.cardId
        }
      : null
  const selectionHadFocus =
    Boolean(hiddenSelection) &&
    Boolean(
      inspectorElement.value?.contains(document.activeElement)
    )
  if (hiddenSelection) {
    selected.value = null
    if (selectionHadFocus) {
      nextTick(() => restoreFocusFor(hiddenSelection))
    }
  }

  const active = document.activeElement
  if (
    active instanceof Element &&
    active.matches('[data-graph-focus-index]') &&
    !shellElement.value?.contains(active)
  ) {
    if (hiddenSelection) restoreFocusFor(hiddenSelection)
    else focusItemAt(0)
  }
}

function viewportSize() {
  return {
    width:
      viewportElement.value?.clientWidth || FALLBACK_VIEWPORT_WIDTH,
    height:
      viewportElement.value?.clientHeight || FALLBACK_VIEWPORT_HEIGHT
  }
}

function fitView(shouldAnnounce = true) {
  if (!layout.value.width || !layout.value.height) return
  const size = viewportSize()
  transform.value = fitGraphTransform(
    layout.value,
    size.width,
    size.height
  )
  if (shouldAnnounce) announce('已适应视图')
}

function resetView() {
  const size = viewportSize()
  transform.value = resetGraphTransform(
    layout.value,
    size.width,
    size.height
  )
  announce('视图已重置为 100%')
}

function applyScale(nextScale, anchorX, anchorY, shouldAnnounce = true) {
  const size = viewportSize()
  const scale = clampGraphScale(nextScale)
  const current = transform.value
  const x = Number.isFinite(anchorX) ? anchorX : size.width / 2
  const y = Number.isFinite(anchorY) ? anchorY : size.height / 2
  const ratio = scale / current.scale
  transform.value = {
    scale,
    x: x - (x - current.x) * ratio,
    y: y - (y - current.y) * ratio
  }
  if (shouldAnnounce) announce(`缩放 ${Math.round(scale * 100)}%`)
}

function zoomBy(factor) {
  applyScale(transform.value.scale * factor)
}

function handleWheel(event) {
  const viewport = viewportElement.value
  if (!viewport) return
  const delta =
    Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX
  if (!delta) return
  closeOverlays()
  const rect = viewport.getBoundingClientRect()
  applyScale(
    transform.value.scale * Math.exp(-delta * 0.0015),
    event.clientX - rect.left,
    event.clientY - rect.top
  )
}

function handlePointerDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const target = event.target
  if (
    target instanceof Element &&
    target.closest('button, a, input, textarea, select, pre')
  ) {
    return
  }

  pointerState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startTransformX: transform.value.x,
    startTransformY: transform.value.y
  }
  pointerDragging = false
}

function handlePointerMove(event) {
  if (!pointerState || pointerState.pointerId !== event.pointerId) return
  const deltaX = event.clientX - pointerState.startX
  const deltaY = event.clientY - pointerState.startY
  if (!pointerDragging && Math.hypot(deltaX, deltaY) < 5) return

  if (!pointerDragging) {
    pointerDragging = true
    closeOverlays()
    try {
      viewportElement.value?.setPointerCapture(event.pointerId)
    } catch {
      pointerDragging = true
    }
  }

  transform.value = {
    ...transform.value,
    x: pointerState.startTransformX + deltaX,
    y: pointerState.startTransformY + deltaY
  }
  if (event.cancelable) event.preventDefault()
}

function finishPointer(event) {
  if (!pointerState || pointerState.pointerId !== event.pointerId) return
  if (pointerDragging) suppressClickUntil = Date.now() + 250
  try {
    viewportElement.value?.releasePointerCapture(event.pointerId)
  } catch {
    pointerState = null
  }
  pointerState = null
  pointerDragging = false
}

function handleViewportPointerLeave() {
  clearTooltip()
  if (pointerState && !pointerDragging) pointerState = null
}

function handleWindowPointerEnd(event) {
  if (!pointerState || pointerState.pointerId !== event.pointerId) return
  finishPointer(event)
}

watch(
  () => props.graph,
  async (nextGraph, previousGraph) => {
    if (nextGraph === previousGraph) return
    collapsedIds.value = new Set()
    tooltip.value = null
    selected.value = null
    activeFocusIndex.value = 0
    await nextTick()
    fitView(false)
  }
)

onMounted(async () => {
  window.addEventListener('pointerup', handleWindowPointerEnd)
  window.addEventListener('pointercancel', handleWindowPointerEnd)
  await nextTick()
  fitView(false)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerup', handleWindowPointerEnd)
  window.removeEventListener('pointercancel', handleWindowPointerEnd)
})
</script>

<template>
  <section
    ref="shellElement"
    class="json-graph"
    data-testid="json-graph"
    :aria-label="ariaLabel"
    @keydown="handleKeydown"
    @focusout="handleShellFocusOut"
    @pointerleave="closeOverlays"
  >
    <div class="json-graph__toolbar" role="toolbar" aria-label="关系图控制">
      <button type="button" @click="fitView()">适应视图</button>
      <button type="button" @click="resetView">重置视图</button>
      <button
        type="button"
        aria-label="缩小关系图"
        :disabled="transform.scale <= GRAPH_MIN_SCALE"
        @click="zoomBy(1 / 1.2)"
      >
        缩小
      </button>
      <button
        type="button"
        aria-label="放大关系图"
        :disabled="transform.scale >= GRAPH_MAX_SCALE"
        @click="zoomBy(1.2)"
      >
        放大
      </button>
      <button
        type="button"
        :disabled="!canCollapseAll"
        @click="collapseAll"
      >
        全部收起
      </button>
      <button
        type="button"
        :disabled="!canExpandAll"
        @click="expandAll"
      >
        全部展开
      </button>
      <span class="json-graph__stats" aria-hidden="true">
        {{ projection.cards.length }} 张卡片 · {{ visibleRowCount }} 行 ·
        {{ zoomPercent }}%
      </span>
    </div>

    <p id="json-graph-hint" class="json-graph__hint">
      拖拽平移，滚轮缩放；方向键浏览，Enter 检查，Space 收起卡片。
    </p>

    <div
      class="json-graph__workspace"
      :class="{ 'has-inspector': selected }"
    >
      <div
        ref="viewportElement"
        class="json-graph__viewport"
        role="group"
        :aria-label="ariaLabel"
        aria-describedby="json-graph-hint"
        tabindex="0"
        data-testid="json-graph-viewport"
        @focus="handleViewportFocus"
        @focusin="handleFocusIn"
        @focusout="handleFocusOut"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="finishPointer"
        @pointercancel="finishPointer"
        @lostpointercapture="finishPointer"
        @pointerleave="handleViewportPointerLeave"
        @wheel.prevent="handleWheel"
      >
        <div
          class="json-graph__surface"
          data-testid="json-graph-surface"
          :style="surfaceStyle"
          :data-scale="transform.scale"
          :data-x="transform.x"
          :data-y="transform.y"
        >
          <svg
            class="json-graph__edges"
            :width="layout.width"
            :height="layout.height"
            :viewBox="`0 0 ${layout.width} ${layout.height}`"
            aria-hidden="true"
            focusable="false"
          >
            <g
              v-for="edge in positionedEdges"
              :key="edge.id"
              class="json-graph__edge"
            >
              <path :d="edge.pathData" />
              <text
                :x="edge.labelX"
                :y="edge.labelY"
                text-anchor="middle"
              >
                {{ edge.displayLabel }}
              </text>
            </g>
          </svg>

          <article
            v-for="node in positionedNodes"
            :key="node.id"
            class="graph-card"
            :class="{
              'is-collapsed': isCollapsed(node.id),
              'is-primitive': node.card.type !== 'object' && node.card.type !== 'array'
            }"
            :style="{
              left: `${node.x}px`,
              top: `${node.y}px`,
              width: `${node.width}px`,
              height: `${node.height}px`
            }"
            :data-graph-card-id="node.id"
            :data-graph-path="node.card.path"
            :data-card-type="node.card.type"
            :data-graph-focus-index="cardFocusIndex(node.id)"
            tabindex="-1"
            role="group"
            :aria-label="`${node.card.type} 卡片 ${node.card.path}`"
            :aria-describedby="cardDescribedBy(node.id)"
            @mouseenter="showCardTooltip(node.card)"
            @mouseleave="clearTooltip"
            @click="handleCardClick($event, node.card)"
          >
            <header class="graph-card__header">
              <div class="graph-card__heading">
                <span
                  class="graph-card__path"
                  :title="node.card.path"
                >
                  {{ truncateGraphText(node.card.path, 36) }}
                </span>
                <span class="graph-card__meta">
                  {{ node.card.type }}
                  <template v-if="node.card.type === 'object'">
                    · {{ node.card.count }} 个属性
                  </template>
                  <template v-else-if="node.card.type === 'array'">
                    · {{ node.card.count }} 项
                  </template>
                </span>
              </div>
              <button
                v-if="node.card.type === 'object' || node.card.type === 'array'"
                type="button"
                class="graph-card__collapse"
                tabindex="-1"
                :disabled="!cardHasChildren.has(node.id)"
                :aria-label="`${isCollapsed(node.id) ? '展开' : '收起'}卡片 ${node.card.path}`"
                :aria-expanded="
                  cardHasChildren.has(node.id)
                    ? String(!isCollapsed(node.id))
                    : undefined
                "
                @click.stop="toggleCollapse(node.id)"
              >
                {{ isCollapsed(node.id) ? '+' : '−' }}
              </button>
            </header>

            <div
              v-if="node.card.type !== 'object' && node.card.type !== 'array'"
              class="graph-card__primitive"
            >
              {{ truncateGraphText(node.card.preview, 88) }}
            </div>

            <div
              v-else-if="node.card.rows.length > 0"
              class="graph-card__body"
            >
              <div
                v-for="row in node.card.rows"
                :key="row.id"
                class="graph-row"
                :class="{ 'is-container-row': row.isContainer }"
                :data-graph-path="row.path"
                :data-row-type="row.type"
                :data-graph-focus-index="rowFocusIndex(row.id)"
                tabindex="-1"
                role="button"
                :aria-label="`${row.type} ${row.path}`"
                :aria-describedby="rowDescribedBy(row.id)"
                @mouseenter="showRowTooltip(row)"
                @mouseleave="clearTooltip"
                @click.stop="handleRowClick($event, row)"
              >
                <span class="graph-row__label">
                  {{ row.displayLabel }}
                </span>
                <span class="graph-row__type">{{ row.type }}</span>
                <span class="graph-row__preview">
                  {{ truncateGraphText(row.preview, 48) }}
                </span>
              </div>
            </div>

            <div v-else class="graph-card__empty">
              {{ node.card.type === 'object' ? '空对象' : '空数组' }}
            </div>
          </article>
        </div>

        <div
          v-if="tooltip"
          class="graph-tooltip"
          id="json-graph-tooltip"
          role="tooltip"
          data-testid="json-graph-tooltip"
        >
          <div class="graph-tooltip__meta">
            <span class="graph-tooltip__type">{{ tooltip.type }}</span>
            <code class="graph-tooltip__path">{{ tooltip.path }}</code>
          </div>
          <p class="graph-tooltip__preview">{{ tooltip.preview }}</p>
        </div>
      </div>

      <aside
        v-if="selected"
        ref="inspectorElement"
        class="json-graph__inspector"
        aria-label="JSON 检查器"
        data-testid="json-graph-inspector"
      >
        <div class="json-graph__inspector-header">
          <div>
            <span class="json-graph__inspector-label">检查器</span>
            <h2 class="json-graph__inspector-type">
              {{ selected.type }}
            </h2>
          </div>
          <button
            type="button"
            class="json-graph__inspector-close"
            aria-label="关闭检查器"
            @click="closeInspector({ restoreFocus: true })"
          >
            关闭
          </button>
        </div>
        <p class="json-graph__inspector-path">{{ selected.path }}</p>
        <pre
          class="json-graph__inspector-value"
          tabindex="0"
          aria-label="完整 JSON 值"
        >{{ inspectorValue }}</pre>
      </aside>
    </div>

    <p
      class="json-graph__live"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ liveMessage }}
    </p>
  </section>
</template>

<style scoped>
.json-graph {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.json-graph__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.json-graph__toolbar button,
.json-graph__inspector-close {
  min-height: 32px;
  padding: 5px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.35;
  cursor: pointer;
}

.json-graph__toolbar button:hover:not(:disabled),
.json-graph__inspector-close:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.json-graph__toolbar button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.json-graph__toolbar button:focus-visible,
.json-graph__inspector-close:focus-visible,
.json-graph__inspector-value:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.json-graph__stats {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.json-graph__hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.json-graph__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
}

.json-graph__workspace.has-inspector {
  grid-template-columns: minmax(0, 1fr) minmax(230px, 290px);
}

.json-graph__viewport {
  position: relative;
  height: clamp(380px, 54vh, 620px);
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  outline: 0;
  background:
    linear-gradient(var(--surface-subtle), var(--surface-subtle)),
    var(--surface);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.json-graph__viewport:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

.json-graph__viewport:active {
  cursor: grabbing;
}

.json-graph__surface {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.json-graph__edges {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
}

.json-graph__edge path {
  fill: none;
  stroke: var(--border-strong);
  stroke-width: 1.5;
}

.json-graph__edge text {
  fill: var(--text-secondary);
  stroke: var(--surface-subtle);
  stroke-width: 4px;
  paint-order: stroke;
  font-family: var(--font-mono);
  font-size: 11px;
}

.graph-card {
  position: absolute;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--surface-raised);
  box-shadow: 0 2px 8px rgb(0 0 0 / 7%);
  cursor: pointer;
}

.graph-card:hover {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border-strong));
}

.graph-card:focus-visible,
.graph-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.graph-card.is-collapsed {
  border-style: dashed;
}

.graph-card__header {
  flex: 0 0 50px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  height: 50px;
  padding: 5px 8px 5px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.graph-card__heading {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.graph-card__path {
  overflow: hidden;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.graph-card__meta {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.graph-card__collapse {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.graph-card__collapse:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.graph-card__collapse:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.graph-card__collapse:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.graph-card__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding: 8px;
}

.graph-row {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  min-width: 0;
  padding: 0 6px;
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
}

.graph-row:hover {
  background: var(--surface-hover);
}

.graph-row.is-container-row {
  background-image: linear-gradient(
    90deg,
    color-mix(in srgb, var(--accent) 9%, transparent),
    transparent 60%
  );
}

.graph-row__label {
  flex: 0 1 32%;
  overflow: hidden;
  color: var(--text-primary);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.graph-row__type {
  flex: 0 0 auto;
  padding: 1px 4px;
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 9px;
  line-height: 1.35;
}

.graph-row__preview {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--syntax-value);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.graph-card__empty,
.graph-card__primitive {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  min-height: 0;
  margin: 8px;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
}

.graph-card__primitive {
  color: var(--syntax-value);
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
}

.graph-tooltip {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 6;
  width: max-content;
  max-width: min(560px, calc(100% - 24px));
  max-height: 132px;
  overflow: auto;
  padding: 9px 11px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface-raised);
  box-shadow: 0 6px 22px rgb(0 0 0 / 16%);
  pointer-events: none;
}

.graph-tooltip__meta {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  min-width: 0;
}

.graph-tooltip__type {
  flex: 0 0 auto;
  padding: 1px 5px;
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--text-secondary);
  font-size: 10px;
}

.graph-tooltip__path {
  min-width: 0;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.graph-tooltip__preview {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.json-graph__inspector {
  min-width: 0;
  max-height: clamp(380px, 54vh, 620px);
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}

.json-graph__inspector-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.json-graph__inspector-label {
  color: var(--text-muted);
  font-size: 11px;
}

.json-graph__inspector-type {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.35;
}

.json-graph__inspector-path {
  margin: 9px 0;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.json-graph__inspector-value {
  min-height: 120px;
  max-height: 360px;
  margin: 0;
  overflow: auto;
  padding: 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-subtle);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.json-graph__live {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 760px) {
  .json-graph__workspace.has-inspector {
    grid-template-columns: minmax(0, 1fr);
  }

  .json-graph__inspector {
    max-height: none;
  }
}

@media (max-width: 520px) {
  .json-graph__toolbar {
    gap: 5px;
  }

  .json-graph__toolbar button {
    flex: 1 1 auto;
    min-height: 34px;
    padding-inline: 7px;
  }

  .json-graph__stats {
    flex-basis: 100%;
    margin-left: 0;
  }

  .json-graph__viewport {
    height: 380px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .json-graph__surface,
  .graph-card,
  .graph-row,
  .json-graph__toolbar button,
  .graph-card__collapse {
    transition: none;
  }
}
</style>
