import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { installUtoolsDouble } from '../../test/utoolsDouble.js'
import { TIMESTAMP_TIMEZONES_KEY } from '../../lib/preferences.js'
import TimestampTool from './index.vue'
import {
  INPUT_TYPE_EXCEL,
  INPUT_TYPE_OPTIONS,
  INPUT_TYPE_UNIX_MILLISECONDS,
  INPUT_TYPE_UNIX_SECONDS
} from './logic.js'
import { excelSerialToTimestamp } from './excel.js'

const TIMESTAMP_ACTION = {
  code: 'timestamp',
  type: 'regex',
  payload: '1795398191926',
  from: 'main'
}

function mountTool({
  action = TIMESTAMP_ACTION,
  initialStorage = {}
} = {}) {
  const double = installUtoolsDouble({
    macOS: false,
    initialStorage
  })
  const wrapper = mount(TimestampTool, {
    props: { action },
    attachTo: document.body
  })
  return { wrapper, double }
}

describe('TimestampTool parser controls', () => {
  it('auto-focuses the input and exposes the complete native selector', () => {
    const { wrapper } = mountTool()
    const input = wrapper.get('#timestamp-input')
    const select = wrapper.get('#timestamp-input-type')

    expect(document.activeElement).toBe(input.element)
    expect(input.element.selectionStart).toBe(0)
    expect(input.element.selectionEnd).toBe('1795398191926'.length)
    expect(select.element.value).toBe('auto')
    expect(
      select
        .findAll('option')
        .map((option) => option.text())
    ).toEqual(INPUT_TYPE_OPTIONS.map((option) => option.label))
    expect(
      select
        .findAll('option')
        .map((option) => option.element.value)
    ).toEqual(INPUT_TYPE_OPTIONS.map((option) => option.value))
    expect(
      wrapper.get('label[for="timestamp-input-type"]').text()
    ).toBe('输入类型')
    expect(select.attributes('aria-describedby')).toBe(
      'timestamp-parser-status'
    )
    expect(select.attributes('disabled')).toBeUndefined()
    expect(wrapper.get('#timestamp-parser-status').text()).toBe(
      '自动识别：Unix 毫秒'
    )
    expect(wrapper.text()).toContain('Excel 序列日期按本地时间解释')
  })

  it('shows auto ambiguity and appends the Excel row last', async () => {
    const { wrapper } = mountTool()
    await wrapper.get('#timestamp-input').setValue('45000')

    expect(wrapper.get('#timestamp-parser-status').text()).toBe(
      '自动识别：Excel 序列日期 · 也可解释为 Unix 秒'
    )
    expect(wrapper.findAll('.output-row')).toHaveLength(6)
    expect(wrapper.findAll('.output-row__label').at(-1).text()).toBe(
      'Excel 序列日期'
    )
    expect(wrapper.findAll('.output-row__value').at(-1).text()).toBe(
      '45000'
    )
  })

  it('keeps manual selection while input changes and reinterprets values', async () => {
    const { wrapper } = mountTool()
    const input = wrapper.get('#timestamp-input')
    const select = wrapper.get('#timestamp-input-type')

    await input.setValue('45000')
    await select.setValue(INPUT_TYPE_UNIX_SECONDS)

    expect(input.element.value).toBe('45000')
    expect(wrapper.get('#timestamp-parser-status').text()).toBe(
      '手动解析：Unix 秒 · 自动检测：Excel 序列日期'
    )
    expect(wrapper.findAll('.output-row__value')[3].text()).toBe(
      '45000000'
    )

    await input.setValue('45001')
    expect(select.element.value).toBe(INPUT_TYPE_UNIX_SECONDS)
    expect(wrapper.get('#timestamp-parser-status').text()).toContain(
      '手动解析：Unix 秒'
    )
    expect(wrapper.findAll('.output-row__value')[3].text()).toBe(
      '45001000'
    )

    await select.setValue(INPUT_TYPE_EXCEL)
    await input.setValue('45000.5')
    expect(wrapper.get('#timestamp-parser-status').text()).toBe(
      '手动解析：Excel 序列日期 · 自动检测：Excel 序列日期'
    )
    expect(wrapper.findAll('.output-row__value')[3].text()).toBe(
      String(excelSerialToTimestamp(45000.5))
    )
    expect(wrapper.findAll('.output-row__value').at(-1).text()).toBe(
      '45000.5'
    )
  })

  it('rejects numeric date text without silently reclassifying it', async () => {
    const { wrapper } = mountTool()
    const input = wrapper.get('#timestamp-input')

    await input.setValue('45000')
    await wrapper.get('#timestamp-input-type').setValue('datetime-text')

    expect(wrapper.get('[role="alert"]').text()).toContain(
      '日期时间文本解析失败'
    )
    expect(wrapper.get('#timestamp-parser-status').text()).toBe(
      '手动解析：日期时间文本 · 自动检测：Excel 序列日期'
    )
    expect(wrapper.findAll('.output-row')).toHaveLength(0)
  })

  it('shows distinct Excel errors and never leaves stale rows', async () => {
    const { wrapper } = mountTool()
    const input = wrapper.get('#timestamp-input')
    const select = wrapper.get('#timestamp-input-type')

    await select.setValue(INPUT_TYPE_EXCEL)

    await input.setValue('60')
    expect(wrapper.get('[role="alert"]').text()).toContain('虚构日期')
    expect(wrapper.findAll('.output-row')).toHaveLength(0)

    await input.setValue('-1')
    expect(wrapper.get('[role="alert"]').text()).toContain(
      '不支持负数序列'
    )
    expect(wrapper.findAll('.output-row')).toHaveLength(0)

    await input.setValue('2958466')
    expect(wrapper.get('[role="alert"]').text()).toContain(
      '超出 1900 日期系统范围'
    )
    expect(wrapper.findAll('.output-row')).toHaveLength(0)
  })

  it('keeps extra timezones before Excel and reads persisted selections', () => {
    const { wrapper, double } = mountTool({
      initialStorage: {
        [TIMESTAMP_TIMEZONES_KEY]: ['+1']
      }
    })
    const labels = wrapper.findAll('.output-row__label')

    expect(double.calls.dbGet).toContain(TIMESTAMP_TIMEZONES_KEY)
    expect(wrapper.findAll('.output-row')).toHaveLength(7)
    expect(labels[5].text()).toBe('UTC+1 欧洲中部时区')
    expect(labels[6].text()).toBe('Excel 序列日期')
  })

  it('shows a nearby note and omits Excel when local time is out of range', async () => {
    const { wrapper } = mountTool()
    const ancient = new Date(1800, 0, 1, 12).getTime()

    await wrapper
      .get('#timestamp-input-type')
      .setValue(INPUT_TYPE_UNIX_MILLISECONDS)
    await wrapper.get('#timestamp-input').setValue(String(ancient))

    expect(wrapper.findAll('.output-row')).toHaveLength(5)
    expect(
      wrapper
        .findAll('.output-row__label')
        .map((label) => label.text())
    ).not.toContain('Excel 序列日期')
    expect(wrapper.get('.timestamp-excel-note').text()).toContain(
      '超出 Excel 1900 日期系统范围'
    )
  })

  it('returns to Auto after unmount and remount', async () => {
    const { wrapper } = mountTool()
    await wrapper
      .get('#timestamp-input-type')
      .setValue(INPUT_TYPE_EXCEL)
    await wrapper.get('#timestamp-input').setValue('45000.5')

    wrapper.unmount()
    const remounted = mount(TimestampTool, {
      props: {
        action: {
          ...TIMESTAMP_ACTION,
          payload: '45000.5'
        }
      },
      attachTo: document.body
    })

    expect(remounted.get('#timestamp-input-type').element.value).toBe(
      'auto'
    )
    expect(remounted.get('#timestamp-parser-status').text()).toContain(
      '自动识别：Excel 序列日期'
    )
    expect(document.activeElement).toBe(
      remounted.get('#timestamp-input').element
    )
    remounted.unmount()
  })

  it('keeps the empty state while showing the selected manual parser', async () => {
    const { wrapper } = mountTool()
    const input = wrapper.get('#timestamp-input')

    await input.setValue('   ')
    expect(wrapper.get('[data-state="empty"]').exists()).toBe(true)
    expect(wrapper.findAll('.output-row')).toHaveLength(0)
    expect(wrapper.get('#timestamp-parser-status').text()).toBe(
      '自动识别：等待输入'
    )

    await wrapper.get('#timestamp-input-type').setValue(INPUT_TYPE_EXCEL)
    expect(wrapper.get('[data-state="empty"]').exists()).toBe(true)
    expect(wrapper.get('#timestamp-parser-status').text()).toBe(
      '手动解析：Excel 序列日期'
    )
  })
})
