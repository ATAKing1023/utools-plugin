<script setup>
import { computed, onMounted, ref } from 'vue'
import EmptyState from '../../components/EmptyState.vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import OutputList from '../../components/OutputList.vue'
import {
  EMPTY_TIMESTAMP_MESSAGE,
  EXCEL_LOCAL_TIME_NOTE,
  INPUT_TYPE_AUTO,
  INPUT_TYPE_OPTIONS,
  buildTimestampRows,
  getInitialTimestampInput
} from './logic.js'

const props = defineProps({
  action: {
    type: Object,
    default: null
  }
})

const inputElement = ref(null)
const input = ref(getInitialTimestampInput(props.action))
const inputType = ref(INPUT_TYPE_AUTO)

const result = computed(() =>
  buildTimestampRows(input.value, [], {
    inputType: inputType.value
  })
)
const rows = computed(() => result.value.rows)

onMounted(() => {
  inputElement.value?.focus()
  inputElement.value?.select()
})
</script>

<template>
  <section
    class="timestamp-tool"
    data-tool="timestamp"
  >
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
      aria-describedby="timestamp-parser-status timestamp-excel-hint"
      :data-status="result.status"
    />

    <div class="timestamp-parser">
      <div class="timestamp-parser__field">
        <label class="timestamp-parser__label" for="timestamp-input-type">
          输入类型
        </label>
        <select
          id="timestamp-input-type"
          v-model="inputType"
          class="timestamp-select"
          aria-describedby="timestamp-parser-status"
        >
          <option
            v-for="option in INPUT_TYPE_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </div>
      <p
        id="timestamp-parser-status"
        class="timestamp-status"
        data-testid="timestamp-status"
      >
        {{ result.statusText }}
      </p>
      <p id="timestamp-excel-hint" class="timestamp-hint">
        {{ EXCEL_LOCAL_TIME_NOTE }}
      </p>
    </div>

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
      <p
        v-if="result.excelNote"
        class="timestamp-excel-note"
        role="status"
      >
        {{ result.excelNote }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.timestamp-tool {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
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
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 18px;
  line-height: 1.4;
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

.timestamp-parser {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  min-width: 0;
}

.timestamp-parser__field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  min-width: 0;
}

.timestamp-parser__label {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.timestamp-select {
  max-width: 100%;
  min-height: 34px;
  padding: 5px 28px 5px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--surface-raised);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
}

.timestamp-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.timestamp-status,
.timestamp-hint,
.timestamp-excel-note {
  margin: 0;
  overflow-wrap: anywhere;
}

.timestamp-status {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.timestamp-hint {
  color: var(--text-muted);
  font-size: 11.5px;
  line-height: 1.4;
}

.timestamp-status::before,
.timestamp-hint::before {
  content: '·';
  margin-right: 8px;
  color: var(--border-strong);
}

.timestamp-excel-note {
  padding: 8px 11px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.timestamp-results {
  display: grid;
  gap: 8px;
  min-width: 0;
}

@media (max-width: 520px) {
  .timestamp-input {
    padding: 9px 11px;
    font-size: 16px;
  }

  .timestamp-parser__field {
    gap: 5px 8px;
  }

  .timestamp-select {
    min-width: 0;
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

}
</style>
