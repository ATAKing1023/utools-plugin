<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import CodeEditor from '../../components/CodeEditor.vue'
import ExpressionInput from '../../components/ExpressionInput.vue'
import StructuredToolShell from '../../components/StructuredToolShell.vue'
import { copyValue } from '../../lib/copy.js'
import { isTextEntryTarget } from '../../lib/keyboard.js'
import { jsonToTypeScriptInterface } from '../json/actions.js'
import { evaluateXmlFilter } from './filter.js'
import {
  XML_GRAPH_COUNT_LABELS,
  XML_GRAPH_EMPTY_LABELS,
  XML_GRAPH_TYPE_LABELS,
  buildXmlGraph
} from './graph.js'
import {
  formatXmlText,
  isXmlInputEmpty,
  parseXmlDocument,
  validateXml,
  xmlToJson
} from './logic.js'
import { buildXmlTree } from './tree.js'

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
    id: 'to-json',
    label: '转 JSON 复制',
    title: 'XML 转 JSON 并复制',
    icon: 'code',
    dividerBefore: true
  }),
  Object.freeze({
    id: 'to-typescript',
    label: '转 TS 复制',
    title: 'XML 转 TypeScript 并复制',
    icon: 'description'
  }),
  Object.freeze({
    id: 'to-xml',
    label: '复制 XML',
    title: '复制原始 XML',
    icon: 'content-copy'
  })
])

const actionBarActions = computed(() =>
  ACTIONS.map((action) =>
    Object.freeze({
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
const shellRef = ref(null)
const filterExpression = ref('')
const outputOpen = ref(false)

const analysis = computed(() => {
  if (isXmlInputEmpty(input.value)) return { state: 'empty' }

  const validation = validateXml(input.value)
  if (!validation.ok) return { state: 'error', error: validation.error }

  const parsed = parseXmlDocument(input.value)
  if (!parsed.ok) return { state: 'error', error: parsed.error }

  const treeResult = buildXmlTree(input.value)
  if (!treeResult.ok) return { state: 'error', error: treeResult.error }

  const formatResult = formatXmlText(input.value)
  if (!formatResult.ok) {
    return { state: 'error', error: formatResult.error }
  }

  const jsonResult = xmlToJson(input.value)
  if (!jsonResult.ok) {
    return { state: 'error', error: jsonResult.error }
  }

  return {
    state: 'ready',
    document: parsed.document,
    nodes: treeResult.nodes,
    formatted: formatResult.value,
    value: jsonResult.value
  }
})

const graphAnalysis = computed(() => {
  if (mode.value !== 'graph' || analysis.value.state !== 'ready') {
    return null
  }
  return buildXmlGraph(input.value)
})

const treeNodes = computed(() =>
  analysis.value.state === 'ready' ? analysis.value.nodes : []
)

const filterResult = computed(() => {
  const expression = filterExpression.value.trim()
  if (!expression) {
    return { ok: true, output: '', firstAddress: null }
  }
  if (analysis.value.state !== 'ready') {
    return {
      ok: false,
      output: '// 请输入有效的 XML 后再执行 XPath',
      firstAddress: null
    }
  }
  return evaluateXmlFilter(expression, input.value, analysis.value.document)
})

const filterOutput = computed(() => filterResult.value.output)
const canLocate = computed(() => Boolean(filterResult.value.firstAddress))

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
  const address = filterResult.value.firstAddress
  if (!address) {
    setStatus(
      filterResult.value.ok
        ? '当前 XPath 结果没有可定位的节点'
        : '请先输入有效的 XPath'
    )
    return
  }

  const located = shellRef.value?.selectXmlAddress(address) ?? false
  setStatus(located ? '已定位到 XPath 对应节点' : '未在源码中找到该节点')
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

function runAction(id) {
  if (analysis.value.state !== 'ready') {
    setStatus('请输入有效的 XML 后再使用该操作')
    return
  }

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
    case 'to-json':
      copyResult(
        JSON.stringify(analysis.value.value, null, 2),
        '已复制转换 JSON'
      )
      return
    case 'to-typescript':
      copyResult(
        jsonToTypeScriptInterface(analysis.value.value),
        '已复制转换 TypeScript'
      )
      return
    case 'to-xml':
      copyResult(analysis.value.formatted, '已复制 XML')
      return
    default:
      return
  }
}
</script>

<template>
  <StructuredToolShell
    ref="shellRef"
    title="XML 工具"
    description="可视化、格式化并复制 XML 文档"
    tool-code="xml"
    input-id="xml-input"
    input-label="XML 输入"
    editor-language="xml"
    show-output
    :output-open="outputOpen"
    placeholder='粘贴 XML，例如 <root><name>Dev Toolbox</name></root>'
    :input="input"
    :state="analysis.state"
    :error-message="analysis.error?.displayMessage || analysis.error?.message || ''"
    empty-message="请输入 XML 文档以开始解析"
    :mode="mode"
    :modes="MODES"
    :actions="actionBarActions"
    :action-status="actionStatus"
    :tree-nodes="treeNodes"
    tree-label="XML 结构树"
    :graph="graphAnalysis"
    graph-label="XML 关系图"
    graph-test-id="xml-graph"
    graph-inspector-label="XML 检查器"
    graph-value-label="完整 XML 节点"
    :graph-type-labels="XML_GRAPH_TYPE_LABELS"
    :graph-count-labels="XML_GRAPH_COUNT_LABELS"
    :graph-empty-labels="XML_GRAPH_EMPTY_LABELS"
    @update:input="input = $event"
    @update:mode="mode = $event"
    @run-action="runAction"
    @close-output="closeOutput"
  >
    <template #toolbar-leading>
      <ExpressionInput
        :model-value="filterExpression"
        prefix="XPath"
        input-id="xml-xpath-filter"
        placeholder="//item、/root/item[1]、//@id"
        aria-label="XPath"
        locate-label="定位到 XPath 对应节点"
        :locate-disabled="!canLocate"
        @update:model-value="onFilterInput"
        @locate="locateSelection"
      />
    </template>

    <template #output>
      <section class="xml-filter" aria-label="XPath 结果">
        <span class="xml-filter__label">XPath 结果</span>
        <CodeEditor
          class="xml-filter__editor"
          :model-value="filterOutput"
          language="xml"
          input-id="xml-filter-output"
          aria-label="XPath 结果"
          test-id="xml-filter-output"
          read-only
        />
      </section>
    </template>
  </StructuredToolShell>
</template>

<style scoped>
.xml-filter {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.xml-filter__label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.xml-filter__editor {
  height: clamp(260px, 42vh, 460px);
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
}
</style>
