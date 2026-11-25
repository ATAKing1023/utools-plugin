import { TIMEZONE_KEYS, TIMEZONE_TABLE, getTimezoneEntry } from './timezones.js'
import {
  ExcelSerialError,
  excelSerialToTimestamp,
  formatExcelSerial,
  isExcelAutoCandidate,
  timestampToExcelSerial
} from './excel.js'

export const EMPTY_TIMESTAMP_MESSAGE = '请输入时间戳或日期时间'
export const INVALID_TIMESTAMP_MESSAGE =
  '无法解析日期或时间戳，请检查输入格式'
export const AUTO_DETECTION_ERROR_MESSAGE =
  '无法自动识别，请手动选择类型'
export const EXCEL_LOCAL_TIME_NOTE = 'Excel 序列日期按本地时间解释'
export const EXCEL_OUT_OF_RANGE_MESSAGE =
  '当前时间超出 Excel 1900 日期系统范围，已省略 Excel 序列日期输出'

export const INPUT_TYPE_AUTO = 'auto'
export const INPUT_TYPE_UNIX_SECONDS = 'unix-seconds'
export const INPUT_TYPE_UNIX_MILLISECONDS = 'unix-milliseconds'
export const INPUT_TYPE_EXCEL = 'excel'
export const INPUT_TYPE_DATETIME_TEXT = 'datetime-text'

export const INPUT_TYPE_LABELS = Object.freeze({
  [INPUT_TYPE_AUTO]: '自动识别',
  [INPUT_TYPE_UNIX_SECONDS]: 'Unix 秒',
  [INPUT_TYPE_UNIX_MILLISECONDS]: 'Unix 毫秒',
  [INPUT_TYPE_EXCEL]: 'Excel 序列日期',
  [INPUT_TYPE_DATETIME_TEXT]: '日期时间文本'
})

export const INPUT_TYPE_OPTIONS = Object.freeze(
  Object.entries(INPUT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label
  }))
)

const NUMERIC_TIMESTAMP_PATTERN =
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const SECONDS_LIMIT = 1e11

function padMinutes(minutes) {
  return String(minutes).padStart(2, '0')
}

function isNumericInput(text) {
  return NUMERIC_TIMESTAMP_PATTERN.test(text)
}

function getInputTypeLabel(inputType) {
  return INPUT_TYPE_LABELS[inputType] || INPUT_TYPE_LABELS[INPUT_TYPE_AUTO]
}

function normalizeInputType(inputType) {
  return Object.prototype.hasOwnProperty.call(INPUT_TYPE_LABELS, inputType)
    ? inputType
    : INPUT_TYPE_AUTO
}

function getAutoStatusText(inputType, alternativeType) {
  const alternative = alternativeType
    ? ` · 也可解释为 ${getInputTypeLabel(alternativeType)}`
    : ''
  return `自动识别：${getInputTypeLabel(inputType)}${alternative}`
}

function getManualStatusText(inputType, detectedType) {
  const detected = detectedType
    ? ` · 自动检测：${getInputTypeLabel(detectedType)}`
    : ''
  return `手动解析：${getInputTypeLabel(inputType)}${detected}`
}

function getParserError(inputType, detail) {
  return `${getInputTypeLabel(inputType)}解析失败：${detail}`
}

function detectTimestampType(text) {
  if (isNumericInput(text)) {
    const value = Number(text)
    if (!Number.isFinite(value)) {
      return {
        status: 'error',
        message: AUTO_DETECTION_ERROR_MESSAGE
      }
    }

    if (isExcelAutoCandidate(value)) {
      return {
        status: 'ok',
        type: INPUT_TYPE_EXCEL,
        alternativeType: INPUT_TYPE_UNIX_SECONDS
      }
    }

    return {
      status: 'ok',
      type:
        Math.abs(value) >= SECONDS_LIMIT
          ? INPUT_TYPE_UNIX_MILLISECONDS
          : INPUT_TYPE_UNIX_SECONDS
    }
  }

  const timestamp = Date.parse(text)
  if (!Number.isFinite(timestamp)) {
    return {
      status: 'error',
      message: AUTO_DETECTION_ERROR_MESSAGE
    }
  }

  return {
    status: 'ok',
    type: INPUT_TYPE_DATETIME_TEXT
  }
}

function parseNumericValue(text, inputType) {
  if (!isNumericInput(text)) {
    return {
      status: 'error',
      message: getParserError(inputType, '请输入有效数值')
    }
  }

  const value = Number(text)
  if (!Number.isFinite(value)) {
    return {
      status: 'error',
      message: getParserError(inputType, '请输入有限数值')
    }
  }

  return { status: 'ok', value }
}

function parseUnixInput(text, inputType) {
  const numeric = parseNumericValue(text, inputType)
  if (numeric.status !== 'ok') return numeric

  const isSeconds = inputType === INPUT_TYPE_UNIX_SECONDS
  const timestamp = isSeconds ? numeric.value * 1000 : numeric.value
  const date = new Date(timestamp)
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) {
    return {
      status: 'error',
      message: getParserError(inputType, '时间超出可表示范围')
    }
  }

  return {
    status: 'ok',
    date,
    timestamp: date.getTime(),
    unit: isSeconds ? 'seconds' : 'milliseconds'
  }
}

function getExcelErrorMessage(error) {
  if (!(error instanceof ExcelSerialError)) {
    return getParserError(INPUT_TYPE_EXCEL, '无法转换该序列值')
  }

  switch (error.code) {
    case 'negative':
      return getParserError(
        INPUT_TYPE_EXCEL,
        '1900 日期系统不支持负数序列'
      )
    case 'fictitious':
      return getParserError(
        INPUT_TYPE_EXCEL,
        '1900-02-29 是 Excel 虚构日期，序列 60 不存在'
      )
    case 'overflow':
      return getParserError(
        INPUT_TYPE_EXCEL,
        '日期超出 1900 日期系统范围（最大序列 2958465）'
      )
    case 'not-finite':
      return getParserError(INPUT_TYPE_EXCEL, '请输入有限数值')
    default:
      return getParserError(INPUT_TYPE_EXCEL, '无法转换该序列值')
  }
}

function parseExcelInput(text) {
  const numeric = parseNumericValue(text, INPUT_TYPE_EXCEL)
  if (numeric.status !== 'ok') return numeric

  try {
    const timestamp = excelSerialToTimestamp(numeric.value)
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) {
      return {
        status: 'error',
        message: getExcelErrorMessage(
          new ExcelSerialError('invalid-local-time')
        )
      }
    }

    return {
      status: 'ok',
      date,
      timestamp,
      unit: 'excel'
    }
  } catch (error) {
    return {
      status: 'error',
      message: getExcelErrorMessage(error)
    }
  }
}

function parseDateTimeInput(text) {
  if (isNumericInput(text)) {
    return {
      status: 'error',
      message: getParserError(
        INPUT_TYPE_DATETIME_TEXT,
        '请输入非纯数字的日期时间文本'
      )
    }
  }

  const timestamp = Date.parse(text)
  const date = new Date(timestamp)
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) {
    return {
      status: 'error',
      message: getParserError(
        INPUT_TYPE_DATETIME_TEXT,
        INVALID_TIMESTAMP_MESSAGE
      )
    }
  }

  return {
    status: 'ok',
    date,
    timestamp: date.getTime(),
    unit: 'date'
  }
}

function parseByType(text, inputType) {
  if (
    inputType === INPUT_TYPE_UNIX_SECONDS ||
    inputType === INPUT_TYPE_UNIX_MILLISECONDS
  ) {
    return parseUnixInput(text, inputType)
  }
  if (inputType === INPUT_TYPE_EXCEL) return parseExcelInput(text)
  return parseDateTimeInput(text)
}

export function formatDateTime(timestamp, timeZone) {
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }

  if (typeof timeZone === 'string' && timeZone) {
    options.timeZone = timeZone
  }

  return new Date(timestamp)
    .toLocaleString('zh-Hans-CN', options)
    .replace(/\//g, '-')
    .replace(' 24:', ' 00:')
}

export function parseTimestampInput(input, options = {}) {
  if (input === null || input === undefined) {
    return createEmptyResult(normalizeInputType(options.inputType))
  }

  const text = String(input).trim()
  const requestedType = normalizeInputType(options.inputType)
  if (!text) return createEmptyResult(requestedType)

  const detection = detectTimestampType(text)
  const detectedType =
    detection.status === 'ok' ? detection.type : null

  if (requestedType === INPUT_TYPE_AUTO) {
    if (detection.status !== 'ok') {
      return {
        status: 'error',
        message: AUTO_DETECTION_ERROR_MESSAGE,
        statusText: AUTO_DETECTION_ERROR_MESSAGE,
        effectiveType: null,
        parserType: null,
        detectedType: null,
        isManual: false,
        alternativeType: null
      }
    }

    const parsed = parseByType(text, detection.type)
    if (parsed.status !== 'ok') {
      return {
        status: 'error',
        message: AUTO_DETECTION_ERROR_MESSAGE,
        statusText: AUTO_DETECTION_ERROR_MESSAGE,
        effectiveType: null,
        parserType: null,
        detectedType,
        isManual: false,
        alternativeType: detection.alternativeType || null
      }
    }

    return {
      ...parsed,
      statusText: getAutoStatusText(
        detection.type,
        detection.alternativeType
      ),
      effectiveType: detection.type,
      parserType: detection.type,
      detectedType,
      isManual: false,
      alternativeType: detection.alternativeType || null
    }
  }

  const parsed = parseByType(text, requestedType)
  const statusText = getManualStatusText(requestedType, detectedType)
  if (parsed.status !== 'ok') {
    return {
      ...parsed,
      statusText,
      effectiveType: requestedType,
      parserType: requestedType,
      detectedType,
      isManual: true,
      alternativeType: null
    }
  }

  return {
    ...parsed,
    statusText,
    effectiveType: requestedType,
    parserType: requestedType,
    detectedType,
    isManual: true,
    alternativeType: null
  }
}

function createEmptyResult(requestedType) {
  const isManual = requestedType !== INPUT_TYPE_AUTO
  return {
    status: 'empty',
    statusText: isManual
      ? `手动解析：${getInputTypeLabel(requestedType)}`
      : '自动识别：等待输入',
    effectiveType: isManual ? requestedType : null,
    parserType: isManual ? requestedType : null,
    detectedType: null,
    isManual,
    alternativeType: null
  }
}

export function formatOffsetKey(offsetMinutes) {
  const roundedMinutes = Math.trunc(Number(offsetMinutes) || 0)
  const sign = roundedMinutes >= 0 ? '+' : '-'
  const absoluteMinutes = Math.abs(roundedMinutes)
  const hours = Math.floor(absoluteMinutes / 60)
  const minutes = absoluteMinutes % 60

  return `${sign}${hours}${minutes ? `:${padMinutes(minutes)}` : ''}`
}

export function formatLocalTimezoneLabel(
  timezoneOffsetMinutes = new Date().getTimezoneOffset()
) {
  const localOffsetMinutes = -(Number(timezoneOffsetMinutes) || 0)
  const offsetKey = formatOffsetKey(localOffsetMinutes)
  const entry = getTimezoneEntry(offsetKey)
  const timezoneText = entry?.text || '本地时间'

  return `UTC${offsetKey} ${timezoneText}(本地时间)`
}

export function sanitizeTimezoneOffsets(value) {
  if (!Array.isArray(value)) return []
  const selected = new Set(
    value.filter((entry) => typeof entry === 'string')
  )

  return TIMEZONE_KEYS.filter((offsetKey) => selected.has(offsetKey))
}

export function buildTimestampRows(
  input,
  selectedOffsets = [],
  options = {}
) {
  const parsed = parseTimestampInput(input, {
    inputType: options.inputType
  })
  if (parsed.status !== 'ok') {
    return {
      status: parsed.status,
      message: parsed.message,
      rows: [],
      statusText: parsed.statusText,
      effectiveType: parsed.effectiveType,
      parserType: parsed.parserType,
      detectedType: parsed.detectedType,
      isManual: parsed.isManual,
      alternativeType: parsed.alternativeType
    }
  }

  const localTimezoneLabel = formatLocalTimezoneLabel(
    options.localOffsetMinutes ?? new Date().getTimezoneOffset()
  )
  const localDateTime = formatDateTime(parsed.timestamp)
  const localDate = localDateTime.split(' ')[0]
  const rows = [
    {
      label: localTimezoneLabel,
      value: localDateTime
    },
    {
      label: `${localTimezoneLabel},日期`,
      value: localDate
    },
    {
      label: 'Unix 时间戳(秒)',
      value: String(Math.floor(parsed.timestamp / 1000))
    },
    {
      label: 'Unix 时间戳(毫秒)',
      value: String(parsed.timestamp)
    },
    {
      label: '标准时间(UTC)',
      value: new Date(parsed.timestamp)
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d+Z$/, '')
    }
  ]

  for (const offsetKey of sanitizeTimezoneOffsets(selectedOffsets)) {
    const entry = TIMEZONE_TABLE[offsetKey]
    rows.push({
      label: `UTC${offsetKey} ${entry.text}`,
      value: formatDateTime(parsed.timestamp, entry.utc)
    })
  }

  const excelSerial = timestampToExcelSerial(parsed.timestamp)
  if (excelSerial !== null) {
    rows.push({
      label: 'Excel 序列日期',
      value: formatExcelSerial(excelSerial)
    })
  }

  return {
    status: 'ok',
    timestamp: parsed.timestamp,
    unit: parsed.unit,
    rows,
    statusText: parsed.statusText,
    effectiveType: parsed.effectiveType,
    parserType: parsed.parserType,
    detectedType: parsed.detectedType,
    isManual: parsed.isManual,
    alternativeType: parsed.alternativeType,
    excelNote:
      excelSerial === null ? EXCEL_OUT_OF_RANGE_MESSAGE : null
  }
}

export function getInitialTimestampInput(action, now = Date.now()) {
  if (
    action &&
    (action.type === 'regex' || action.type === 'over') &&
    typeof action.payload === 'string'
  ) {
    const parsed = parseTimestampInput(action.payload)
    if (parsed.status === 'ok') return action.payload.trim()
  }

  return String(now)
}
