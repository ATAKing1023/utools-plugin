<script setup>
import { inject } from 'vue'
import ToolFrame from '../../components/ToolFrame.vue'
import { FEATURES } from '../../lib/features.js'

const navigateToTool = inject('navigateToTool', null)
const tools = FEATURES.filter((feature) => feature.code !== 'home')
</script>

<template>
  <ToolFrame title="开发工具箱" description="选择一个工具开始使用">
    <div class="tool-grid" data-tool="home">
      <button
        v-for="feature in tools"
        :key="feature.code"
        type="button"
        class="tool-grid__item"
        :data-tool-code="feature.code"
        @click="navigateToTool?.(feature.code)"
      >
        <span class="tool-grid__name">{{ feature.name }}</span>
        <span class="tool-grid__desc">{{ feature.description }}</span>
      </button>
    </div>
  </ToolFrame>
</template>

<style scoped>
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 10px;
  min-width: 0;
}

.tool-grid__item {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--surface);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.tool-grid__item:hover {
  border-color: var(--accent);
  background: var(--surface-hover);
}

.tool-grid__item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.tool-grid__name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.tool-grid__desc {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

@media (max-width: 520px) {
  .tool-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
