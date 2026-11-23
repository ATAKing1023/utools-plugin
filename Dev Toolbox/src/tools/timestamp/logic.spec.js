import { describe, expect, it } from 'vitest'
import {
  INVALID_TIMESTAMP_MESSAGE,
  buildTimestampRows,
  formatDateTime,
  formatLocalTimezoneLabel,
  formatOffsetKey,
  getInitialTimestampInput,
  parseTimestampInput,
  sanitizeTimezoneOffsets
} from './logic.js'
import { TIMEZONE_TABLE } from './timezones.js'

const ORACLE_MILLISECONDS = 1795398191926

describe('timestamp parsing', () => {
  it('distinguishes 10-digit seconds from 13-digit milliseconds', () => {
    const seconds = parseTimestampInput('1795398191')
    const milliseconds = parseTimestampInput('1795398191926')

    expect(seconds).toMatchObject({
      status: 'ok',
      unit: 'seconds',
      timestamp: 1795398191000
    })
    expect(milliseconds).toMatchObject({
      status: 'ok',
      unit: 'milliseconds',
      timestamp: ORACLE_MILLISECONDS
    })
    expect(parseTimestampInput('-1500')).toMatchObject({
      status: 'ok',
      unit: 'seconds',
      timestamp: -1500000
    })
  })

  it('accepts JavaScript-parseable date strings', () => {
    const parsed = parseTimestampInput('2026-11-23T09:43:11+08:00')
    expect(parsed.status).toBe('ok')
    expect(parsed.timestamp).toBe(1795398191000)
    expect(parsed.unit).toBe('date')
  })

  it('returns empty for blank input and an error for invalid input', () => {
    expect(parseTimestampInput('')).toEqual({ status: 'empty' })
    expect(parseTimestampInput('   ')).toEqual({ status: 'empty' })
    expect(parseTimestampInput(null)).toEqual({ status: 'empty' })
    expect(parseTimestampInput('not a date')).toEqual({
      status: 'error',
      message: INVALID_TIMESTAMP_MESSAGE
    })
    expect(parseTimestampInput('9999999999999999')).toEqual({
      status: 'error',
      message: INVALID_TIMESTAMP_MESSAGE
    })
  })
})

describe('timestamp formatting', () => {
  it('matches both verified timezone oracles', () => {
    expect(formatDateTime(ORACLE_MILLISECONDS, 'Asia/Shanghai')).toBe(
      '2026-11-23 09:43:11'
    )
    expect(formatDateTime(ORACLE_MILLISECONDS, 'UTC')).toBe(
      '2026-11-23 01:43:11'
    )
  })

  it('formats every table entry with its IANA timezone', () => {
    for (const entry of Object.values(TIMEZONE_TABLE)) {
      expect(formatDateTime(ORACLE_MILLISECONDS, entry.utc)).toMatch(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
      )
    }
  })

  it('uses table text for known local offsets and a safe fallback otherwise', () => {
    expect(formatLocalTimezoneLabel(-480)).toBe(
      'UTC+8 中国标准时间(本地时间)'
    )
    expect(formatLocalTimezoneLabel(-330)).toBe(
      'UTC+5:30 印度标准时间(本地时间)'
    )
    expect(formatLocalTimezoneLabel(0)).toBe(
      'UTC+0 本地时间(本地时间)'
    )
    expect(formatLocalTimezoneLabel(30)).toBe(
      'UTC-0:30 本地时间(本地时间)'
    )
  })

  it('formats signed offsets with optional minutes', () => {
    expect(formatOffsetKey(0)).toBe('+0')
    expect(formatOffsetKey(-210)).toBe('-3:30')
    expect(formatOffsetKey(345)).toBe('+5:45')
    expect(formatOffsetKey(600)).toBe('+10')
  })
})

describe('timestamp rows', () => {
  it('renders the five standard rows in contract order', () => {
    const result = buildTimestampRows(ORACLE_MILLISECONDS, [], {
      localOffsetMinutes: -480
    })

    expect(result.status).toBe('ok')
    expect(result.rows).toHaveLength(5)
    expect(result.rows.map((row) => row.label)).toEqual([
      'UTC+8 中国标准时间(本地时间)',
      'UTC+8 中国标准时间(本地时间),日期',
      '时间戳(秒)',
      '时间戳(毫秒)',
      '标准时间(UTC)'
    ])
    expect(result.rows[2].value).toBe('1795398191')
    expect(result.rows[3].value).toBe('1795398191926')
    expect(result.rows[4].value).toBe('2026-11-23 01:43:11')
  })

  it('adds selected extra timezones in table order', () => {
    const result = buildTimestampRows(
      ORACLE_MILLISECONDS,
      ['+14', '-11', '+1'],
      { localOffsetMinutes: -480 }
    )
    const extras = result.rows.slice(5)

    expect(extras.map((row) => row.label)).toEqual([
      'UTC-11 中途岛标准时间',
      'UTC+1 欧洲中部时区',
      'UTC+14 太平洋标准时间D'
    ])
    expect(extras.map((row) => row.value)).toEqual([
      '2026-11-22 14:43:11',
      '2026-11-23 02:43:11',
      '2026-11-23 15:43:11'
    ])
  })

  it('returns no rows for empty or invalid input', () => {
    expect(buildTimestampRows('   ')).toEqual({
      status: 'empty',
      message: undefined,
      rows: []
    })
    expect(buildTimestampRows('garbage')).toEqual({
      status: 'error',
      message: INVALID_TIMESTAMP_MESSAGE,
      rows: []
    })
  })

  it('filters corrupt persisted values and keeps table order', () => {
    expect(
      sanitizeTimezoneOffsets([
        '+1',
        7,
        null,
        'bogus',
        '+1',
        '-5',
        {},
        '+14'
      ])
    ).toEqual(['-5', '+1', '+14'])
    expect(sanitizeTimezoneOffsets('+1')).toEqual([])
    expect(sanitizeTimezoneOffsets({ value: '+1' })).toEqual([])
  })
})

describe('timestamp entry action', () => {
  it('initializes from parseable regex and over payloads', () => {
    expect(
      getInitialTimestampInput(
        { type: 'regex', payload: ' 1795398191926 ' },
        1
      )
    ).toBe('1795398191926')
    expect(
      getInitialTimestampInput(
        { type: 'over', payload: '2026-11-23T09:43:11+08:00' },
        1
      )
    ).toBe('2026-11-23T09:43:11+08:00')
  })

  it('falls back to the current millisecond timestamp', () => {
    expect(
      getInitialTimestampInput(
        { type: 'regex', payload: 'not a date' },
        123456789
      )
    ).toBe('123456789')
    expect(
      getInitialTimestampInput(
        { type: 'text', payload: '1795398191926' },
        123456789
      )
    ).toBe('123456789')
    expect(getInitialTimestampInput(null, 42)).toBe('42')
  })
})
