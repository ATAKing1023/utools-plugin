import { onBeforeUnmount, onMounted } from 'vue'
import { isMacOS } from '../lib/utools.js'

export function useCopyShortcuts(onCopy) {
  const handleKeydown = (event) => {
    const match = /^Digit([1-9])$/.exec(event.code || '')
    if (!match) return

    const hasActivationModifier = isMacOS() ? event.metaKey : event.altKey
    if (!hasActivationModifier || typeof onCopy !== 'function') return

    event.preventDefault()
    event.stopPropagation()
    onCopy(Number(match[1]) - 1)
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleKeydown)
  })
}
