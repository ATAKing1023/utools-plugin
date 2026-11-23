import { describe, expect, it } from 'vitest'
import {
  formatJsonText,
  isJsonInputEmpty,
  normalizeJsonError,
  parseJsonText,
  positionToLineColumn
} from './logic.js'

describe('json logic', () => {
  it('parses every JSON value type', () => {
    const cases = [
      ['{"name":"toolbox"}', { name: 'toolbox' }],
      ['[1,true,null]', [1, true, null]],
      ['"text"', 'text'],
      ['42', 42],
      ['true', true],
      ['null', null]
    ]

    for (const [text, expected] of cases) {
      expect(parseJsonText(text)).toEqual({ ok: true, value: expected })
    }
  })

  it('formats with two-space indentation', () => {
    const formatted = formatJsonText('{"a":1,"b":[true,null]}')

    expect(formatted).toEqual({
      ok: true,
      value: '{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}'
    })
  })

  it('derives a line and column from a numeric position', () => {
    const input = '{\n  "a": 1,\n}'
    const error = normalizeJsonError(
      new Error('Unexpected token } in JSON at position 12'),
      input
    )

    expect(error.position).toBe(12)
    expect(error.line).toBe(3)
    expect(error.column).toBe(1)
    expect(error.displayMessage).toContain('第 3 行，第 1 列')
  })

  it('uses an engine-provided line and column', () => {
    const error = normalizeJsonError(
      new Error('Expected property name or } in JSON at position 8 (line 2 column 3)'),
      '{\n  bad\n}'
    )

    expect(error.line).toBe(2)
    expect(error.column).toBe(3)
    expect(error.displayMessage).toContain('第 2 行，第 3 列')
  })

  it('does not fabricate a position when the engine provides none', () => {
    const error = normalizeJsonError(
      new Error('Unexpected end of JSON input'),
      '{'
    )

    expect(error.position).toBeNull()
    expect(error.line).toBeNull()
    expect(error.column).toBeNull()
    expect(error.displayMessage).toBe('Unexpected end of JSON input')
    expect(error.displayMessage).not.toContain('位置')
  })

  it('handles invalid input without throwing', () => {
    const parsed = parseJsonText('{"a":')

    expect(parsed.ok).toBe(false)
    expect(typeof parsed.error.message).toBe('string')
    expect(formatJsonText('{bad').ok).toBe(false)
  })

  it('derives positions across CRLF and LF line endings', () => {
    expect(positionToLineColumn('{\r\n  x', 2)).toEqual({ line: 2, column: 1 })
    expect(positionToLineColumn('{\r\n  x', 5)).toEqual({ line: 2, column: 3 })
    expect(positionToLineColumn('{\n  x', 4)).toEqual({ line: 2, column: 3 })
    expect(positionToLineColumn('abc', 99)).toBeNull()
  })

  it('treats empty and whitespace-only input as empty', () => {
    expect(isJsonInputEmpty('')).toBe(true)
    expect(isJsonInputEmpty(' \n\t')).toBe(true)
    expect(isJsonInputEmpty('null')).toBe(false)
  })
})
