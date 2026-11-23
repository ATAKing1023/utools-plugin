<script setup>
import TreeNode from './TreeNode.vue'

defineProps({
  nodes: {
    type: Array,
    default: () => []
  },
  ariaLabel: {
    type: String,
    default: '结构树'
  }
})
</script>

<template>
  <div class="tree-view" role="tree" :aria-label="ariaLabel">
    <TreeNode
      v-for="(node, index) in nodes"
      :key="node?.id ?? index"
      :node="node"
      :depth="0"
    />
  </div>
</template>

<style scoped>
.tree-view {
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.55;
  overflow: auto;
}
</style>
