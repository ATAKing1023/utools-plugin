<script setup>
defineProps({
  entries: {
    type: Array,
    default: () => []
  }
})
</script>

<template>
  <section class="claims" aria-labelledby="jwt-claims-title">
    <div class="claims__heading">
      <h2 id="jwt-claims-title" class="claims__title">标准声明</h2>
      <span class="claims__hint">仅检查声明字段，不代表签名验证</span>
    </div>

    <p v-if="!entries.length" class="claims__empty">
      未检测到可识别的标准声明。
    </p>

    <dl v-else class="claims__list">
      <div
        v-for="entry in entries"
        :key="entry.name"
        class="claims__row"
        :data-claim="entry.name"
        :data-state="entry.state"
      >
        <dt class="claims__name">{{ entry.name }}</dt>
        <dd class="claims__detail">
          <span class="claims__value">{{ entry.value }}</span>
          <span class="claims__message" :data-state="entry.state">
            {{ entry.message }}
          </span>
        </dd>
      </div>
    </dl>

    <p class="claims__note">
      声明时间检查不等于签名验证，也不构成发行方或受众授权。
    </p>
  </section>
</template>

<style scoped>
.claims {
  display: grid;
  gap: 9px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.claims__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
}

.claims__title {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 650;
}

.claims__hint,
.claims__empty,
.claims__note {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.55;
}

.claims__list {
  display: grid;
  gap: 7px;
  margin: 0;
}

.claims__row {
  display: grid;
  grid-template-columns: minmax(44px, max-content) minmax(0, 1fr);
  gap: 4px 10px;
  align-items: start;
  min-width: 0;
  padding-top: 7px;
  border-top: 1px solid var(--border);
}

.claims__row:first-child {
  padding-top: 0;
  border-top: 0;
}

.claims__name {
  margin: 0;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.55;
}

.claims__detail {
  display: grid;
  gap: 2px;
  min-width: 0;
  margin: 0;
}

.claims__value {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.claims__message {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.claims__message[data-state='warning'] {
  color: var(--danger-text);
}

@media (max-width: 380px) {
  .claims__row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
