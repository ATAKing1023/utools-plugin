import { copyText, hideMainWindow, isMacOS } from './utools.js'

export const DISPLAY_VALUE_LIMIT = 10000

export function stringifyValue(value) {
  return String(value)
}

export function formatDisplayValue(value, limit = DISPLAY_VALUE_LIMIT) {
  const text = stringifyValue(value)
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}......`
}

export function getShortcutLabel(index, macOS = isMacOS()) {
  if (!Number.isInteger(index) || index < 1 || index > 9) return '复制'
  return `${macOS ? 'Cmd' : 'Alt'}+${index}`
}

export function copyValue(value, options = {}) {
  const fullValue = stringifyValue(value)
  const { hideWindow = true } = options
  if (hideWindow) hideMainWindow()
  return copyText(fullValue)
}
