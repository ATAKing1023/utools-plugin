import { describe, expect, it } from 'vitest'
import { isTextEntryTarget } from './keyboard.js'

describe('keyboard helpers', () => {
  it('detects native and contenteditable text entry targets', () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <input id="input">
      <textarea id="textarea"></textarea>
      <select id="select"></select>
      <div id="editable" contenteditable="true"><span id="child"></span></div>
      <div id="readonly" contenteditable="false"></div>
    `
    document.body.append(host)

    expect(isTextEntryTarget(host.querySelector('#input'))).toBe(true)
    expect(isTextEntryTarget(host.querySelector('#textarea'))).toBe(true)
    expect(isTextEntryTarget(host.querySelector('#select'))).toBe(true)
    expect(isTextEntryTarget(host.querySelector('#child'))).toBe(true)
    expect(isTextEntryTarget(host.querySelector('#readonly'))).toBe(false)
    expect(isTextEntryTarget(host)).toBe(false)
    expect(isTextEntryTarget(null)).toBe(false)

    host.remove()
  })
})
