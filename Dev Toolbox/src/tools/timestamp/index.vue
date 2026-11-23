<script setup>
import { computed, onMounted, ref } from 'vue'
import EmptyState from '../../components/EmptyState.vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import OutputList from '../../components/OutputList.vue'
import {
  readTimezoneOffsets,
  writeTimezoneOffsets
} from '../../lib/preferences.js'
import {
  EMPTY_TIMESTAMP_MESSAGE,
  buildTimestampRows,
  getInitialTimestampInput,
  sanitizeTimezoneOffsets
} from './logic.js'
import { TIMEZONE_KEYS, TIMEZONE_TABLE } from './timezones.js'

const props = defineProps({
  action: {
    type: Object,
    default: null
  }
})

const inputElement = ref(null)
const input = ref(getInitialTimestampInput(props.action))
const selectedOffsets = ref(
  sanitizeTimezoneOffsets(readTimezoneOffsets())
)
const panelOpen = ref(false)

const result = computed(() =>
  buildTimestampRows(input.value, selectedOffsets.value)
)
const rows = computed(() => result.value.rows)

function toggleOffset(offsetKey, event) {
  const nextSelection = new Set(selectedOffsets.value)
  if (event?.target?.checked) nextSelection.add(offsetKey)
  else nextSelection.delete(offsetKey)

  selectedOffsets.value = sanitizeTimezoneOffsets([...nextSelection])
  writeTimezoneOffsets(selectedOffsets.value)
}

onMounted(() => {
  inputElement.value?.focus()
  inputElement.value?.select()
})
</script>

<template>
  <section class="timestamp-tool" data-tool="timestamp">
    <label class="visually-hidden" for="timestamp-input">
      时间戳或日期时间
    </label>
    <input
      id="timestamp-input"
      ref="inputElement"
      v-model="input"
      class="timestamp-input"
      type="text"
      inputmode="text"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      placeholder="输入时间戳或日期时间"
      :aria-invalid="result.status === 'error' ? 'true' : 'false'"
      :data-status="result.status"
    />

    <div class="timestamp-results" aria-live="polite">
      <EmptyState
        v-if="result.status === 'empty'"
        :message="EMPTY_TIMESTAMP_MESSAGE"
      />
      <ErrorNotice
        v-else-if="result.status === 'error'"
        :message="result.message"
      />
      <OutputList v-else :rows="rows" />
    </div>

    <div class="timezone-control">
      <button
        type="button"
        class="timezone-trigger"
        aria-controls="timezone-panel"
        :aria-expanded="panelOpen ? 'true' : 'false'"
        @click="panelOpen = !panelOpen"
      >
        其他时区
        <span
          v-if="selectedOffsets.length"
          class="timezone-trigger__count"
          aria-hidden="true"
        >
          {{ selectedOffsets.length }}
        </span>
      </button>
    </div>

    <div
      v-if="panelOpen"
      id="timezone-panel"
      class="timezone-panel"
      role="region"
      aria-label="其他时区"
    >
      <header class="timezone-panel__header">
        <strong>其他时区</strong>
        <button
          type="button"
          class="timezone-panel__close"
          aria-label="关闭其他时区面板"
          @click="panelOpen = false"
        >
          ×
        </button>
      </header>
      <div class="timezone-panel__list">
        <label
          v-for="offsetKey in TIMEZONE_KEYS"
          :key="offsetKey"
          class="timezone-option"
          :for="`timezone-${offsetKey}`"
        >
          <input
            :id="`timezone-${offsetKey}`"
            type="checkbox"
            :data-offset-key="offsetKey"
            :checked="selectedOffsets.includes(offsetKey)"
            @change="toggleOffset(offsetKey, $event)"
          />
          <span class="timezone-option__text">
            <span class="timezone-option__key">UTC{{ offsetKey }}</span>
            {{ TIMEZONE_TABLE[offsetKey].text }}
          </span>
        </label>
      </div>
    </div>
  </section>
</template>

<style scoped>
.timestamp-tool {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding-bottom: 52px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.timestamp-input {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 20px;
  line-height: 1.45;
  outline: none;
}

.timestamp-input::placeholder {
  color: var(--text-muted);
}

.timestamp-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

.timestamp-input[aria-invalid='true'] {
  border-color: var(--danger-border);
}

.timestamp-results {
  min-width: 0;
}

.timezone-control {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 22;
}

.timezone-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  box-shadow: 0 3px 14px rgb(0 0 0 / 12%);
  font-size: 13px;
  cursor: pointer;
}

.timezone-trigger:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.timezone-trigger:focus-visible,
.timezone-panel__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.timezone-trigger__count {
  min-width: 20px;
  padding: 2px 5px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  line-height: 1.35;
  text-align: center;
}

.timezone-panel {
  position: fixed;
  right: 20px;
  bottom: 72px;
  z-index: 21;
  display: flex;
  flex-direction: column;
  width: min(320px, calc(100vw - 28px));
  max-height: min(60vh, 480px);
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface-raised);
  box-shadow: 0 12px 38px rgb(0 0 0 / 18%);
}

.timezone-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 13px;
}

.timezone-panel__close {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  place-items: center;
}

.timezone-panel__close:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.timezone-panel__list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 5px 0;
}

.timezone-option {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 7px 14px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
  cursor: pointer;
}

.timezone-option:hover {
  background: var(--surface-hover);
}

.timezone-option input {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  margin: 2px 0 0;
  accent-color: var(--accent);
}

.timezone-option__text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.timezone-option__key {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
}

@media (max-width: 520px) {
  .timestamp-input {
    padding: 12px 13px;
    font-size: 18px;
  }

  :deep(.output-row) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px 10px;
  }

  :deep(.output-row__label) {
    grid-column: 1 / -1;
    min-width: 0;
  }

  :deep(.output-row__value) {
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
    width: 100%;
  }

  :deep(.output-row__copy) {
    grid-column: 2;
    grid-row: 2;
  }

  .timezone-control {
    right: 14px;
    bottom: 14px;
  }

  .timezone-panel {
    right: 14px;
    bottom: 64px;
  }
}

@media (max-height: 520px) {
  .timezone-panel {
    bottom: 62px;
    max-height: calc(100vh - 78px);
  }
}
</style>
