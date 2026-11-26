<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'

const props = defineProps({
  rows: {
    type: Array,
    required: true
  }
})

const DEFAULT_ROW_HEIGHT = 31
const OVERSCAN = 8

const viewport = ref(null)
const rangeStart = ref(0)
const rangeEnd = ref(0)
const topSpacer = ref(0)
const bottomSpacer = ref(0)

let rowHeights = new Float64Array(0)
let prefixHeights = new Float64Array(1)
let measuredRows = new Uint8Array(0)
let scrollFrame = 0
let resizeObserver = null
let viewportWidth = 0

const visibleItems = computed(() => {
  const start = rangeStart.value
  return props.rows.slice(start, rangeEnd.value).map((row, offset) => ({
    row,
    index: start + offset
  }))
})

function rebuildPrefix() {
  prefixHeights[0] = 0
  for (let index = 0; index < rowHeights.length; index += 1) {
    prefixHeights[index + 1] = prefixHeights[index] + rowHeights[index]
  }
}

function resetMetrics() {
  const count = props.rows.length
  rowHeights = new Float64Array(count)
  rowHeights.fill(DEFAULT_ROW_HEIGHT)
  measuredRows = new Uint8Array(count)
  prefixHeights = new Float64Array(count + 1)
  rebuildPrefix()
}

function findRowAtOffset(offset) {
  let low = 0
  let high = props.rows.length

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (prefixHeights[middle + 1] <= offset) {
      low = middle + 1
    } else {
      high = middle
    }
  }

  return low
}

function updateRange() {
  const count = props.rows.length
  if (count === 0) {
    rangeStart.value = 0
    rangeEnd.value = 0
    topSpacer.value = 0
    bottomSpacer.value = 0
    return
  }

  const element = viewport.value
  const scrollTop = element?.scrollTop ?? 0
  const height = element?.clientHeight || DEFAULT_ROW_HEIGHT * 16
  const start = Math.max(0, findRowAtOffset(scrollTop) - OVERSCAN)
  const end = Math.min(
    count,
    findRowAtOffset(scrollTop + height) + OVERSCAN
  )

  rangeStart.value = start
  rangeEnd.value = end
  topSpacer.value = prefixHeights[start]
  bottomSpacer.value = prefixHeights[count] - prefixHeights[end]
}

async function measureRows(pass = 0) {
  await nextTick()
  const element = viewport.value
  if (!element) return

  let changed = false
  const nodes = element.querySelectorAll('[data-virtual-index]')

  for (const node of nodes) {
    const index = Number(node.getAttribute('data-virtual-index'))
    if (!Number.isInteger(index) || index < 0 || index >= rowHeights.length) {
      continue
    }

    const height = node.getBoundingClientRect().height
    if (height <= 0) continue
    if (measuredRows[index] && Math.abs(rowHeights[index] - height) < 0.5) {
      continue
    }

    rowHeights[index] = height
    measuredRows[index] = 1
    changed = true
  }

  if (!changed) return

  rebuildPrefix()
  updateRange()
  if (pass < 1) await measureRows(pass + 1)
}

function scheduleViewportUpdate() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    updateRange()
    measureRows()
  })
}

function handleResize(entries) {
  const element = viewport.value
  if (!element) return

  const width = entries[0]?.contentRect.width ?? element.clientWidth
  if (viewportWidth && Math.abs(width - viewportWidth) > 1) {
    viewportWidth = width
    resetMetrics()
    updateRange()
    element.scrollTop = 0
  } else {
    viewportWidth = width
  }

  updateRange()
  measureRows()
}

watch(
  () => props.rows,
  async () => {
    resetMetrics()
    await nextTick()
    if (viewport.value) viewport.value.scrollTop = 0
    updateRange()
    await measureRows()
  },
  { flush: 'post' }
)

onMounted(async () => {
  const element = viewport.value
  viewportWidth = element?.clientWidth ?? 0
  resetMetrics()
  await nextTick()
  updateRange()
  await measureRows()

  if (element && typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(element)
  }
})

onBeforeUnmount(() => {
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  resizeObserver?.disconnect()
})
</script>

<template>
  <div
    id="diff-table"
    class="virtual-diff-table"
    role="table"
    aria-label="逐行差异"
    :aria-rowcount="rows.length"
  >
    <div class="virtual-diff-table__header" role="rowgroup">
      <div class="virtual-diff-table__header-row" role="row">
        <span class="virtual-diff-table__marker" role="columnheader">标记</span>
        <span class="virtual-diff-table__number" role="columnheader">原文行</span>
        <span class="virtual-diff-table__number" role="columnheader">新文行</span>
        <span class="virtual-diff-table__text" role="columnheader">原文</span>
        <span class="virtual-diff-table__text" role="columnheader">新文</span>
      </div>
    </div>

    <div
      ref="viewport"
      class="virtual-diff-table__viewport"
      role="rowgroup"
      @scroll.passive="scheduleViewportUpdate"
    >
      <div
        class="virtual-diff-table__spacer"
        :style="{ height: `${topSpacer}px` }"
        aria-hidden="true"
      ></div>

      <div
        v-for="item in visibleItems"
        :key="item.index"
        class="virtual-diff-row"
        :class="`virtual-diff-row--${item.row.type}`"
        :data-row-kind="item.row.type"
        :data-marker="item.row.marker"
        :data-virtual-index="item.index"
        role="row"
        :aria-rowindex="item.index + 2"
      >
        <span class="virtual-diff-table__marker" role="cell">
          {{ item.row.marker }}
        </span>
        <span class="virtual-diff-table__number" role="cell">
          {{ item.row.oldNumber ?? '' }}
        </span>
        <span class="virtual-diff-table__number" role="cell">
          {{ item.row.newNumber ?? '' }}
        </span>

        <span
          v-if="item.row.type === 'context'"
          class="virtual-diff-table__content virtual-diff-table__content--context"
          role="cell"
        >
          <span class="virtual-diff-table__line-text">{{ item.row.oldText }}</span>
          <span v-if="item.row.hasNewline === false" class="virtual-diff-table__eof">
            无末尾换行
          </span>
        </span>

        <template v-else-if="item.row.type === 'changed'">
          <span class="virtual-diff-table__content" role="cell">
            <span class="virtual-diff-table__line-text">{{ item.row.oldText }}</span>
            <span
              v-if="item.row.oldHasNewline === false"
              class="virtual-diff-table__eof"
            >
              无末尾换行
            </span>
          </span>
          <span class="virtual-diff-table__content" role="cell">
            <span class="virtual-diff-table__line-text">{{ item.row.newText }}</span>
            <span
              v-if="item.row.newHasNewline === false"
              class="virtual-diff-table__eof"
            >
              无末尾换行
            </span>
          </span>
        </template>

        <template v-else-if="item.row.type === 'removed'">
          <span class="virtual-diff-table__content" role="cell">
            <span class="virtual-diff-table__line-text">{{ item.row.oldText }}</span>
            <span
              v-if="item.row.hasNewline === false"
              class="virtual-diff-table__eof"
            >
              无末尾换行
            </span>
          </span>
          <span class="virtual-diff-table__content" role="cell"></span>
        </template>

        <template v-else>
          <span class="virtual-diff-table__content" role="cell"></span>
          <span class="virtual-diff-table__content" role="cell">
            <span class="virtual-diff-table__line-text">{{ item.row.newText }}</span>
            <span
              v-if="item.row.hasNewline === false"
              class="virtual-diff-table__eof"
            >
              无末尾换行
            </span>
          </span>
        </template>
      </div>

      <div
        class="virtual-diff-table__spacer"
        :style="{ height: `${bottomSpacer}px` }"
        aria-hidden="true"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.virtual-diff-table {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.virtual-diff-table__header,
.virtual-diff-table__viewport {
  min-width: 620px;
}

.virtual-diff-table__header {
  border-bottom: 1px solid var(--border);
  background: var(--surface-subtle);
}

.virtual-diff-table__header-row,
.virtual-diff-row {
  display: grid;
  grid-template-columns: 42px 58px 58px minmax(220px, 1fr) minmax(220px, 1fr);
}

.virtual-diff-table__viewport {
  max-height: min(65vh, 720px);
  min-height: 280px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}

.virtual-diff-table__header-row {
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
}

.virtual-diff-table__header-row > span,
.virtual-diff-row > span {
  min-width: 0;
  padding: 6px 8px;
}

.virtual-diff-row {
  border-bottom: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
}

.virtual-diff-table__viewport > .virtual-diff-row:last-of-type {
  border-bottom: 0;
}

.virtual-diff-table__marker {
  color: var(--text-secondary);
  text-align: center;
  font-weight: 700;
}

.virtual-diff-table__number {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.virtual-diff-table__content {
  min-width: 0;
}

.virtual-diff-table__content--context {
  grid-column: 4 / 6;
}

.virtual-diff-table__line-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  tab-size: 4;
}

.virtual-diff-table__eof {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 5px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 10px;
  white-space: nowrap;
}

.virtual-diff-table__spacer {
  width: 1px;
}

.virtual-diff-row--removed {
  background: color-mix(in srgb, var(--danger-surface) 75%, transparent);
}

.virtual-diff-row--added {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.virtual-diff-row--changed {
  background: color-mix(in srgb, var(--syntax-value) 8%, transparent);
}

.virtual-diff-row--removed .virtual-diff-table__marker {
  color: var(--danger-text);
}

.virtual-diff-row--added .virtual-diff-table__marker {
  color: var(--accent);
}

.virtual-diff-row--changed .virtual-diff-table__marker {
  color: var(--syntax-value);
}

@media (max-width: 520px) {
  .virtual-diff-table__header,
  .virtual-diff-table__viewport {
    min-width: 100%;
  }

  .virtual-diff-table__header-row,
  .virtual-diff-row {
    grid-template-columns: 30px 38px 38px minmax(78px, 1fr) minmax(78px, 1fr);
  }

  .virtual-diff-table__header-row > span,
  .virtual-diff-row > span {
    padding: 5px 4px;
  }

  .virtual-diff-table__eof {
    display: block;
    width: max-content;
    margin: 3px 0 0;
  }
}
</style>
