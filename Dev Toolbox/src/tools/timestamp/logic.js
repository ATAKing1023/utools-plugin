import { TIMEZONE_KEYS, TIMEZONE_TABLE, getTimezoneEntry } from './timezones.js'

export const EMPTY_TIMESTAMP_MESSAGE = '请输入时间戳或日期时间'
export const INVALID_TIMESTAMP_MESSAGE =
  '无法解析日期或时间戳，请检查输入格式'

const NUMERIC_TIMESTAMP_PATTERN = /^[+-]?\d+$/
const SECONDS_LIMIT = 1e11

function padMinutes(minutes) {
  return String(minutes).padStart(2, '0')
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

export function parseTimestampInput(input) {
  if (input === null || input === undefined) {
    return { status: 'empty' }
  }

  const text = String(input).trim()
  if (!text) return { status: 'empty' }

  let timestamp
  let unit = 'date'

  if (NUMERIC_TIMESTAMP_PATTERN.test(text)) {
    const numericValue = Number(text)
    if (!Number.isFinite(numericValue)) {
      return {
        status: 'error',
        message: INVALID_TIMESTAMP_MESSAGE
      }
    }

    const isSeconds = Math.abs(numericValue) < SECONDS_LIMIT
    timestamp = isSeconds ? numericValue * 1000 : numericValue
    unit = isSeconds ? 'seconds' : 'milliseconds'
  } else {
    timestamp = Date.parse(text)
  }

  const date = new Date(timestamp)
  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) {
    return {
      status: 'error',
      message: INVALID_TIMESTAMP_MESSAGE
    }
  }

  return {
    status: 'ok',
    date,
    timestamp: date.getTime(),
    unit
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
  const parsed = parseTimestampInput(input)
  if (parsed.status !== 'ok') {
    return {
      status: parsed.status,
      message: parsed.message,
      rows: []
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
      label: '时间戳(秒)',
      value: String(Math.floor(parsed.timestamp / 1000))
    },
    {
      label: '时间戳(毫秒)',
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

  return {
    status: 'ok',
    timestamp: parsed.timestamp,
    unit: parsed.unit,
    rows
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
