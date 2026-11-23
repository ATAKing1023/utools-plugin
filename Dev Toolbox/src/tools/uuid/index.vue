<script setup>
import { ref } from 'vue'
import EmptyState from '../../components/EmptyState.vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import OutputList from '../../components/OutputList.vue'
import { generateUuid, toUuidRows } from './logic.js'

defineProps({
  action: {
    type: Object,
    default: null
  }
})

const rows = ref([])
const error = ref('')

function getErrorMessage(cause) {
  return cause instanceof Error ? cause.message : 'UUID 生成失败'
}

function regenerate() {
  try {
    rows.value = toUuidRows(generateUuid())
    error.value = ''
  } catch (cause) {
    rows.value = []
    error.value = getErrorMessage(cause)
  }
}

regenerate()
</script>

<template>
  <section class="uuid-tool" data-tool="uuid">
    <div class="uuid-output" aria-live="polite">
      <ErrorNotice v-if="error" :message="error" />
      <OutputList v-else-if="rows.length" :rows="rows" />
      <EmptyState v-else message="尚未生成 UUID" />
    </div>
    <div class="uuid-actions">
      <button type="button" class="uuid-regenerate" @click="regenerate">
        重新生成
      </button>
    </div>
  </section>
</template>

<style scoped>
.uuid-tool {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.uuid-output {
  min-width: 0;
}

.uuid-actions {
  display: flex;
  justify-content: center;
}

.uuid-regenerate {
  min-width: 132px;
  min-height: 40px;
  padding: 8px 20px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface-raised);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.uuid-regenerate:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.uuid-regenerate:active {
  background: var(--surface-hover);
}

.uuid-regenerate:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
