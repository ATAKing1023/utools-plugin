<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  }
})
</script>

<template>
  <section class="tool-frame">
    <header class="tool-frame__header">
      <h1 class="tool-frame__title">{{ title }}</h1>
      <p v-if="description" class="tool-frame__description">{{ description }}</p>
    </header>
    <div class="tool-frame__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="tool-frame__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
.tool-frame {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.tool-frame__header {
  display: grid;
  gap: 4px;
}

.tool-frame__title {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 650;
  line-height: 1.35;
}

.tool-frame__description {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.tool-frame__body,
.tool-frame__footer {
  min-width: 0;
}
</style>
