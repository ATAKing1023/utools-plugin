<script setup>
defineProps({
  message: {
    type: String,
    default: '发生未知错误'
  }
})
</script>

<template>
  <div class="error-notice" role="alert">
    <strong class="error-notice__title">出错了</strong>
    <p class="error-notice__message">{{ message }}</p>
  </div>
</template>

<style scoped>
.error-notice {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid var(--danger-border);
  border-radius: 8px;
  background: var(--danger-surface);
  color: var(--danger-text);
  font-size: 13px;
  line-height: 1.55;
}

.error-notice__title {
  font-size: 13px;
}

.error-notice__message {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
