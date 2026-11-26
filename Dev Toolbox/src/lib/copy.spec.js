import { describe, expect, it } from 'vitest'
import {
  DISPLAY_VALUE_LIMIT,
  copyValue,
  formatDisplayValue,
  getShortcutLabel
} from './copy.js'
import {
  copyText,
  dbGet,
  dbSet,
  hideMainWindow,
  isMacOS,
  onPluginEnter,
  onPluginOut
} from './utools.js'
import { installUtoolsDouble } from '../test/utoolsDouble.js'

describe('copy helpers', () => {
  it('truncates display values at 10000 characters but keeps the full copy value', () => {
    const exactLimit = 'a'.repeat(DISPLAY_VALUE_LIMIT)
    const overLimit = `${exactLimit}b`

    expect(formatDisplayValue(exactLimit)).toBe(exactLimit)
    expect(formatDisplayValue(overLimit)).toBe(
      `${'a'.repeat(DISPLAY_VALUE_LIMIT)}......`
    )

    const double = installUtoolsDouble()
    copyValue(overLimit)

    expect(double.calls.copyText).toEqual([overLimit])
    expect(double.events.map((event) => event.name)).toEqual([
      'hideMainWindow',
      'copyText'
    ])
  })

  it('uses Alt/Cmd labels for 1..9 and the copy fallback for other indexes', () => {
    expect(getShortcutLabel(1, false)).toBe('Alt+1')
    expect(getShortcutLabel(9, false)).toBe('Alt+9')
    expect(getShortcutLabel(1, true)).toBe('Cmd+1')
    expect(getShortcutLabel(9, true)).toBe('Cmd+9')
    expect(getShortcutLabel(10, false)).toBe('复制')
    expect(getShortcutLabel(10, true)).toBe('复制')
    expect(getShortcutLabel(0, false)).toBe('复制')
  })

  it('can copy without hiding the current window', () => {
    const double = installUtoolsDouble()
    copyValue('{ "action": "copy" }', { hideWindow: false })

    expect(double.calls.copyText).toEqual(['{ "action": "copy" }'])
    expect(double.calls.hideMainWindow).toEqual([])
    expect(double.events.map((event) => event.name)).toEqual(['copyText'])
  })
})

describe('safe uTools wrappers', () => {
  it('never throws when window.utools or a method is absent', () => {
    delete window.utools

    expect(isMacOS()).toBe(false)
    expect(copyText('text')).toBe(false)
    expect(hideMainWindow()).toBe(false)
    expect(dbGet('key')).toBeNull()
    expect(dbSet('key', 'value')).toBe(false)
    expect(onPluginEnter(() => {})).toBe(false)
    expect(onPluginOut(() => {})).toBe(false)
  })
})
