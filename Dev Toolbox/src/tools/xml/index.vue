<script setup>
import { computed, ref } from 'vue'
import EmptyState from '../../components/EmptyState.vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import ModeTabs from '../../components/ModeTabs.vue'
import OutputList from '../../components/OutputList.vue'
import ToolFrame from '../../components/ToolFrame.vue'
import TreeView from '../../components/TreeView.vue'
import {
  formatXmlText,
  isXmlInputEmpty,
  validateXml
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
  Object.freeze({ id: 'tree', label: '可视化' }),
  Object.freeze({ id: 'format', label: '格式化' })
])

function initialInput(action) {
  if (!action || (action.type !== 'regex' && action.type !== 'over')) return ''
  return typeof action.payload === 'string' ? action.payload : ''
}

const input = ref(initialInput(props.action))
const mode = ref('tree')
const actionCode = computed(() =>
  typeof props.action?.code === 'string' ? props.action.code : ''
)

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

  return {
    state: 'ready',
    nodes: treeResult.nodes,
    formatted: formatResult.value
  }
})

const outputRows = computed(() =>
  analysis.value.state === 'ready'
    ? [{ label: '格式化结果', value: analysis.value.formatted }]
    : []
)
</script>

<template>
  <ToolFrame title="XML 工具" description="可视化、格式化并复制 XML 文档">
    <div class="xml-tool" :data-action-code="actionCode" :data-mode="mode">
      <label class="xml-field" for="xml-input">
        <span class="xml-field__label">XML 输入</span>
        <textarea
          id="xml-input"
          v-model="input"
          class="xml-field__input"
          rows="8"
          spellcheck="false"
          placeholder='粘贴 XML，例如 <root><name>Dev Toolbox</name></root>'
        />
      </label>

      <ModeTabs v-model="mode" :modes="MODES" />

      <EmptyState
        v-if="analysis.state === 'empty'"
        message="请输入 XML 文档以开始解析"
      />

      <ErrorNotice
        v-else-if="analysis.state === 'error'"
        :message="analysis.error.displayMessage || analysis.error.message"
      />

      <template v-else>
        <TreeView
          v-if="mode === 'tree'"
          :nodes="analysis.nodes"
          aria-label="XML 结构树"
          data-testid="xml-tree"
        />
        <OutputList v-else :rows="outputRows" />
      </template>
    </div>
  </ToolFrame>
</template>

<style scoped>
.xml-tool,
.xml-field {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.xml-field {
  gap: 6px;
}

.xml-field__label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.xml-field__input {
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

.xml-field__input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
}

@media (max-width: 520px) {
  .xml-field__input {
    min-height: 148px;
  }
}
</style>
