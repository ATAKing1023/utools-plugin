<script setup>
import { computed, onMounted, ref, shallowRef } from 'vue'
import EmptyState from './components/EmptyState.vue'
import { getFeature } from './lib/features.js'
import { onPluginEnter, onPluginOut } from './lib/utools.js'
import { resolveTool } from './tools/registry.js'

const routeCode = ref('')
const enterAction = shallowRef(null)

const feature = computed(() => getFeature(routeCode.value))
const selectedTool = computed(() => resolveTool(routeCode.value))

const emptyMessage = computed(() => {
  if (!enterAction.value) return '请从 uTools 功能入口打开工具'
  if (typeof enterAction.value.code !== 'string' || !enterAction.value.code) {
    return '未收到有效的功能编码'
  }
  if (!feature.value) return `未知功能：${routeCode.value}`
  return `${feature.value.name} 尚未加载`
})

onMounted(() => {
  onPluginEnter((action) => {
    enterAction.value = action && typeof action === 'object' ? action : null
    routeCode.value =
      enterAction.value && typeof enterAction.value.code === 'string'
        ? enterAction.value.code
        : ''
  })

  onPluginOut(() => {
    routeCode.value = ''
    enterAction.value = null
  })
})
</script>

<template>
  <main class="app-shell" :data-route="routeCode || 'empty'">
    <component
      :is="selectedTool"
      v-if="selectedTool"
      :key="routeCode"
      :action="enterAction"
      :enter-action="enterAction"
    />
    <EmptyState v-else :message="emptyMessage" />
  </main>
</template>
