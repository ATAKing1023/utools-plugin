import { describe, expect, it } from 'vitest'
import {
  buildDiffResult,
  buildUnifiedDiff,
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
    expect(result.unifiedDiff).toBe('')
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

  it('builds a unified patch containing both sides and context', () => {
    const patch = buildUnifiedDiff('one\ntwo\nthree\n', 'one\nTWO\nthree\n')

    expect(patch).toContain('--- original.txt')
    expect(patch).toContain('+++ revised.txt')
    expect(patch).toContain(' one')
    expect(patch).toContain('-two')
    expect(patch).toContain('+TWO')
    expect(patch).toContain(' three')
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
