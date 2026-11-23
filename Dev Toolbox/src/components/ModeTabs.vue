<script setup>
import { computed, nextTick } from 'vue'

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

const tabs = computed(() =>
  (Array.isArray(props.modes) ? props.modes : []).filter(
    (mode) => mode && typeof mode.id === 'string' && mode.id
  )
)

const enabledTabs = computed(() => tabs.value.filter((mode) => !mode.disabled))

const selectedIndex = computed(() =>
  tabs.value.findIndex((mode) => mode.id === props.modelValue)
)

const rovingModeId = computed(() => {
  const selectedTab = tabs.value[selectedIndex.value]
  if (selectedTab && !selectedTab.disabled) return selectedTab.id
  return enabledTabs.value[0]?.id || null
})

const tabElements = new Map()

function setTabRef(id, element) {
  if (element) tabElements.set(id, element)
  else tabElements.delete(id)
}

function focusTab(mode) {
  nextTick(() => {
    tabElements.get(mode.id)?.focus()
  })
}

function activateMode(mode) {
  if (!mode || mode.disabled) return
  if (mode.id !== props.modelValue) emit('update:modelValue', mode.id)
  focusTab(mode)
}

function selectMode(mode) {
  if (!mode || mode.disabled || mode.id === props.modelValue) return
  emit('update:modelValue', mode.id)
}

function handleKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return

  event.preventDefault()
  if (!enabledTabs.value.length) return

  let target
  if (event.key === 'Home') {
    target = enabledTabs.value[0]
  } else if (event.key === 'End') {
    target = enabledTabs.value[enabledTabs.value.length - 1]
  } else {
    const currentId = event.currentTarget?.dataset?.modeId
    let currentIndex = enabledTabs.value.findIndex((mode) => mode.id === currentId)
    if (currentIndex < 0) {
      currentIndex = enabledTabs.value.findIndex(
        (mode) => mode.id === rovingModeId.value
      )
    }
    if (currentIndex < 0) currentIndex = 0

    const offset = event.key === 'ArrowRight' ? 1 : -1
    target =
      enabledTabs.value[
        (currentIndex + offset + enabledTabs.value.length) %
          enabledTabs.value.length
      ]
  }

  activateMode(target)
}
</script>

<template>
  <div class="mode-tabs" role="tablist" aria-label="显示模式">
    <button
      v-for="mode in tabs"
      :key="mode.id"
      :ref="(element) => setTabRef(mode.id, element)"
      type="button"
      class="mode-tabs__tab"
      role="tab"
      :data-mode-id="mode.id"
      :aria-selected="mode.id === modelValue"
      :aria-disabled="mode.disabled ? 'true' : undefined"
      :disabled="Boolean(mode.disabled)"
      :tabindex="mode.id === rovingModeId ? 0 : -1"
      @click="selectMode(mode)"
      @keydown="handleKeydown"
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

.mode-tabs__tab:disabled {
  cursor: not-allowed;
  opacity: 0.5;
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
