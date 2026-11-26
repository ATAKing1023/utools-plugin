<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import CodeEditor from '../../components/CodeEditor.vue'
import ExpressionInput from '../../components/ExpressionInput.vue'
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
import { isTextEntryTarget } from '../../lib/keyboard.js'

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
  Object.freeze({
    id: 'format',
    label: '格式化',
    title: '重新格式化「Alt + F」',
    icon: 'data-object'
  }),
  Object.freeze({
    id: 'fold-all',
    label: '折叠全部',
    title: '折叠全部「Alt + >」',
    icon: 'unfold-less'
  }),
  Object.freeze({
    id: 'unfold-all',
    label: '展开全部',
    title: '展开全部「Alt + Shift + >」',
    icon: 'unfold-more'
  }),
  Object.freeze({
    id: 'to-xml',
    label: '转 XML 复制',
    title: 'JSON 转 XML 并复制',
    icon: 'code',
    dividerBefore: true
  }),
  Object.freeze({
    id: 'to-typescript',
    label: '转 TS 复制',
    title: 'JSON 转 TypeScript 并复制',
    icon: 'description'
  }),
  Object.freeze({
    id: 'copy-json',
    label: '复制 JSON',
    title: '复制格式化 JSON',
    icon: 'content-copy'
  }),
  Object.freeze({
    id: 'strip-comments',
    label: '去注释',
    title: '去除注释',
    icon: 'comments-disabled',
    dividerBefore: true
  }),
  Object.freeze({
    id: 'compress',
    label: '压缩复制',
    title: '压缩 JSON 并复制「Alt + C」',
    icon: 'compress'
  }),
  Object.freeze({
    id: 'compress-escaped',
    label: '压缩转义复制',
    title: '压缩转义 JSON 并复制「Alt + \\」',
    icon: 'format-quote'
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
const shellRef = ref(null)
const outputOpen = ref(false)

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

const filterOutput = computed(() => filterResult.value.output)
const locateSegments = computed(() => {
  if (analysis.value.state !== 'ready' || analysis.value.source !== 'json') {
    return null
  }
  return parseLocatePath(filterExpression.value)
})

function parseLocatePath(expression) {
  const text = typeof expression === 'string' ? expression.trim() : ''
  if (!text) return null

  const segments = []
  let index = 0
  while (index < text.length) {
    const rest = text.slice(index)
    const dotKey = /^\.([A-Za-z_$][\w$]*)/.exec(rest)
    if (dotKey) {
      segments.push(dotKey[1])
      index += dotKey[0].length
      continue
    }

    const arrayIndex = /^\[(\d+)\]/.exec(rest)
    if (arrayIndex) {
      segments.push(Number(arrayIndex[1]))
      index += arrayIndex[0].length
      continue
    }

    const quotedKey = /^\[("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\]/.exec(rest)
    if (quotedKey) {
      const raw = quotedKey[1]
      try {
        segments.push(raw.startsWith('"') ? JSON.parse(raw) : raw.slice(1, -1))
      } catch {
        return null
      }
      index += quotedKey[0].length
      continue
    }

    return null
  }

  return segments.length > 0 ? segments : null
}

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

function onFilterInput(value) {
  filterExpression.value = value
  outputOpen.value = value.trim() !== ''
}

function closeOutput() {
  outputOpen.value = false
}

function locateSelection() {
  const segments = locateSegments.value
  if (!segments) {
    setStatus('请输入可定位的路径表达式，例如 .a.b 或 [0][1]')
    return
  }

  const located = shellRef.value?.selectPath(segments) ?? false
  setStatus(located ? '已定位到表达式对应元素' : '未在源码中找到该路径')
}

function copyResult(text, successMessage) {
  const copied = copyValue(text, { hideWindow: false })
  setStatus(copied ? successMessage : '复制失败')
}

function handleShortcut(event) {
  if (
    !event.altKey ||
    event.isComposing ||
    isTextEntryTarget(event.target)
  ) {
    return
  }

  let actionId = ''
  if (event.code === 'KeyF') actionId = 'format'
  else if (event.code === 'KeyC') actionId = 'compress'
  else if (event.code === 'Backslash') actionId = 'compress-escaped'
  else if (event.code === 'Period') {
    actionId = event.shiftKey ? 'unfold-all' : 'fold-all'
  }

  if (!actionId) return
  event.preventDefault()
  event.stopPropagation()
  runAction(actionId)
}

onMounted(() => {
  window.addEventListener('keydown', handleShortcut, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut, true)
})

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
    case 'fold-all': {
      const folded = shellRef.value?.foldAll() ?? false
      setStatus(folded ? '已折叠全部节点' : '没有可折叠的节点')
      return
    }
    case 'unfold-all': {
      const unfolded = shellRef.value?.unfoldAll() ?? false
      setStatus(unfolded ? '已展开全部节点' : '没有可展开的节点')
      return
    }
    case 'compress':
      copyResult(compressJsonText(input.value), '已复制压缩 JSON')
      return
    case 'compress-escaped':
      copyResult(compressEscapedJsonText(input.value), '已复制压缩转义 JSON')
      return
    case 'to-xml':
      copyResult(jsonToXml(value), '已复制转换 XML')
      return
    case 'to-typescript':
      copyResult(jsonToTypeScriptInterface(value), '已复制转换 TypeScript')
      return
    case 'copy-json':
      copyResult(analysis.value.formatted, '已复制 JSON')
      return
    default:
      return
  }
}
</script>

<template>
  <StructuredToolShell
    ref="shellRef"
    title="JSON 工具"
    description="可视化、格式化并复制 JSON 数据"
    tool-code="json"
    input-id="json-input"
    input-label="JSON 输入"
    editor-language="json"
    show-output
    :output-open="outputOpen"
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
    @close-output="closeOutput"
  >
    <template #toolbar-leading>
      <ExpressionInput
        :model-value="filterExpression"
        prefix="this"
        input-id="json-js-filter"
        placeholder=".key.subkey、[0][1]、.map(x=>x.val)"
        aria-label="表达式"
        :locate-disabled="!locateSegments"
        @update:model-value="onFilterInput"
        @locate="locateSelection"
      />
      <p
        v-if="analysis.state === 'ready' && analysis.source !== 'json'"
        class="json-filter__source"
        role="status"
        aria-live="polite"
      >
        已识别为 {{ sourceLabel }}，已自动转为 JSON
      </p>
    </template>

    <template #output>
      <section class="json-filter" aria-label="JSON 表达式结果">
        <span class="json-filter__label">表达式结果</span>
        <CodeEditor
          class="json-filter__editor"
          :model-value="filterOutput"
          language="json"
          input-id="json-filter-output"
          aria-label="表达式结果"
          test-id="json-filter-output"
          read-only
        />
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
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.json-filter__source {
  margin: 0;
  color: var(--text-muted);
  font-size: 11.5px;
}

.json-filter__editor {
  height: clamp(260px, 42vh, 460px);
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
}
</style>
