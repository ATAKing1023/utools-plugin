<script setup>
import { computed, ref } from 'vue'
import StructuredToolShell from '../../components/StructuredToolShell.vue'
import { copyValue } from '../../lib/copy.js'
import { jsonToTypeScriptInterface } from '../json/actions.js'
import {
  XML_GRAPH_COUNT_LABELS,
  XML_GRAPH_EMPTY_LABELS,
  XML_GRAPH_TYPE_LABELS,
  buildXmlGraph
} from './graph.js'
import {
  formatXmlText,
  isXmlInputEmpty,
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
  Object.freeze({ id: 'format', label: '格式化', title: '重新格式化 XML' }),
  Object.freeze({
    id: 'to-json',
    label: '转 JSON 复制',
    title: 'XML 转 JSON 并复制'
  }),
  Object.freeze({
    id: 'to-typescript',
    label: '转 TS 复制',
    title: 'JSON 转 TypeScript 并复制'
  }),
  Object.freeze({
    id: 'to-xml',
    label: '复制 XML',
    title: '复制原始 XML'
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

const analysis = computed(() => {
  if (isXmlInputEmpty(input.value)) return { state: 'empty' }

  const validation = validateXml(input.value)
  if (!validation.ok) return { state: 'error', error: validation.error }

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

function setStatus(message) {
  actionStatus.value = message
  if (message) {
    setTimeout(() => {
      if (actionStatus.value === message) actionStatus.value = ''
    }, 2500)
  }
}

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
    case 'to-json':
      copyValue(JSON.stringify(analysis.value.value, null, 2))
      setStatus('已复制转换 JSON')
      return
    case 'to-typescript':
      copyValue(jsonToTypeScriptInterface(analysis.value.value))
      setStatus('已复制转换 TypeScript')
      return
    case 'to-xml':
      copyValue(analysis.value.formatted)
      setStatus('已复制 XML')
      return
    default:
      return
  }
}
</script>

<template>
  <StructuredToolShell
    title="XML 工具"
    description="可视化、格式化并复制 XML 文档"
    tool-code="xml"
    input-id="xml-input"
    input-label="XML 输入"
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
  />
</template>
