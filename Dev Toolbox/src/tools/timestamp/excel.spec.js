import { describe, expect, it } from 'vitest'
import {
  ExcelSerialError,
  civilPartsToSerial,
  excelSerialToTimestamp,
  formatExcelSerial,
  isExcelAutoCandidate,
  serialToCivilParts,
  timestampToExcelSerial
} from './excel.js'

const MAX_SERIAL = 2958465.99999999

function getSerialError(serial) {
  try {
    serialToCivilParts(serial)
    return null
  } catch (error) {
    return error
  }
}

function expectLocalParts(timestamp, parts) {
  const date = new Date(timestamp)
  expect({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    millisecond: date.getMilliseconds()
  }).toEqual(parts)
}

describe('Excel 1900 serial civil conversion', () => {
  it('maps the documented anchors in the 1900 system', () => {
    expect(serialToCivilParts(0)).toEqual({
      year: 1899,
      month: 12,
      day: 31,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    })
    expect(serialToCivilParts(0.5)).toEqual({
      year: 1899,
      month: 12,
      day: 31,
      hour: 12,
      minute: 0,
      second: 0,
      millisecond: 0
    })
    expect(serialToCivilParts(1)).toMatchObject({
      year: 1900,
      month: 1,
      day: 1
    })
    expect(serialToCivilParts(59)).toMatchObject({
      year: 1900,
      month: 2,
      day: 28
    })
    expect(serialToCivilParts(61)).toMatchObject({
      year: 1900,
      month: 3,
      day: 1
    })
    expect(serialToCivilParts(25569)).toMatchObject({
      year: 1970,
      month: 1,
      day: 1,
      hour: 0
    })
    expect(serialToCivilParts(45000)).toMatchObject({
      year: 2023,
      month: 3,
      day: 15,
      hour: 0
    })
    expect(serialToCivilParts(45000.5)).toMatchObject({
      year: 2023,
      month: 3,
      day: 15,
      hour: 12
    })
    expect(serialToCivilParts(2958465)).toMatchObject({
      year: 9999,
      month: 12,
      day: 31,
      hour: 0
    })
    expect(serialToCivilParts(MAX_SERIAL)).toMatchObject({
      year: 9999,
      month: 12,
      day: 31,
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999
    })
  })

  it('rejects the fictional leap day, negatives, and overflow distinctly', () => {
    expect(getSerialError(60)).toBeInstanceOf(ExcelSerialError)
    expect(getSerialError(60).code).toBe('fictitious')
    expect(getSerialError(60.5).code).toBe('fictitious')
    expect(getSerialError(-0.5).code).toBe('negative')
    expect(getSerialError(-1).code).toBe('negative')
    expect(getSerialError(2958466).code).toBe('overflow')
    expect(getSerialError(Infinity).code).toBe('not-finite')
    expect(getSerialError(Number.NaN).code).toBe('not-finite')
  })

  it('converts civil parts to serials with the leap-day gap preserved', () => {
    expect(
      civilPartsToSerial({
        year: 1899,
        month: 12,
        day: 31
      })
    ).toBe(0)
    expect(
      civilPartsToSerial({
        year: 1900,
        month: 1,
        day: 1
      })
    ).toBe(1)
    expect(
      civilPartsToSerial({
        year: 1900,
        month: 2,
        day: 28
      })
    ).toBe(59)
    expect(
      civilPartsToSerial({
        year: 1900,
        month: 3,
        day: 1
      })
    ).toBe(61)
    expect(
      civilPartsToSerial({
        year: 1970,
        month: 1,
        day: 1
      })
    ).toBe(25569)
    expect(
      civilPartsToSerial({
        year: 2023,
        month: 3,
        day: 15,
        hour: 12
      })
    ).toBe(45000.5)
    expect(
      civilPartsToSerial({
        year: 9999,
        month: 12,
        day: 31,
        hour: 23,
        minute: 59,
        second: 59,
        millisecond: 999
      })
    ).toBe(2958465 + 86399999 / 86400000)
  })

  it('returns unavailable outside the supported civil range or invalid parts', () => {
    expect(
      civilPartsToSerial({ year: 1899, month: 12, day: 30 })
    ).toBeNull()
    expect(
      civilPartsToSerial({ year: 10000, month: 1, day: 1 })
    ).toBeNull()
    expect(
      civilPartsToSerial({ year: 1900, month: 2, day: 29 })
    ).toBeNull()
    expect(
      civilPartsToSerial({ year: 2023, month: 13, day: 1 })
    ).toBeNull()
    expect(civilPartsToSerial(null)).toBeNull()
  })

  it('preserves fractional-day milliseconds and formats up to 9 decimals', () => {
    expect(serialToCivilParts(59.99999999999999)).toMatchObject({
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999
    })
    expect(formatExcelSerial(0)).toBe('0')
    expect(formatExcelSerial(45000)).toBe('45000')
    expect(formatExcelSerial(45000.5)).toBe('45000.5')
    expect(formatExcelSerial(46349.40499914352)).toBe(
      '46349.404999144'
    )
    expect(formatExcelSerial(2958465.999999988)).toBe(
      '2958465.999999988'
    )
    expect(formatExcelSerial(Number.NaN)).toBe('')
  })

  it('interprets fractional days as local wall-clock time', () => {
    const timestamp = excelSerialToTimestamp(45000.5)
    expectLocalParts(timestamp, {
      year: 2023,
      month: 3,
      day: 15,
      hour: 12,
      minute: 0,
      second: 0,
      millisecond: 0
    })

    expectLocalParts(excelSerialToTimestamp(25569), {
      year: 1970,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    })
  })

  it('round-trips Excel serials through local timestamps', () => {
    const timestamp = excelSerialToTimestamp(46349.404999144)
    const serial = timestampToExcelSerial(timestamp)

    expect(formatExcelSerial(serial)).toBe('46349.404999144')
    expect(
      excelSerialToTimestamp(Number(formatExcelSerial(serial)))
    ).toBe(timestamp)
  })

  it('selects only valid overlapping Excel values for auto detection', () => {
    expect(isExcelAutoCandidate(0)).toBe(false)
    expect(isExcelAutoCandidate(0.5)).toBe(true)
    expect(isExcelAutoCandidate(1)).toBe(true)
    expect(isExcelAutoCandidate(59.5)).toBe(true)
    expect(isExcelAutoCandidate(60)).toBe(false)
    expect(isExcelAutoCandidate(60.5)).toBe(false)
    expect(isExcelAutoCandidate(61)).toBe(true)
    expect(isExcelAutoCandidate(2958465)).toBe(true)
    expect(isExcelAutoCandidate(2958465.5)).toBe(true)
    expect(isExcelAutoCandidate(2958466)).toBe(false)
    expect(isExcelAutoCandidate(-1)).toBe(false)
    expect(isExcelAutoCandidate(Infinity)).toBe(false)
  })

  it('keeps the 1900 system rather than a 1904 offset', () => {
    expect(serialToCivilParts(1)).toMatchObject({
      year: 1900,
      month: 1,
      day: 1
    })
    expect(serialToCivilParts(61)).toMatchObject({
      year: 1900,
      month: 3,
      day: 1
    })
    expect(civilPartsToSerial({ year: 1904, month: 1, day: 1 })).toBe(
      1462
    )
  })
})
