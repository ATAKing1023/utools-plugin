import { describe, expect, it } from 'vitest'
import {
  buildDiffResult,
  filterDiffRows,
  splitLineDetails
} from './logic.js'

describe('diff logic', () => {
  it('defines an empty state when both inputs are empty', () => {
    const result = buildDiffResult('', '')

    expect(result.isEmpty).toBe(true)
    expect(result.rows).toEqual([])
    expect(result.counts).toEqual({
      added: 0,
      removed: 0,
      changed: 0,
      unchanged: 0
    })
  })

  it('reports identical non-empty input with zero change counts', () => {
    const result = buildDiffResult('alpha\nbeta\n', 'alpha\nbeta\n')

    expect(result.isEmpty).toBe(false)
    expect(result.identical).toBe(true)
    expect(result.hasDifferences).toBe(false)
    expect(result.counts).toEqual({
      added: 0,
      removed: 0,
      changed: 0,
      unchanged: 2
    })
    expect(result.rows.every((row) => row.marker === '')).toBe(true)
  })

  it('marks added-only and removed-only input', () => {
    const added = buildDiffResult('', 'one\ntwo\n')
    expect(added.counts.added).toBe(2)
    expect(added.counts.removed).toBe(0)
    expect(added.rows.map((row) => row.marker)).toEqual(['+', '+'])
    expect(added.rows[0].newNumber).toBe(1)
    expect(added.rows[1].newNumber).toBe(2)

    const removed = buildDiffResult('one\ntwo\n', '')
    expect(removed.counts.added).toBe(0)
    expect(removed.counts.removed).toBe(2)
    expect(removed.rows.map((row) => row.marker)).toEqual(['-', '-'])
    expect(removed.rows[0].oldNumber).toBe(1)
    expect(removed.rows[1].oldNumber).toBe(2)
  })

  it('pairs a replaced line as a changed row', () => {
    const result = buildDiffResult(
      'one\ntwo\nthree\n',
      'one\nTWO\nthree\nfour\n'
    )

    expect(result.counts).toEqual({
      added: 1,
      removed: 0,
      changed: 1,
      unchanged: 2
    })
    expect(result.rows.map((row) => row.marker)).toEqual(['', '~', '', '+'])
    expect(result.rows[1]).toMatchObject({
      type: 'changed',
      oldNumber: 2,
      newNumber: 2,
      oldText: 'two',
      newText: 'TWO'
    })
  })

  it('pairs unequal removed and added runs one-for-one', () => {
    const result = buildDiffResult(
      'a\nb\nc\nd\n',
      'a\nX\nY\nZ\nd\n'
    )

    expect(result.counts).toEqual({
      added: 1,
      removed: 0,
      changed: 2,
      unchanged: 2
    })
    expect(result.rows.map((row) => row.marker)).toEqual([
      '',
      '~',
      '~',
      '+',
      ''
    ])
    expect(result.rows[3]).toMatchObject({
      type: 'added',
      newNumber: 4,
      newText: 'Z'
    })
  })

  it('keeps trailing whitespace differences visible', () => {
    const result = buildDiffResult('alpha \nbeta\t', 'alpha\nbeta')

    expect(result.counts.changed).toBe(2)
    expect(result.counts.unchanged).toBe(0)
    expect(result.rows[0]).toMatchObject({
      marker: '~',
      oldText: 'alpha ',
      newText: 'alpha'
    })
    expect(result.rows[1]).toMatchObject({
      marker: '~',
      oldText: 'beta\t',
      newText: 'beta'
    })
  })

  it('distinguishes a missing final newline', () => {
    const result = buildDiffResult('alpha', 'alpha\n')

    expect(result.identical).toBe(false)
    expect(result.counts.changed).toBe(1)
    expect(result.rows[0]).toMatchObject({
      marker: '~',
      oldText: 'alpha',
      newText: 'alpha',
      oldHasNewline: false,
      newHasNewline: true
    })
  })

  it('skips materializing rows for large identical inputs', () => {
    const text = 'same\nlines\nwithout\na\ntable\n'
    const result = buildDiffResult(text, text, { skipIdenticalRows: true })

    expect(result.identical).toBe(true)
    expect(result.rows).toEqual([])
    expect(result.counts.unchanged).toBe(5)
  })

  it('reports a bounded result when the exact diff exceeds the limit', () => {
    const result = buildDiffResult('old\n', 'new\n', { maxEditLength: 1 })

    expect(result.limited).toBe(true)
    expect(result.rows).toEqual([])
    expect(result.error).toContain('停止精确比较')
  })

  it('counts all supported newline forms on the identical fast path', () => {
    const cases = [
      ['a', 1],
      ['a\n', 1],
      ['\n', 1],
      ['\r\n', 1],
      ['a\r\nb', 2],
      ['a\rb', 2],
      ['a\n\n', 2],
      ['\r\n\r\n', 2],
      ['a\r\n\r\nb\r', 3]
    ]

    for (const [text, expected] of cases) {
      expect(
        buildDiffResult(text, text, { skipIdenticalRows: true }).counts
          .unchanged
      ).toBe(expected)
      expect(buildDiffResult(text, text).rows).toHaveLength(expected)
    }
  })

  it('splits lines without inventing a trailing empty line', () => {
    expect(splitLineDetails('one\n\nthree\n')).toEqual([
      { text: 'one', hasNewline: true },
      { text: '', hasNewline: true },
      { text: 'three', hasNewline: true }
    ])
    expect(splitLineDetails('')).toEqual([])
    expect(splitLineDetails('no-newline')).toEqual([
      { text: 'no-newline', hasNewline: false }
    ])
  })
})

describe('filterDiffRows', () => {
  it('returns all rows without mutating the input when disabled', () => {
    const rows = [
      { type: 'context', marker: '', oldNumber: 1, newNumber: 1 },
      { type: 'removed', marker: '-', oldNumber: 2, newNumber: null }
    ]
    const snapshot = rows.map((row) => ({ ...row }))

    const filtered = filterDiffRows(rows, false)

    expect(filtered).toEqual(snapshot)
    expect(filtered).not.toBe(rows)
    expect(rows).toEqual(snapshot)
  })

  it('keeps removed, changed, and added rows while hiding context only', () => {
    const rows = [
      { type: 'context', marker: '', oldNumber: 1, newNumber: 1 },
      { type: 'removed', marker: '-', oldNumber: 2, newNumber: null },
      { type: 'changed', marker: '~', oldNumber: 3, newNumber: 2 },
      { type: 'added', marker: '+', oldNumber: null, newNumber: 3 },
      { type: 'context', marker: '', oldNumber: 4, newNumber: 4 }
    ]

    const filtered = filterDiffRows(rows, true)

    expect(filtered.map((row) => row.type)).toEqual([
      'removed',
      'changed',
      'added'
    ])
    expect(filtered.map((row) => row.marker)).toEqual(['-', '~', '+'])
    expect(filtered[0]).toBe(rows[1])
    expect(filtered[1]).toBe(rows[2])
    expect(filtered[2]).toBe(rows[3])
    expect(rows).toHaveLength(5)
  })

  it('hides context-only rows', () => {
    const rows = [
      { type: 'context', marker: '', oldNumber: 1, newNumber: 1 },
      { type: 'context', marker: '', oldNumber: 2, newNumber: 2 }
    ]

    expect(filterDiffRows(rows, true)).toEqual([])
  })

  it('preserves full counts and line numbers', () => {
    const result = buildDiffResult('same\nold\nsame2\n', 'same\nnew\nsame2\n')
    const counts = { ...result.counts }
    const rows = result.rows.map((row) => ({ ...row }))

    const filtered = filterDiffRows(result.rows, true)

    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toMatchObject({
      type: 'changed',
      marker: '~',
      oldNumber: 2,
      newNumber: 2,
      oldText: 'old',
      newText: 'new'
    })
    expect(result.counts).toEqual(counts)
    expect(result.rows).toEqual(rows)
  })

  it('leaves the identical no-diff result empty when filtering', () => {
    const result = buildDiffResult('same\nlines\n', 'same\nlines\n')

    expect(result.identical).toBe(true)
    expect(result.counts.unchanged).toBe(2)
    expect(filterDiffRows(result.rows, true)).toEqual([])
    expect(result.rows).toHaveLength(2)
  })

  it('keeps one-sided added and removed rows intact', () => {
    const added = buildDiffResult('', 'one\ntwo\n')
    const filteredAdded = filterDiffRows(added.rows, true)

    expect(filteredAdded.map((row) => row.type)).toEqual(['added', 'added'])
    expect(filteredAdded.map((row) => row.marker)).toEqual(['+', '+'])
    expect(filteredAdded.map((row) => row.newNumber)).toEqual([1, 2])
    expect(added.counts).toEqual({
      added: 2,
      removed: 0,
      changed: 0,
      unchanged: 0
    })

    const removed = buildDiffResult('one\ntwo\n', '')
    const filteredRemoved = filterDiffRows(removed.rows, true)

    expect(filteredRemoved.map((row) => row.type)).toEqual([
      'removed',
      'removed'
    ])
    expect(filteredRemoved.map((row) => row.marker)).toEqual(['-', '-'])
    expect(filteredRemoved.map((row) => row.oldNumber)).toEqual([1, 2])
    expect(removed.counts).toEqual({
      added: 0,
      removed: 2,
      changed: 0,
      unchanged: 0
    })
  })
})
