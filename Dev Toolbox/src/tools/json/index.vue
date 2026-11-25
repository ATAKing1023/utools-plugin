<script setup>
import { computed, ref } from 'vue'
import StructuredToolShell from '../../components/StructuredToolShell.vue'
import {
  compressEscapedJsonText,
  compressJsonText,
  detectJsonSource,
  evaluateJsFilter,
  JSON_SOURCE_LABELS,
  jsonToTypeScriptInterface,
  jsonToXml,
  stripJsonComments
} from './actions.js'
import { buildJsonGraph } from './graph.js'
import {
  isJsonInputEmpty,
  parseJsonText
} from './logic.js'
import { buildJsonTree } from './tree.js'
import { copyValue } from '../../lib/copy.js'

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
  Object.freeze({ id: 'graph', label: '关系图' })
])

const ACTIONS = Object.freeze([
  Object.freeze({ id: 'format', label: '格式化', title: '重新格式化 JSON' }),
  Object.freeze({
    id: 'strip-comments',
    label: '去注释',
    title: '去除注释'
  }),
  Object.freeze({
    id: 'compress',
    label: '压缩复制',
    title: '压缩 JSON 并复制'
  }),
  Object.freeze({
    id: 'compress-escaped',
    label: '压缩转义复制',
    title: '压缩转义 JSON 并复制'
  }),
  Object.freeze({
    id: 'to-xml',
    label: '转 XML 复制',
    title: 'JSON 转 XML 并复制'
  }),
  Object.freeze({
    id: 'to-typescript',
    label: '转 TS 复制',
    title: 'JSON 转 TypeScript 并复制'
  })
])

const actionBarActions = computed(() =>
  ACTIONS.map((action) =>
    action.id === 'strip-comments'
      ? Object.freeze({
          ...action,
          disabled: isJsonInputEmpty(input.value)
        })
      : Object.freeze({
          ...action,
          disabled: analysis.value.state !== 'ready'
        })
  )
)

function initialInput(action) {
  if (!action || (action.type !== 'regex' && action.type !== 'over')) return ''
  return typeof action.payload === 'string' ? action.payload : ''
}

const input = ref(initialInput(props.action))
const mode = ref('graph')
const actionStatus = ref('')
const filterExpression = ref('')

const analysis = computed(() => {
  if (isJsonInputEmpty(input.value)) return { state: 'empty' }

  const detected = detectJsonSource(input.value)
  if (!detected.ok) {
    return {
      state: 'error',
      error: detected.error,
      source: detected.source
    }
  }

  let formatted
  try {
    formatted = JSON.stringify(detected.value, null, 2)
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
    value: detected.value,
    tree: buildJsonTree(detected.value),
    formatted,
    source: detected.source
  }
})

const filterResult = computed(() => {
  if (
    filterExpression.value.trim() === '' ||
    analysis.value.state !== 'ready'
  ) {
    return { ok: true, output: '' }
  }
  return evaluateJsFilter(filterExpression.value, analysis.value.value)
})

const sourceLabel = computed(
  () => JSON_SOURCE_LABELS[analysis.value.source] ?? ''
)

const graphAnalysis = computed(() => {
  if (mode.value !== 'graph' || analysis.value.state !== 'ready') {
    return null
  }
  return buildJsonGraph(analysis.value.value, input.value)
})
const treeNodes = computed(() =>
  analysis.value.state === 'ready' ? [analysis.value.tree] : []
)

function setStatus(message) {
  actionStatus.value = message
  if (message) {
    setTimeout(() => {
      if (actionStatus.value === message) actionStatus.value = ''
    }, 2500)
  }
}

function handlePaste(event) {
  const text = event.clipboardData?.getData('text')
  if (!text) return

  const detected = detectJsonSource(text)
  if (!detected.ok || detected.source === 'json') return

  event.preventDefault()
  input.value = JSON.stringify(detected.value, null, 2)
  setStatus(`已识别为${JSON_SOURCE_LABELS[detected.source]}并转为 JSON`)
}

function runAction(id) {
  if (id === 'strip-comments') {
    if (isJsonInputEmpty(input.value)) {
      setStatus('请输入 JSON 后再使用该操作')
      return
    }

    const stripped = stripJsonComments(input.value)
    const parsed = parseJsonText(stripped)
    if (!parsed.ok) {
      setStatus('去除注释后不是有效的 JSON')
      return
    }
    input.value = JSON.stringify(parsed.value, null, 2)
    setStatus('已去除注释')
    return
  }

  if (analysis.value.state !== 'ready') {
    setStatus('请输入有效的 JSON 后再使用该操作')
    return
  }

  const value = analysis.value.value

  switch (id) {
    case 'format':
      input.value = analysis.value.formatted
      setStatus('已格式化')
      return
    case 'compress':
      copyValue(compressJsonText(input.value))
      setStatus('已复制压缩 JSON')
      return
    case 'compress-escaped':
      copyValue(compressEscapedJsonText(input.value))
      setStatus('已复制压缩转义 JSON')
      return
    case 'to-xml':
      copyValue(jsonToXml(value))
      setStatus('已复制转换 XML')
      return
    case 'to-typescript':
      copyValue(jsonToTypeScriptInterface(value))
      setStatus('已复制转换 TypeScript')
      return
    default:
      return
  }
}
</script>

<template>
  <StructuredToolShell
    title="JSON 工具"
    description="可视化、格式化并复制 JSON 数据"
    tool-code="json"
    input-id="json-input"
    input-label="JSON 输入"
    placeholder='粘贴 JSON，例如 {"name":"Dev Toolbox"}'
    :input="input"
    :state="analysis.state"
    :error-message="analysis.error?.displayMessage ?? ''"
    empty-message="请输入 JSON 数据以开始解析"
    :mode="mode"
    :modes="MODES"
    :actions="actionBarActions"
    :action-status="actionStatus"
    :tree-nodes="treeNodes"
    tree-label="JSON 结构树"
    :graph="graphAnalysis"
    graph-label="JSON 关系图"
    graph-test-id="json-graph"
    graph-inspector-label="JSON 检查器"
    graph-value-label="完整 JSON 值"
    @update:input="input = $event"
    @update:mode="mode = $event"
    @run-action="runAction"
    @paste="handlePaste"
  >
    <template #extras>
      <section class="json-filter" aria-label="JSON JS 过滤">
        <label class="json-filter__label" for="json-js-filter">
          JS 过滤
        </label>
        <input
          id="json-js-filter"
          v-model="filterExpression"
          class="json-filter__input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder='.key.subkey、[0][1]、.map(x=>x.val)'
        />
        <p
          v-if="analysis.state === 'ready' && analysis.source !== 'json'"
          class="json-filter__source"
          role="status"
          aria-live="polite"
        >
          已识别为 {{ sourceLabel }}，已自动转为 JSON
        </p>
        <pre
          v-if="filterResult.output"
          class="json-filter__output"
          data-testid="json-filter-output"
        >{{ filterResult.output }}</pre>
      </section>
    </template>
  </StructuredToolShell>
</template>

<style scoped>
.json-filter {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.json-filter__label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.json-filter__input {
  width: 100%;
  min-width: 0;
  min-height: 32px;
  padding: 5px 9px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  outline: 0;
  background: var(--surface);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
}

.json-filter__input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
}

.json-filter__source {
  margin: 0;
  color: var(--text-muted);
  font-size: 11.5px;
}

.json-filter__output {
  max-height: 220px;
  margin: 0;
  overflow: auto;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
