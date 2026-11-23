<script setup>
import { computed, ref } from 'vue'
import EmptyState from '../../components/EmptyState.vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import OutputList from '../../components/OutputList.vue'
import ToolFrame from '../../components/ToolFrame.vue'
import { buildDiffResult } from './logic.js'

const props = defineProps({
  action: {
    type: Object,
    required: true
  },
  enterAction: {
    type: Object,
    default: null
  }
})

const original = ref('')
const revised = ref('')

const actionCode = computed(() =>
  typeof props.action?.code === 'string' ? props.action.code : ''
)
const result = computed(() => buildDiffResult(original.value, revised.value))
const outputRows = computed(() => {
  if (result.value.isEmpty || !result.value.unifiedDiff) return []
  return [{ label: '统一 DIFF', value: result.value.unifiedDiff }]
})
</script>

<template>
  <ToolFrame title="文本 DIFF" description="逐行比较原文与新文，定位增删改内容">
    <div class="diff-tool" :data-action-code="actionCode">
      <div class="diff-inputs">
        <label class="diff-field" for="diff-original">
          <span class="diff-field__label">原文</span>
          <textarea
            id="diff-original"
            v-model="original"
            class="diff-field__input"
            rows="5"
            spellcheck="false"
            placeholder="输入原文"
          />
        </label>
        <label class="diff-field" for="diff-revised">
          <span class="diff-field__label">新文</span>
          <textarea
            id="diff-revised"
            v-model="revised"
            class="diff-field__input"
            rows="5"
            spellcheck="false"
            placeholder="输入新文"
          />
        </label>
      </div>

      <EmptyState
        v-if="result.isEmpty"
        message="请输入原文和新文以开始比较"
      />

      <ErrorNotice v-else-if="result.error" :message="result.error" />

      <template v-else>
        <section class="diff-summary" aria-label="差异统计" aria-live="polite">
          <span class="diff-count" data-count="added">
            新增 <strong>{{ result.counts.added }}</strong>
          </span>
          <span class="diff-count" data-count="removed">
            删除 <strong>{{ result.counts.removed }}</strong>
          </span>
          <span class="diff-count" data-count="changed">
            修改 <strong>{{ result.counts.changed }}</strong>
          </span>
          <span class="diff-count" data-count="unchanged">
            未变化 <strong>{{ result.counts.unchanged }}</strong>
          </span>
        </section>

        <div
          v-if="result.identical"
          class="diff-identical"
          data-testid="diff-identical"
          role="status"
        >
          <strong>无差异</strong>
          <span>两侧文本完全一致</span>
        </div>

        <div v-else class="diff-table-wrap">
          <table class="diff-table" aria-label="逐行差异">
            <thead>
              <tr>
                <th class="diff-table__marker" scope="col">标记</th>
                <th class="diff-table__number" scope="col">原文行</th>
                <th class="diff-table__number" scope="col">新文行</th>
                <th class="diff-table__text" scope="col">原文</th>
                <th class="diff-table__text" scope="col">新文</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in result.rows"
                :key="index"
                class="diff-row"
                :class="`diff-row--${row.type}`"
                :data-row-kind="row.type"
                :data-marker="row.marker"
              >
                <td class="diff-table__marker">{{ row.marker }}</td>
                <td class="diff-table__number">{{ row.oldNumber ?? '' }}</td>
                <td class="diff-table__number">{{ row.newNumber ?? '' }}</td>

                <td
                  v-if="row.type === 'context'"
                  class="diff-table__text diff-row__content"
                  colspan="2"
                >
                  <span class="diff-row__text">{{ row.oldText }}</span>
                  <span
                    v-if="row.hasNewline === false"
                    class="diff-row__eof"
                  >无末尾换行</span>
                </td>

                <template v-else-if="row.type === 'changed'">
                  <td class="diff-table__text diff-row__content">
                    <span class="diff-row__text">{{ row.oldText }}</span>
                    <span
                      v-if="row.oldHasNewline === false"
                      class="diff-row__eof"
                    >无末尾换行</span>
                  </td>
                  <td class="diff-table__text diff-row__content">
                    <span class="diff-row__text">{{ row.newText }}</span>
                    <span
                      v-if="row.newHasNewline === false"
                      class="diff-row__eof"
                    >无末尾换行</span>
                  </td>
                </template>

                <template v-else-if="row.type === 'removed'">
                  <td class="diff-table__text diff-row__content">
                    <span class="diff-row__text">{{ row.oldText }}</span>
                    <span
                      v-if="row.hasNewline === false"
                      class="diff-row__eof"
                    >无末尾换行</span>
                  </td>
                  <td class="diff-table__text"></td>
                </template>

                <template v-else>
                  <td class="diff-table__text"></td>
                  <td class="diff-table__text diff-row__content">
                    <span class="diff-row__text">{{ row.newText }}</span>
                    <span
                      v-if="row.hasNewline === false"
                      class="diff-row__eof"
                    >无末尾换行</span>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>

        <OutputList v-if="outputRows.length" :rows="outputRows" />
      </template>
    </div>
  </ToolFrame>
</template>

<style scoped>
.diff-tool,
.diff-inputs,
.diff-field {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.diff-tool {
  gap: 14px;
}

.diff-field {
  gap: 6px;
}

.diff-field__label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.diff-field__input {
  width: 100%;
  min-width: 0;
  min-height: 116px;
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
  white-space: pre;
  overflow: auto;
}

.diff-field__input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
}

.diff-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.diff-count {
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-subtle);
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.diff-count strong {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.diff-identical {
  display: grid;
  gap: 3px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 7%, var(--surface));
}

.diff-identical strong {
  color: var(--text-primary);
  font-size: 14px;
}

.diff-identical span {
  color: var(--text-muted);
  font-size: 12px;
}

.diff-table-wrap {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.diff-table {
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
  table-layout: fixed;
}

.diff-table th,
.diff-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.diff-table tbody tr:last-child td {
  border-bottom: 0;
}

.diff-table th {
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
}

.diff-table__marker {
  width: 42px;
  color: var(--text-secondary);
  text-align: center !important;
  font-weight: 700;
}

.diff-table__number {
  width: 58px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  text-align: right !important;
}

.diff-table__text {
  width: calc((100% - 158px) / 2);
}

.diff-row__content {
  min-width: 0;
}

.diff-row__text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  tab-size: 4;
}

.diff-row__eof {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 5px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 10px;
  white-space: nowrap;
}

.diff-row--removed {
  background: color-mix(in srgb, var(--danger-surface) 75%, transparent);
}

.diff-row--added {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.diff-row--changed {
  background: color-mix(in srgb, var(--syntax-value) 8%, transparent);
}

.diff-row--removed .diff-table__marker {
  color: var(--danger-text);
}

.diff-row--added .diff-table__marker {
  color: var(--accent);
}

.diff-row--changed .diff-table__marker {
  color: var(--syntax-value);
}

@media (max-width: 520px) {
  .diff-field__input {
    min-height: 104px;
  }

  .diff-table {
    min-width: 100%;
    table-layout: auto;
  }

  .diff-table th,
  .diff-table td {
    padding: 5px 4px;
  }

  .diff-table__marker {
    width: 30px;
  }

  .diff-table__number {
    width: 38px;
  }

  .diff-table__text {
    width: auto;
    min-width: 78px;
  }

  .diff-row__eof {
    display: block;
    width: max-content;
    margin: 3px 0 0;
  }
}
</style>
