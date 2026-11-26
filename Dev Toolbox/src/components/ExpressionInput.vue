<script setup>
import ToolActionIcon from './ToolActionIcon.vue'

defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  prefix: {
    type: String,
    required: true
  },
  inputId: {
    type: String,
    required: true
  },
  placeholder: {
    type: String,
    default: ''
  },
  ariaLabel: {
    type: String,
    default: '表达式'
  },
  locateLabel: {
    type: String,
    default: '定位到表达式对应元素'
  },
  locateDisabled: {
    type: Boolean,
    default: false
  }
})

defineEmits(['update:modelValue', 'locate'])
</script>

<template>
  <div class="expression-input">
    <code class="expression-input__prefix">{{ prefix }}</code>
    <input
      :id="inputId"
      :value="modelValue"
      class="expression-input__field"
      type="text"
      autocomplete="off"
      spellcheck="false"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      @input="$emit('update:modelValue', $event.target.value)"
      @keydown.enter.prevent="$emit('locate')"
    />
    <button
      type="button"
      class="expression-input__locate"
      :data-tooltip="locateLabel"
      :aria-label="locateLabel"
      :disabled="locateDisabled"
      @mousedown.prevent
      @click="$emit('locate')"
    >
      <ToolActionIcon name="my-location" />
    </button>
  </div>
</template>

<style scoped>
.expression-input {
  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  min-width: 0;
  height: 32px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
}

.expression-input:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
}

.expression-input__prefix {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border-right: 1px solid var(--border-strong);
  border-radius: 5px 0 0 5px;
  background: var(--surface-subtle);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 12px;
  user-select: none;
}

.expression-input__field {
  flex: 1 1 auto;
  width: 0;
  min-width: 0;
  padding: 0 9px;
  border: 0;
  border-radius: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
}

.expression-input__field::placeholder {
  color: var(--text-muted);
}

.expression-input__locate {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 31px;
  padding: 0;
  border: 0;
  border-left: 1px solid var(--border-strong);
  border-radius: 0 5px 5px 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.expression-input__locate:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--accent);
}

.expression-input__locate:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.expression-input__locate:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}

.expression-input__locate::after {
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

.expression-input__locate:hover::after,
.expression-input__locate:focus-visible::after {
  display: block;
}
</style>
