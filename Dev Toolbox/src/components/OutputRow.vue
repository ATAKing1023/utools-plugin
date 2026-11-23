<script setup>
import { computed } from 'vue'
import { formatDisplayValue, getShortcutLabel } from '../lib/copy.js'

const props = defineProps({
  label: {
    type: String,
    required: true
  },
  value: {
    default: undefined
  },
  index: {
    type: Number,
    required: true
  }
})

defineEmits(['copy'])

const displayValue = computed(() => formatDisplayValue(props.value))
const shortcutLabel = computed(() => getShortcutLabel(props.index))
</script>

<template>
  <div class="output-row">
    <span class="output-row__label">{{ label }}</span>
    <span class="output-row__value">{{ displayValue }}</span>
    <button
      type="button"
      class="output-row__copy"
      :aria-label="`复制 ${label}`"
      @click="$emit('copy')"
    >
      {{ shortcutLabel }}
    </button>
  </div>
</template>

<style scoped>
.output-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.output-row__label {
  flex: 0 0 auto;
  color: #888;
  font-size: 13px;
  line-height: 1.65;
}

.output-row__value {
  flex: 1 1 auto;
  min-width: 0;
  max-height: 250px;
  overflow-y: auto;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.output-row__copy {
  flex: 0 0 auto;
  min-width: 48px;
  padding: 5px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
}

.output-row__copy:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.output-row__copy:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
