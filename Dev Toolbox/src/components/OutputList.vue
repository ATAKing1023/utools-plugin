<script setup>
import { useCopyShortcuts } from '../composables/useCopyShortcuts.js'
import { copyValue } from '../lib/copy.js'
import OutputRow from './OutputRow.vue'

const props = defineProps({
  rows: {
    type: Array,
    default: () => []
  }
})

function copyRow(index) {
  const row = props.rows[index]
  if (!row) return
  copyValue(row.value)
}

useCopyShortcuts(copyRow)
</script>

<template>
  <div class="output-list">
    <OutputRow
      v-for="(row, index) in rows"
      :key="index"
      :label="row.label"
      :value="row.value"
      :index="index + 1"
      @copy="copyRow(index)"
    />
  </div>
</template>

<style scoped>
.output-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
</style>
