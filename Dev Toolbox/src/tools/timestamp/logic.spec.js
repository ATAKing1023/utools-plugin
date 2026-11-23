import { describe, expect, it } from 'vitest'
import {
  AUTO_DETECTION_ERROR_MESSAGE,
  EXCEL_OUT_OF_RANGE_MESSAGE,
  INPUT_TYPE_AUTO,
  INPUT_TYPE_DATETIME_TEXT,
  INPUT_TYPE_EXCEL,
  INPUT_TYPE_UNIX_MILLISECONDS,
  INPUT_TYPE_UNIX_SECONDS,
  buildTimestampRows,
  formatDateTime,
  formatLocalTimezoneLabel,
  formatOffsetKey,
  getInitialTimestampInput,
  parseTimestampInput,
  sanitizeTimezoneOffsets
} from './logic.js'
import {
  excelSerialToTimestamp,
  formatExcelSerial,
  timestampToExcelSerial
} from './excel.js'
import { TIMEZONE_TABLE } from './timezones.js'

const ORACLE_MILLISECONDS = 1795398191926
const ORACLE_SECONDS = 1795398191

function expectOk(result) {
  expect(result.status).toBe('ok')
  return result
}

describe('timestamp parsing and auto detection', () => {
  it('distinguishes 10-digit seconds from 13-digit milliseconds', () => {
    const seconds = expectOk(parseTimestampInput(String(ORACLE_SECONDS)))
    const milliseconds = expectOk(
      parseTimestampInput(String(ORACLE_MILLISECONDS))
    )

    expect(seconds).toMatchObject({
      unit: 'seconds',
      timestamp: 1795398191000,
      parserType: INPUT_TYPE_UNIX_SECONDS,
      detectedType: INPUT_TYPE_UNIX_SECONDS,
      isManual: false,
      statusText: '自动识别：Unix 秒'
    })
    expect(milliseconds).toMatchObject({
      unit: 'milliseconds',
      timestamp: ORACLE_MILLISECONDS,
      parserType: INPUT_TYPE_UNIX_MILLISECONDS,
      detectedType: INPUT_TYPE_UNIX_MILLISECONDS,
      isManual: false,
      statusText: '自动识别：Unix 毫秒'
    })
    expect(parseTimestampInput('-1500')).toMatchObject({
      status: 'ok',
      unit: 'seconds',
      timestamp: -1500000,
      parserType: INPUT_TYPE_UNIX_SECONDS
    })
  })

  it('applies the Excel-first auto precedence table', () => {
    expect(parseTimestampInput('1795398191926')).toMatchObject({
      status: 'ok',
      parserType: INPUT_TYPE_UNIX_MILLISECONDS,
      timestamp: 1795398191926
    })
    expect(parseTimestampInput('1795398191')).toMatchObject({
      status: 'ok',
      parserType: INPUT_TYPE_UNIX_SECONDS,
      timestamp: 1795398191000
    })
    expect(parseTimestampInput('45000')).toMatchObject({
      status: 'ok',
      parserType: INPUT_TYPE_EXCEL,
      timestamp: excelSerialToTimestamp(45000),
      alternativeType: INPUT_TYPE_UNIX_SECONDS,
      statusText: '自动识别：Excel 序列日期 · 也可解释为 Unix 秒'
    })
    expect(parseTimestampInput('45000.5')).toMatchObject({
      status: 'ok',
      parserType: INPUT_TYPE_EXCEL,
      timestamp: excelSerialToTimestamp(45000.5),
      alternativeType: INPUT_TYPE_UNIX_SECONDS
    })
    expect(parseTimestampInput('0')).toMatchObject({
      status: 'ok',
      parserType: INPUT_TYPE_UNIX_SECONDS,
      timestamp: 0,
      alternativeType: null,
      statusText: '自动识别：Unix 秒'
    })
    expect(parseTimestampInput('0.5')).toMatchObject({
      status: 'ok',
      parserType: INPUT_TYPE_EXCEL,
      timestamp: excelSerialToTimestamp(0.5),
      alternativeType: INPUT_TYPE_UNIX_SECONDS
    })
    expect(parseTimestampInput('60')).toMatchObject({
      status: 'ok',
      parserType: INPUT_TYPE_UNIX_SECONDS,
      timestamp: 60000,
      alternativeType: null
    })
    expect(parseTimestampInput('-1500')).toMatchObject({
      status: 'ok',
      parserType: INPUT_TYPE_UNIX_SECONDS,
      timestamp: -1500000
    })
  })

  it('detects ISO, RFC 3339, RFC 7231, and local date-time text', () => {
    const iso = expectOk(
      parseTimestampInput('2026-11-23T09:43:11.926+08:00')
    )
    const rfc3339 = expectOk(
      parseTimestampInput('2026-11-23T01:43:11.926Z')
    )
    const rfc7231 = expectOk(
      parseTimestampInput('Mon, 23 Nov 2026 01:43:11 GMT')
    )
    const local = expectOk(
      parseTimestampInput('2026-11-23T09:43:11.926')
    )

    expect(iso).toMatchObject({
      parserType: INPUT_TYPE_DATETIME_TEXT,
      detectedType: INPUT_TYPE_DATETIME_TEXT,
      unit: 'date',
      timestamp: ORACLE_MILLISECONDS,
      statusText: '自动识别：日期时间文本'
    })
    expect(rfc3339.timestamp).toBe(ORACLE_MILLISECONDS)
    expect(rfc7231.timestamp).toBe(1795398191000)
    expect(local.parserType).toBe(INPUT_TYPE_DATETIME_TEXT)
    expect(local.timestamp).toBe(
      new Date(2026, 10, 23, 9, 43, 11, 926).getTime()
    )
  })

  it('reports auto no-match for garbage and out-of-range numerics', () => {
    for (const input of [
      'not a date',
      '9999999999999999',
      '1e999',
      'Infinity'
    ]) {
      expect(parseTimestampInput(input)).toMatchObject({
        status: 'error',
        message: AUTO_DETECTION_ERROR_MESSAGE,
        statusText: AUTO_DETECTION_ERROR_MESSAGE,
        isManual: false,
        parserType: null
      })
    }
  })

  it('keeps empty input in the existing empty state', () => {
    for (const input of ['', '   ', null, undefined]) {
      expect(parseTimestampInput(input)).toMatchObject({
        status: 'empty',
        statusText: '自动识别：等待输入',
        isManual: false
      })
    }
  })
})

describe('manual parser override', () => {
  it('uses each manual parser for the same numeric input', () => {
    const auto = expectOk(parseTimestampInput('45000'))
    const seconds = expectOk(
      parseTimestampInput('45000', {
        inputType: INPUT_TYPE_UNIX_SECONDS
      })
    )
    const milliseconds = expectOk(
      parseTimestampInput('45000', {
        inputType: INPUT_TYPE_UNIX_MILLISECONDS
      })
    )
    const excel = expectOk(
      parseTimestampInput('45000', {
        inputType: INPUT_TYPE_EXCEL
      })
    )
    const datetime = parseTimestampInput('45000', {
      inputType: INPUT_TYPE_DATETIME_TEXT
    })

    expect(auto.timestamp).toBe(excelSerialToTimestamp(45000))
    expect(seconds.timestamp).toBe(45000000)
    expect(milliseconds.timestamp).toBe(45000)
    expect(excel.timestamp).toBe(excelSerialToTimestamp(45000))
    expect(datetime).toMatchObject({
      status: 'error',
      parserType: INPUT_TYPE_DATETIME_TEXT,
      detectedType: INPUT_TYPE_EXCEL,
      isManual: true,
      statusText: '手动解析：日期时间文本 · 自动检测：Excel 序列日期'
    })
    expect(datetime.message).toContain('日期时间文本解析失败')
  })

  it('shows manual and detected type metadata without reclassification', () => {
    const manualExcel = expectOk(
      parseTimestampInput('45000.5', {
        inputType: INPUT_TYPE_EXCEL
      })
    )
    const manualSeconds = expectOk(
      parseTimestampInput('45000', {
        inputType: INPUT_TYPE_UNIX_SECONDS
      })
    )

    expect(manualExcel).toMatchObject({
      parserType: INPUT_TYPE_EXCEL,
      effectiveType: INPUT_TYPE_EXCEL,
      detectedType: INPUT_TYPE_EXCEL,
      isManual: true,
      alternativeType: null,
      statusText: '手动解析：Excel 序列日期 · 自动检测：Excel 序列日期'
    })
    expect(manualSeconds).toMatchObject({
      parserType: INPUT_TYPE_UNIX_SECONDS,
      detectedType: INPUT_TYPE_EXCEL,
      isManual: true,
      statusText: '手动解析：Unix 秒 · 自动检测：Excel 序列日期'
    })
  })

  it('keeps auto as the default and supports explicit Auto selection', () => {
    expect(parseTimestampInput('45000')).toMatchObject({
      status: 'ok',
      parserType: INPUT_TYPE_EXCEL,
      isManual: false
    })
    expect(
      parseTimestampInput('45000', { inputType: INPUT_TYPE_AUTO })
    ).toMatchObject({
      status: 'ok',
      parserType: INPUT_TYPE_EXCEL,
      isManual: false
    })
  })

  it('returns parser-specific manual errors for each selected parser', () => {
    const seconds = parseTimestampInput('not a date', {
      inputType: INPUT_TYPE_UNIX_SECONDS
    })
    const milliseconds = parseTimestampInput('1e999', {
      inputType: INPUT_TYPE_UNIX_MILLISECONDS
    })
    const excelText = parseTimestampInput('not a date', {
      inputType: INPUT_TYPE_EXCEL
    })
    const excelNegative = parseTimestampInput('-1', {
      inputType: INPUT_TYPE_EXCEL
    })
    const excelFictitious = parseTimestampInput('60', {
      inputType: INPUT_TYPE_EXCEL
    })
    const excelOverflow = parseTimestampInput('2958466', {
      inputType: INPUT_TYPE_EXCEL
    })
    const datetime = parseTimestampInput('not a date', {
      inputType: INPUT_TYPE_DATETIME_TEXT
    })

    expect(seconds).toMatchObject({
      status: 'error',
      parserType: INPUT_TYPE_UNIX_SECONDS,
      isManual: true
    })
    expect(seconds.message).toContain('Unix 秒解析失败')
    expect(milliseconds.message).toContain('Unix 毫秒解析失败')
    expect(excelText.message).toContain('Excel 序列日期解析失败')
    expect(excelNegative.message).toContain('不支持负数序列')
    expect(excelFictitious.message).toContain('虚构日期')
    expect(excelFictitious.message).toContain('序列 60')
    expect(excelOverflow.message).toContain('超出 1900 日期系统范围')
    expect(datetime.message).toContain('日期时间文本解析失败')
    expect(excelNegative.message).not.toBe(excelFictitious.message)
    expect(excelFictitious.message).not.toBe(excelOverflow.message)
  })

  it('retains the selected parser result when the input changes', () => {
    const first = expectOk(
      parseTimestampInput('45000', {
        inputType: INPUT_TYPE_UNIX_SECONDS
      })
    )
    const second = expectOk(
      parseTimestampInput('45001', {
        inputType: INPUT_TYPE_UNIX_SECONDS
      })
    )
    const error = parseTimestampInput('now invalid', {
      inputType: INPUT_TYPE_UNIX_SECONDS
    })

    expect(first.parserType).toBe(INPUT_TYPE_UNIX_SECONDS)
    expect(second.parserType).toBe(INPUT_TYPE_UNIX_SECONDS)
    expect(second.isManual).toBe(true)
    expect(error.parserType).toBe(INPUT_TYPE_UNIX_SECONDS)
    expect(error.isManual).toBe(true)
  })

  it('accepts fractional Unix seconds manually', () => {
    const parsed = expectOk(
      parseTimestampInput('1.5', {
        inputType: INPUT_TYPE_UNIX_SECONDS
      })
    )
    expect(parsed.timestamp).toBe(1500)
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
    expect(formatLocalTimezoneLabel(0)).toBe('UTC+0 本地时间(本地时间)')
    expect(formatLocalTimezoneLabel(30)).toBe('UTC-0:30 本地时间(本地时间)')
  })

  it('formats signed offsets with optional minutes', () => {
    expect(formatOffsetKey(0)).toBe('+0')
    expect(formatOffsetKey(-210)).toBe('-3:30')
    expect(formatOffsetKey(345)).toBe('+5:45')
    expect(formatOffsetKey(600)).toBe('+10')
  })
})

describe('timestamp rows', () => {
  it('keeps the five standard rows and appends Excel as row 6', () => {
    const result = buildTimestampRows(ORACLE_MILLISECONDS, [], {
      localOffsetMinutes: -480
    })

    expect(result.status).toBe('ok')
    expect(result.rows).toHaveLength(6)
    expect(result.rows.map((row) => row.label)).toEqual([
      'UTC+8 中国标准时间(本地时间)',
      'UTC+8 中国标准时间(本地时间),日期',
      '时间戳(秒)',
      '时间戳(毫秒)',
      '标准时间(UTC)',
      'Excel 序列日期'
    ])
    expect(result.rows[2].value).toBe('1795398191')
    expect(result.rows[3].value).toBe('1795398191926')
    expect(result.rows[4].value).toBe('2026-11-23 01:43:11')
    expect(result.rows[5].value).toBe(
      formatExcelSerial(timestampToExcelSerial(ORACLE_MILLISECONDS))
    )
    expect(result.excelNote).toBeNull()
  })

  it('places all selected extra timezones before the Excel row', () => {
    const result = buildTimestampRows(
      ORACLE_MILLISECONDS,
      ['+14', '-11', '+1'],
      { localOffsetMinutes: -480 }
    )
    const labels = result.rows.map((row) => row.label)
    const extras = result.rows.slice(5, 8)

    expect(result.rows).toHaveLength(9)
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
    expect(labels.at(-1)).toBe('Excel 序列日期')
  })

  it('produces applicable standard and Excel outputs for every input type', () => {
    const iso = buildTimestampRows('2026-11-23T09:43:11.926+08:00')
    const unix = buildTimestampRows('1795398191926')
    const excel = buildTimestampRows('45000.5', [], {
      inputType: INPUT_TYPE_EXCEL
    })

    for (const result of [iso, unix, excel]) {
      expect(result.status).toBe('ok')
      expect(result.rows).toHaveLength(6)
      expect(result.rows.at(-1).label).toBe('Excel 序列日期')
    }
    expect(iso.rows[3].value).toBe('1795398191926')
    expect(iso.rows.at(-1).value).toBe('46349.404999144')
    expect(unix.rows.at(-1).value).toBe('46349.404999144')
    expect(excel.rows.at(-1).value).toBe('45000.5')
  })

  it('omits the Excel row and adds a note when unrepresentable', () => {
    const ancient = new Date(1800, 0, 1, 12).getTime()
    const result = buildTimestampRows(String(ancient), [], {
      inputType: INPUT_TYPE_UNIX_MILLISECONDS
    })

    expect(result.status).toBe('ok')
    expect(result.rows).toHaveLength(5)
    expect(result.rows.map((row) => row.label)).not.toContain(
      'Excel 序列日期'
    )
    expect(result.excelNote).toBe(EXCEL_OUT_OF_RANGE_MESSAGE)
  })

  it('round-trips Excel serial input and output through milliseconds', () => {
    const first = expectOk(
      parseTimestampInput('46349.404999144', {
        inputType: INPUT_TYPE_EXCEL
      })
    )
    const serial = formatExcelSerial(timestampToExcelSerial(first.timestamp))
    const second = expectOk(
      parseTimestampInput(serial, {
        inputType: INPUT_TYPE_EXCEL
      })
    )

    expect(serial).toBe('46349.404999144')
    expect(second.timestamp).toBe(first.timestamp)
    expect(second.timestamp).toBe(1795398191926)
  })

  it('returns no rows for empty or invalid input', () => {
    expect(buildTimestampRows('   ')).toMatchObject({
      status: 'empty',
      rows: [],
      statusText: '自动识别：等待输入'
    })
    expect(buildTimestampRows('garbage')).toMatchObject({
      status: 'error',
      message: AUTO_DETECTION_ERROR_MESSAGE,
      rows: []
    })
    expect(
      buildTimestampRows('60', [], { inputType: INPUT_TYPE_EXCEL })
    ).toMatchObject({
      status: 'error',
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
    expect(
      getInitialTimestampInput(
        { type: 'regex', payload: ' 45000.5 ' },
        1
      )
    ).toBe('45000.5')
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
