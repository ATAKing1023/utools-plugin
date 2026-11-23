<script setup>
import { computed, ref } from 'vue'
import EmptyState from '../../components/EmptyState.vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import ModeTabs from '../../components/ModeTabs.vue'
import OutputList from '../../components/OutputList.vue'
import ToolFrame from '../../components/ToolFrame.vue'
import { decodeUrl, encodeUrl } from './logic.js'

defineProps({
  action: {
    type: Object,
    default: null
  }
})

const modes = [
  { id: 'encode', label: '编码' },
  { id: 'decode', label: '解码' }
]
const mode = ref('encode')
const text = ref('')

function getErrorMessage(cause) {
  return cause instanceof Error ? cause.message : 'URL 处理失败'
}

const result = computed(() => {
  if (!text.value) {
    return {
      status: 'empty',
      message:
        mode.value === 'encode' ? '输入要编码的 URL 文本' : '输入要解码的 URL 文本'
    }
  }

  try {
    const value = mode.value === 'encode' ? encodeUrl(text.value) : decodeUrl(text.value)
    return {
      status: 'success',
      rows: [
        {
          label: mode.value === 'encode' ? '编码结果' : '解码结果',
          value
        }
      ]
    }
  } catch (cause) {
    return {
      status: 'error',
      message: getErrorMessage(cause)
    }
  }
})

const placeholder = computed(() =>
  mode.value === 'encode'
    ? '输入要编码的 URL 或文本'
    : '粘贴要解码的 URL 编码文本'
)
</script>

<template>
  <ToolFrame
    title="URL 编解码"
    description="使用 encodeURIComponent 语义，保留解码时的字面加号"
  >
    <div class="encoding-tool" data-tool="url">
      <ModeTabs v-model="mode" :modes="modes" />
      <label class="visually-hidden" for="url-input">
        URL 输入
      </label>
      <textarea
        id="url-input"
        v-model="text"
        class="tool-textarea"
        rows="7"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="placeholder"
        :data-mode="mode"
      ></textarea>

      <div class="encoding-output" aria-live="polite">
        <EmptyState
          v-if="result.status === 'empty'"
          :message="result.message"
        />
        <ErrorNotice
          v-else-if="result.status === 'error'"
          :message="result.message"
        />
        <OutputList v-else :rows="result.rows" />
      </div>
    </div>
  </ToolFrame>
</template>

<style scoped>
.encoding-tool {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.tool-textarea {
  width: 100%;
  min-height: 154px;
  max-height: 42vh;
  padding: 12px 14px;
  resize: vertical;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  outline: none;
  background: var(--surface);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.65;
}

.tool-textarea::placeholder {
  color: var(--text-muted);
}

.tool-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

.encoding-output {
  min-width: 0;
}
</style>
