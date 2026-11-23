import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { installUtoolsDouble } from '../test/utoolsDouble.js'
import OutputList from './OutputList.vue'

function dispatchShortcut(code, { altKey = false, metaKey = false } = {}) {
  const event = new KeyboardEvent('keydown', {
    code,
    altKey,
    metaKey,
    bubbles: true,
    cancelable: true
  })
  document.dispatchEvent(event)
  return event
}

function makeRows(count = 9) {
  return Array.from({ length: count }, (_, index) => ({
    label: `标签 ${index + 1}`,
    value: `value-${index + 1}`
  }))
}

describe('OutputList', () => {
  it('renders labels, values, and the correct copy handles', () => {
    installUtoolsDouble({ macOS: false })
    const wrapper = mount(OutputList, { props: { rows: makeRows(10) } })
    const handles = wrapper.findAll('.output-row__copy')

    expect(wrapper.findAll('.output-row')).toHaveLength(10)
    expect(wrapper.find('.output-row__label').text()).toBe('标签 1')
    expect(wrapper.find('.output-row__value').text()).toBe('value-1')
    expect(handles).toHaveLength(10)
    expect(handles[0].text()).toBe('Alt+1')
    expect(handles[8].text()).toBe('Alt+9')
    expect(handles[9].text()).toBe('复制')
  })

  it('copies the exact full value on click after hiding the main window', async () => {
    const double = installUtoolsDouble({ macOS: false })
    const longValue = `${'x'.repeat(10000)}tail`
    const wrapper = mount(OutputList, {
      props: {
        rows: [
          { label: '长文本', value: longValue },
          { label: '第二行', value: 'second' }
        ]
      }
    })

    expect(wrapper.find('.output-row__value').text()).toBe(
      `${'x'.repeat(10000)}......`
    )
    await wrapper.findAll('.output-row__copy')[0].trigger('click')

    expect(double.calls.copyText).toEqual([longValue])
    expect(double.events.map((event) => event.name)).toEqual([
      'hideMainWindow',
      'copyText'
    ])
  })

  it('handles Alt+1 and Alt+9 and ignores Alt+0', () => {
    const double = installUtoolsDouble({ macOS: false })
    mount(OutputList, { props: { rows: makeRows(9) } })

    const firstEvent = dispatchShortcut('Digit1', { altKey: true })
    const ninthEvent = dispatchShortcut('Digit9', { altKey: true })
    const zeroEvent = dispatchShortcut('Digit0', { altKey: true })

    expect(double.calls.copyText).toEqual(['value-1', 'value-9'])
    expect(firstEvent.defaultPrevented).toBe(true)
    expect(ninthEvent.defaultPrevented).toBe(true)
    expect(zeroEvent.defaultPrevented).toBe(false)
  })

  it('uses Cmd on macOS, copies the same row for keyboard and click, and cleans up', async () => {
    const double = installUtoolsDouble({ macOS: true })
    const wrapper = mount(OutputList, {
      props: { rows: [{ label: 'macOS', value: 'same full value' }] }
    })

    expect(wrapper.find('.output-row__copy').text()).toBe('Cmd+1')
    dispatchShortcut('Digit1', { altKey: true })
    expect(double.calls.copyText).toEqual([])

    const metaEvent = dispatchShortcut('Digit1', { metaKey: true })
    await wrapper.find('.output-row__copy').trigger('click')

    expect(metaEvent.defaultPrevented).toBe(true)
    expect(double.calls.copyText).toEqual(['same full value', 'same full value'])

    wrapper.unmount()
    double.resetCalls()
    dispatchShortcut('Digit1', { metaKey: true })
    expect(double.calls.copyText).toEqual([])
  })
})
