import { dbGet, dbSet } from './utools.js'

export const TIMESTAMP_TIMEZONES_KEY = 'dev-toolbox.timestamp.timezones'

export function normalizeTimezoneOffsets(value) {
  if (!Array.isArray(value)) return []
  return value.filter((entry) => typeof entry === 'string')
}

export function readTimezoneOffsets() {
  return normalizeTimezoneOffsets(dbGet(TIMESTAMP_TIMEZONES_KEY))
}

export function writeTimezoneOffsets(offsets) {
  return dbSet(TIMESTAMP_TIMEZONES_KEY, normalizeTimezoneOffsets(offsets))
}
