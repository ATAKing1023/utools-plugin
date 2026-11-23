<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  node: {
    type: Object,
    required: true
  },
  depth: {
    type: Number,
    default: 0
  }
})

const containerKinds = new Set(['object', 'array', 'element'])
const kindLabels = {
  object: '对象',
  array: '数组',
  element: '元素',
  attribute: '属性',
  text: '文本',
  comment: '注释',
  cdata: 'CDATA'
}

const children = computed(() =>
  Array.isArray(props.node.children) ? props.node.children : []
)
const hasChildren = computed(
  () => containerKinds.has(props.node.kind) && children.value.length > 0
)
const open = ref(props.node.defaultOpen === true)
const kindLabel = computed(() => kindLabels[props.node.kind] || props.node.kind)
const valueText = computed(() =>
  props.node.value === undefined || props.node.value === null
    ? ''
    : String(props.node.value)
)

watch(
  () => props.node,
  (node) => {
    open.value = node?.defaultOpen === true
  }
)

function toggle() {
  if (hasChildren.value) open.value = !open.value
}

function handleKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  event.stopPropagation()
  toggle()
}
</script>

<template>
  <div
    class="tree-node"
    :data-kind="node.kind"
    role="treeitem"
    :aria-level="depth + 1"
    :aria-expanded="hasChildren ? open : undefined"
  >
    <div class="tree-node__row" :style="{ paddingLeft: `${depth * 14}px` }">
      <button
        v-if="hasChildren"
        type="button"
        class="tree-node__toggle"
        :aria-label="`${open ? '收起' : '展开'} ${node.label}`"
        @click="toggle"
        @keydown="handleKeydown"
      >
        <span class="tree-node__chevron" :class="{ 'is-open': open }" aria-hidden="true">
          ›
        </span>
        <span class="tree-node__label">{{ node.label }}</span>
        <span class="tree-node__kind">{{ kindLabel }} · {{ children.length }}</span>
      </button>
      <div v-else class="tree-node__leaf">
        <span class="tree-node__spacer" aria-hidden="true"></span>
        <span class="tree-node__label">{{ node.label }}</span>
        <span class="tree-node__kind">{{ kindLabel }}</span>
        <span v-if="valueText" class="tree-node__value">{{ valueText }}</span>
      </div>
    </div>
    <div v-if="hasChildren && open" class="tree-node__children" role="group">
      <TreeNode
        v-for="(child, index) in children"
        :key="child?.id ?? index"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-node {
  min-width: 0;
}

.tree-node__row {
  min-width: max-content;
}

.tree-node__toggle,
.tree-node__leaf {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  padding: 3px 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  font: inherit;
}

.tree-node__toggle {
  cursor: pointer;
}

.tree-node__toggle:hover,
.tree-node__toggle:focus-visible {
  background: var(--surface-hover);
}

.tree-node__toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}

.tree-node__chevron {
  flex: 0 0 12px;
  color: var(--text-muted);
  text-align: center;
  transition: transform 120ms ease;
}

.tree-node__chevron.is-open {
  transform: rotate(90deg);
}

.tree-node__spacer {
  flex: 0 0 12px;
}

.tree-node__label {
  color: var(--text-primary);
}

.tree-node__kind {
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 11px;
}

.tree-node__value {
  color: var(--syntax-value);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tree-node__children {
  min-width: 0;
}
</style>
