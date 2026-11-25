<script setup>
defineProps({
  actions: {
    type: Array,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    default: ''
  }
})

defineEmits(['run'])
</script>

<template>
  <div class="tool-action-bar" data-testid="tool-action-bar">
    <div class="tool-action-bar__buttons">
      <button
        v-for="action in actions"
        :key="action.id"
        type="button"
        class="tool-action-bar__button"
        :data-action-id="action.id"
        :disabled="disabled || action.disabled"
        :title="action.title"
        @click="$emit('run', action.id)"
      >
        {{ action.label }}
      </button>
    </div>
    <p
      v-if="status"
      class="tool-action-bar__status"
      role="status"
      aria-live="polite"
    >
      {{ status }}
    </p>
  </div>
</template>

<style scoped>
.tool-action-bar {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.tool-action-bar__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.tool-action-bar__button {
  min-height: 30px;
  padding: 4px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
  cursor: pointer;
}

.tool-action-bar__button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.tool-action-bar__button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.tool-action-bar__button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.tool-action-bar__status {
  margin: 0;
  color: var(--text-muted);
  font-size: 11.5px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
</style>
