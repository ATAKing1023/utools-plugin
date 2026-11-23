<script setup>
import { computed, ref } from 'vue'
import EmptyState from '../../components/EmptyState.vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import ModeTabs from '../../components/ModeTabs.vue'
import OutputList from '../../components/OutputList.vue'
import ToolFrame from '../../components/ToolFrame.vue'
import { decodeBase64, encodeBase64 } from './logic.js'

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
  return cause instanceof Error ? cause.message : 'Base64 处理失败'
}

const result = computed(() => {
  if (!text.value) {
    return {
      status: 'empty',
      message:
        mode.value === 'encode'
          ? '输入要编码的文本'
          : '输入要解码的 Base64 文本'
    }
  }

  try {
    const value =
      mode.value === 'encode' ? encodeBase64(text.value) : decodeBase64(text.value)
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
    ? '输入要编码的文本，支持中文、Emoji 和换行'
    : '粘贴要解码的 Base64 文本'
)
</script>

<template>
  <ToolFrame
    title="Base64 编解码"
    description="按 UTF-8 文本编码，并对解码输入做严格校验"
  >
    <div class="encoding-tool" data-tool="base64">
      <ModeTabs v-model="mode" :modes="modes" />
      <label class="visually-hidden" for="base64-input">
        Base64 输入
      </label>
      <textarea
        id="base64-input"
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
