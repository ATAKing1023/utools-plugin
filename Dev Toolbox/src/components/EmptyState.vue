<script setup>
defineProps({
  message: {
    type: String,
    default: '暂无内容'
  }
})
</script>

<template>
  <div class="empty-state" data-state="empty" role="status">
    <span class="empty-state__mark" aria-hidden="true"></span>
    <p class="empty-state__message">{{ message }}</p>
  </div>
</template>

<style scoped>
.empty-state {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 20px;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  background: var(--surface-subtle);
  text-align: center;
}

.empty-state__mark {
  width: 34px;
  height: 28px;
  border: 2px solid var(--text-muted);
  border-radius: 6px;
  opacity: 0.55;
}

.empty-state__message {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.6;
}
</style>
