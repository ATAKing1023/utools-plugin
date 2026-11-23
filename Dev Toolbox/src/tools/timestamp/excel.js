export const EXCEL_MS_PER_DAY = 86400000
export const EXCEL_MAX_SERIAL_EXCLUSIVE = 2958466
export const EXCEL_MAX_DAY_SERIAL = 2958465

const EXCEL_1900_LEAP_BASE_UTC = Date.UTC(1899, 11, 30)
const EXCEL_1899_BASE_UTC = Date.UTC(1899, 11, 31)
const EXCEL_MIN_DATE_UTC = Date.UTC(1899, 11, 31)
const EXCEL_MAX_DATE_UTC = Date.UTC(9999, 11, 31)

export class ExcelSerialError extends Error {
  constructor(code) {
    super(code)
    this.name = 'ExcelSerialError'
    this.code = code
  }
}

export function isExcelAutoCandidate(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  if (value >= 60 && value < 61) return false

  if (Number.isInteger(value)) {
    return value >= 1 && value <= EXCEL_MAX_DAY_SERIAL
  }

  return value >= 0 && value < EXCEL_MAX_SERIAL_EXCLUSIVE
}

export function serialToCivilParts(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) {
    throw new ExcelSerialError('not-finite')
  }
  if (serial < 0) {
    throw new ExcelSerialError('negative')
  }
  if (serial >= EXCEL_MAX_SERIAL_EXCLUSIVE) {
    throw new ExcelSerialError('overflow')
  }
  if (serial >= 60 && serial < 61) {
    throw new ExcelSerialError('fictitious')
  }

  const day = Math.floor(serial)
  const fraction = serial - day
  const baseUtc =
    day < 60 ? EXCEL_1899_BASE_UTC : EXCEL_1900_LEAP_BASE_UTC
  const dateUtc = new Date(baseUtc + day * EXCEL_MS_PER_DAY)
  const msOfDay = Math.min(
    86399999,
    Math.round(fraction * EXCEL_MS_PER_DAY)
  )

  return {
    year: dateUtc.getUTCFullYear(),
    month: dateUtc.getUTCMonth() + 1,
    day: dateUtc.getUTCDate(),
    hour: Math.floor(msOfDay / 3600000),
    minute: Math.floor(msOfDay / 60000) % 60,
    second: Math.floor(msOfDay / 1000) % 60,
    millisecond: msOfDay % 1000
  }
}

function isValidCivilParts(parts) {
  if (!parts || typeof parts !== 'object') return false

  const values = [
    parts.year,
    parts.month,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    parts.millisecond ?? 0
  ]
  if (!values.every((value) => Number.isInteger(value))) return false

  const { year, month, day, hour = 0, minute = 0, second = 0 } = parts
  const millisecond = parts.millisecond ?? 0
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  if (hour < 0 || hour > 23) return false
  if (minute < 0 || minute > 59) return false
  if (second < 0 || second > 59) return false
  if (millisecond < 0 || millisecond > 999) return false

  const dateUtc = new Date(Date.UTC(year, month - 1, day))
  return (
    dateUtc.getUTCFullYear() === year &&
    dateUtc.getUTCMonth() + 1 === month &&
    dateUtc.getUTCDate() === day
  )
}

export function civilPartsToSerial(parts) {
  if (!isValidCivilParts(parts)) return null

  const {
    year,
    month,
    day,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0
  } = parts
  const dateUtc = Date.UTC(year, month - 1, day)
  if (dateUtc < EXCEL_MIN_DATE_UTC || dateUtc > EXCEL_MAX_DATE_UTC) {
    return null
  }

  const baseUtc =
    dateUtc >= Date.UTC(1900, 2, 1)
      ? EXCEL_1900_LEAP_BASE_UTC
      : EXCEL_1899_BASE_UTC
  const daySerial = Math.round(
    (dateUtc - baseUtc) / EXCEL_MS_PER_DAY
  )
  if (daySerial < 0 || daySerial > EXCEL_MAX_DAY_SERIAL) return null

  const fraction =
    (((hour * 60 + minute) * 60 + second) * 1000 + millisecond) /
    EXCEL_MS_PER_DAY
  const serial = daySerial + fraction

  return serial < EXCEL_MAX_SERIAL_EXCLUSIVE ? serial : null
}

export function excelSerialToTimestamp(serial) {
  const parts = serialToCivilParts(serial)
  const date = new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  )
  const timestamp = date.getTime()
  if (!Number.isFinite(timestamp)) {
    throw new ExcelSerialError('invalid-local-time')
  }
  return timestamp
}

export function timestampToExcelSerial(timestamp) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return null
  }

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null

  return civilPartsToSerial({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    millisecond: date.getMilliseconds()
  })
}

export function formatExcelSerial(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return ''
  return serial.toFixed(9).replace(/\.?0+$/, '')
}
