<script setup>
import { computed } from 'vue'
import EmptyState from './EmptyState.vue'
import ErrorNotice from './ErrorNotice.vue'
import ModeTabs from './ModeTabs.vue'
import ToolActionBar from './ToolActionBar.vue'
import ToolFrame from './ToolFrame.vue'
import TreeView from './TreeView.vue'
import GraphView from '../tools/json/GraphView.vue'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  toolCode: {
    type: String,
    required: true
  },
  inputId: {
    type: String,
    required: true
  },
  inputLabel: {
    type: String,
    required: true
  },
  placeholder: {
    type: String,
    default: ''
  },
  input: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  errorMessage: {
    type: String,
    default: ''
  },
  emptyMessage: {
    type: String,
    default: ''
  },
  mode: {
    type: String,
    required: true
  },
  modes: {
    type: Array,
    required: true
  },
  actions: {
    type: Array,
    default: () => []
  },
  actionStatus: {
    type: String,
    default: ''
  },
  treeNodes: {
    type: Array,
    default: () => []
  },
  treeLabel: {
    type: String,
    default: ''
  },
  graph: {
    type: Object,
    default: null
  },
  graphLabel: {
    type: String,
    default: ''
  },
  graphTestId: {
    type: String,
    default: 'json-graph'
  },
  graphInspectorLabel: {
    type: String,
    default: ''
  },
  graphValueLabel: {
    type: String,
    default: ''
  },
  graphTypeLabels: {
    type: Object,
    default: () => ({})
  },
  graphCountLabels: {
    type: Object,
    default: () => ({})
  },
  graphEmptyLabels: {
    type: Object,
    default: () => ({})
  },
  limitedTitle: {
    type: String,
    default: '关系图已达到限制'
  }
})

const emit = defineEmits(['update:input', 'update:mode', 'run-action', 'paste'])

const isLimited = computed(
  () => props.mode === 'graph' && Boolean(props.graph?.limit)
)

function onInput(event) {
  emit('update:input', event.target.value)
}

function onModeChange(nextMode) {
  emit('update:mode', nextMode)
}

function onPaste(event) {
  emit('paste', event)
}
</script>

<template>
  <ToolFrame :title="title" :description="description">
    <div class="structured-tool" :data-tool="toolCode" :data-mode="mode">
      <label class="structured-tool__field" :for="inputId">
        <span class="structured-tool__label">{{ inputLabel }}</span>
        <textarea
          :id="inputId"
          class="structured-tool__input"
          :value="input"
          rows="8"
          spellcheck="false"
          :placeholder="placeholder"
          @input="onInput"
          @paste="onPaste"
        />
      </label>

      <ToolActionBar
        v-if="actions.length > 0"
        :actions="actions"
        :status="actionStatus"
        @run="emit('run-action', $event)"
      />

      <slot name="extras" />

      <ModeTabs
        :model-value="mode"
        :modes="modes"
        @update:model-value="onModeChange"
      />

      <EmptyState v-if="state === 'empty'" :message="emptyMessage" />

      <ErrorNotice v-else-if="state === 'error'" :message="errorMessage" />

      <template v-else>
        <TreeView
          v-if="mode === 'tree'"
          :nodes="treeNodes"
          :aria-label="treeLabel"
          :data-testid="`${toolCode}-tree`"
        />
        <GraphView
          v-else-if="mode === 'graph' && graph?.ok"
          :graph="graph"
          :aria-label="graphLabel"
          :test-id="graphTestId"
          :inspector-label="graphInspectorLabel"
          :value-label="graphValueLabel"
          :type-labels="graphTypeLabels"
          :count-labels="graphCountLabels"
          :empty-labels="graphEmptyLabels"
        />
        <section
          v-else-if="mode === 'graph'"
          class="structured-tool__limited"
          data-state="limited"
          :data-testid="`${graphTestId}-limited`"
        >
          <strong class="structured-tool__limited-title">
            {{ limitedTitle }}
          </strong>
          <p
            class="structured-tool__limited-message"
            role="status"
            aria-live="polite"
          >
            当前内容超出{{ graph.limitLabel }}上限
            {{ graph.limitDisplay }}，关系图未生成。
          </p>
          <button
            type="button"
            class="structured-tool__limited-action"
            @click="onModeChange('tree')"
          >
            切换到结构树
          </button>
        </section>
      </template>
    </div>
  </ToolFrame>
</template>

<style scoped>
.structured-tool {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.structured-tool__field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.structured-tool__label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.structured-tool__input {
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

.structured-tool__input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
}

.structured-tool__limited {
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

.structured-tool__limited-title {
  font-size: 14px;
}

.structured-tool__limited-message {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.structured-tool__limited-action {
  padding: 6px 10px;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.structured-tool__limited-action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (max-width: 520px) {
  .structured-tool__input {
    min-height: 148px;
  }
}
</style>
