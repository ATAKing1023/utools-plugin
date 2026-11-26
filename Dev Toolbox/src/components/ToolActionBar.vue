<script setup>
import ToolActionIcon from './ToolActionIcon.vue'

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
    <div class="tool-action-bar__leading">
      <slot name="leading" />
    </div>
    <p
      v-if="status"
      class="tool-action-bar__status"
      role="status"
      aria-live="polite"
    >
      {{ status }}
    </p>
    <div class="tool-action-bar__buttons" role="group" aria-label="内容操作">
      <template v-for="action in actions" :key="action.id">
        <span
          v-if="action.dividerBefore"
          class="tool-action-bar__divider"
          aria-hidden="true"
        ></span>
        <button
          type="button"
          class="tool-action-bar__button"
          :data-action-id="action.id"
          :data-tooltip="action.title || action.label"
          :aria-label="action.label"
          :disabled="disabled || action.disabled"
          @mousedown.prevent
          @click="$emit('run', action.id)"
        >
          <ToolActionIcon :name="action.icon" />
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tool-action-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
  min-width: 0;
}

.tool-action-bar__leading {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tool-action-bar__status {
  flex: 0 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11.5px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-action-bar__buttons {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 2px;
  min-width: 0;
  margin-left: auto;
}

.tool-action-bar__button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.tool-action-bar__button:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--accent);
}

.tool-action-bar__button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.tool-action-bar__button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}

.tool-action-bar__button::after {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  z-index: 30;
  display: none;
  padding: 6px 9px;
  border-radius: 4px;
  background: #555;
  color: #fff;
  content: attr(data-tooltip);
  font-size: 12px;
  line-height: 1.2;
  pointer-events: none;
  transform: translateX(-50%);
  white-space: nowrap;
}

.tool-action-bar__button:first-child::after {
  left: 0;
  transform: none;
}

.tool-action-bar__button:last-child::after {
  right: 0;
  left: auto;
  transform: none;
}

.tool-action-bar__button:hover::after,
.tool-action-bar__button:focus-visible::after {
  display: block;
}

.tool-action-bar__divider {
  width: 1px;
  height: 18px;
  margin: 0 5px;
  background: var(--border-strong);
}

@media (max-width: 520px) {
  .tool-action-bar {
    flex-wrap: wrap;
    gap: 6px;
  }

  .tool-action-bar__leading {
    flex: 1 1 100%;
  }

  .tool-action-bar__buttons {
    flex: 1 1 100%;
    width: 100%;
    justify-content: flex-start;
    margin-left: 0;
  }

  .tool-action-bar__button {
    width: 30px;
    height: 30px;
  }

  .tool-action-bar__divider {
    margin: 0 3px;
  }
}
</style>
