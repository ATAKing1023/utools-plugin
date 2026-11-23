<script setup>
const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  modes: {
    type: Array,
    default: () => [
      { id: 'tree', label: '可视化' },
      { id: 'format', label: '格式化' }
    ]
  }
})

const emit = defineEmits(['update:modelValue'])

function selectMode(mode) {
  if (!mode || mode.id === props.modelValue) return
  emit('update:modelValue', mode.id)
}
</script>

<template>
  <div class="mode-tabs" role="tablist" aria-label="显示模式">
    <button
      v-for="mode in modes"
      :key="mode.id"
      type="button"
      class="mode-tabs__tab"
      role="tab"
      :aria-selected="mode.id === modelValue"
      :tabindex="mode.id === modelValue ? 0 : -1"
      @click="selectMode(mode)"
    >
      {{ mode.label }}
    </button>
  </div>
</template>

<style scoped>
.mode-tabs {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.mode-tabs__tab {
  padding: 7px 14px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.3;
  cursor: pointer;
}

.mode-tabs__tab[aria-selected='true'] {
  background: var(--surface-raised);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgb(0 0 0 / 10%);
}

.mode-tabs__tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
