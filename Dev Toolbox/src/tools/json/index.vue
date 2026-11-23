<script setup>
import { computed, ref } from 'vue'
import EmptyState from '../../components/EmptyState.vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import ModeTabs from '../../components/ModeTabs.vue'
import OutputList from '../../components/OutputList.vue'
import ToolFrame from '../../components/ToolFrame.vue'
import TreeView from '../../components/TreeView.vue'
import GraphView from './GraphView.vue'
import { buildJsonGraph } from './graph.js'
import {
  isJsonInputEmpty,
  parseJsonText
} from './logic.js'
import { buildJsonTree } from './tree.js'

const props = defineProps({
  action: {
    type: Object,
    required: true
  },
  enterAction: {
    type: Object,
    default: null
  }
})

const MODES = Object.freeze([
  Object.freeze({ id: 'tree', label: '结构树' }),
  Object.freeze({ id: 'graph', label: '关系图' }),
  Object.freeze({ id: 'format', label: '格式化' })
])

function initialInput(action) {
  if (!action || (action.type !== 'regex' && action.type !== 'over')) return ''
  return typeof action.payload === 'string' ? action.payload : ''
}

const input = ref(initialInput(props.action))
const mode = ref('graph')
const actionCode = computed(() =>
  typeof props.action?.code === 'string' ? props.action.code : ''
)

const analysis = computed(() => {
  if (isJsonInputEmpty(input.value)) return { state: 'empty' }

  const parsed = parseJsonText(input.value)
  if (!parsed.ok) return { state: 'error', error: parsed.error }

  let formatted
  try {
    formatted = JSON.stringify(parsed.value, null, 2)
  } catch (error) {
    const message =
      error && typeof error.message === 'string'
        ? error.message
        : 'JSON 格式化失败'
    return {
      state: 'error',
      error: {
        message,
        displayMessage: message,
        position: null,
        line: null,
        column: null
      }
    }
  }

  return {
    state: 'ready',
    value: parsed.value,
    tree: buildJsonTree(parsed.value),
    formatted
  }
})

const graphAnalysis = computed(() => {
  if (mode.value !== 'graph' || analysis.value.state !== 'ready') {
    return null
  }
  return buildJsonGraph(analysis.value.value, input.value)
})
const treeNodes = computed(() =>
  analysis.value.state === 'ready' ? [analysis.value.tree] : []
)
const outputRows = computed(() =>
  analysis.value.state === 'ready'
    ? [{ label: '格式化结果', value: analysis.value.formatted }]
    : []
)
</script>

<template>
  <ToolFrame title="JSON 工具" description="可视化、格式化并复制 JSON 数据">
    <div class="json-tool" :data-action-code="actionCode" :data-mode="mode">
      <label class="json-field" for="json-input">
        <span class="json-field__label">JSON 输入</span>
        <textarea
          id="json-input"
          v-model="input"
          class="json-field__input"
          rows="8"
          spellcheck="false"
          placeholder='粘贴 JSON，例如 {"name":"Dev Toolbox"}'
        />
      </label>

      <ModeTabs v-model="mode" :modes="MODES" />

      <EmptyState
        v-if="analysis.state === 'empty'"
        message="请输入 JSON 数据以开始解析"
      />

      <ErrorNotice
        v-else-if="analysis.state === 'error'"
        :message="analysis.error.displayMessage"
      />

      <template v-else>
        <TreeView
          v-if="mode === 'tree'"
          :nodes="treeNodes"
          aria-label="JSON 结构树"
          data-testid="json-tree"
        />
        <GraphView
          v-else-if="mode === 'graph' && graphAnalysis?.ok"
          :graph="graphAnalysis"
          aria-label="JSON 关系图"
        />
        <section
          v-else-if="mode === 'graph'"
          class="json-graph-limited"
          data-state="limited"
          data-testid="json-graph-limited"
        >
          <strong class="json-graph-limited__title">
            关系图已达到限制
          </strong>
          <p
            class="json-graph-limited__message"
            role="status"
            aria-live="polite"
          >
            当前 JSON 超出{{ graphAnalysis.limitLabel }}上限
            {{ graphAnalysis.limitDisplay }}，关系图未生成。
          </p>
          <button
            type="button"
            class="json-graph-limited__action"
            @click="mode = 'tree'"
          >
            切换到结构树
          </button>
        </section>
        <OutputList v-else :rows="outputRows" />
      </template>
    </div>
  </ToolFrame>
</template>

<style scoped>
.json-tool,
.json-field {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.json-field {
  gap: 6px;
}

.json-field__label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.json-field__input {
  width: 100%;
  min-width: 0;
  min-height: 172px;
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  outline: 0;
  background: var(--surface);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}

.json-field__input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
}

.json-graph-limited {
  display: grid;
  justify-items: start;
  gap: 8px;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--danger-border);
  border-radius: 9px;
  background: var(--danger-surface);
  color: var(--danger-text);
}

.json-graph-limited__title {
  font-size: 14px;
}

.json-graph-limited__message {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.json-graph-limited__action {
  padding: 6px 10px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.json-graph-limited__action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (max-width: 520px) {
  .json-field__input {
    min-height: 148px;
  }
}
</style>
