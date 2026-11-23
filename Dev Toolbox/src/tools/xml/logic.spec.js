import { describe, expect, it } from 'vitest'
import {
  escapeXmlAttribute,
  escapeXmlText,
  formatXmlText,
  isXmlInputEmpty,
  parseParserErrorMessage,
  parseXmlDocument,
  validateXml
} from './logic.js'

describe('xml logic', () => {
  it('validates well-formed XML', () => {
    expect(validateXml('<root><item id="1">ok</item></root>')).toEqual({
      ok: true
    })
  })

  it('returns deterministic validator line and column details', () => {
    const result = validateXml('<root>\n  <a></root>')

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      code: 'InvalidTag',
      line: 2,
      column: 6
    })
    expect(result.error.message).toContain("Expected closing tag 'a'")
    expect(result.error.displayMessage).toContain('第 2 行，第 6 列')
  })

  it('formats with two-space indentation and preserves special nodes', () => {
    const result = formatXmlText(
      '<root><a x="1"><b>text</b></a><!--c--><![CDATA[x<y]]><empty/></root>'
    )

    expect(result).toEqual({
      ok: true,
      value: [
        '<root>',
        '  <a x="1">',
        '    <b>text</b>',
        '  </a>',
        '  <!--c-->',
        '  <![CDATA[x<y]]>',
        '  <empty/>',
        '</root>'
      ].join('\n')
    })
    expect(validateXml(result.value).ok).toBe(true)
  })

  it('preserves parsed attribute order and escapes attribute values', () => {
    const result = formatXmlText(
      '<root><item z="1" a="&quot;&amp;&lt;&gt;">x</item></root>'
    )

    expect(result.ok).toBe(true)
    expect(result.value).toContain(
      '<item z="1" a="&quot;&amp;&lt;&gt;">x</item>'
    )
    expect(escapeXmlAttribute('"<&>\n\t')).toBe(
      '&quot;&lt;&amp;&gt;&#10;&#9;'
    )
    expect(escapeXmlText('<&>')).toBe('&lt;&amp;&gt;')
  })

  it('keeps text-only elements inline and normalizes empty elements', () => {
    const result = formatXmlText(
      '<root><name> Alice </name><empty></empty></root>'
    )

    expect(result.ok).toBe(true)
    expect(result.value).toBe(
      '<root>\n  <name>Alice</name>\n  <empty/>\n</root>'
    )
  })

  it('uses deterministic inline behavior for mixed content', () => {
    const result = formatXmlText(
      '<root><p>Hello <b>world</b>!</p></root>'
    )

    expect(result).toEqual({
      ok: true,
      value: '<root>\n  <p>Hello <b>world</b>!</p>\n</root>'
    })

    const repeated = formatXmlText(result.value)
    expect(repeated.value).toBe(result.value)
  })

  it('preserves an XML declaration and ignores formatting whitespace', () => {
    const result = formatXmlText(
      '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <x>1</x>\n</root>\n'
    )

    expect(result.ok).toBe(true)
    expect(result.value).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <x>1</x>\n</root>'
    )
  })

  it('extracts Chromium and jsdom parser positions without fixed wording', () => {
    const chromium = parseParserErrorMessage(
      'This page contains the following errors:error on line 1 at column 11: Opening and ending tag mismatch'
    )
    expect(chromium).toMatchObject({ line: 1, column: 11 })

    const jsdom = parseParserErrorMessage('1:10: unexpected close tag.')
    expect(jsdom).toMatchObject({ line: 1, column: 10 })

    const unknown = parseParserErrorMessage('XML parser error')
    expect(unknown.line).toBeNull()
    expect(unknown.column).toBeNull()
    expect(unknown.displayMessage).toBe('XML parser error')
  })

  it('detects native parser errors and never throws', () => {
    const parsed = parseXmlDocument('<root><item></root>')

    expect(parsed.ok).toBe(false)
    expect(typeof parsed.error.message).toBe('string')
    expect(formatXmlText('<root><item></root>').ok).toBe(false)
    expect(validateXml('<root><item></root>').ok).toBe(false)
  })

  it('treats blank input as empty', () => {
    expect(isXmlInputEmpty('')).toBe(true)
    expect(isXmlInputEmpty(' \n\t')).toBe(true)
    expect(isXmlInputEmpty('<root/>')).toBe(false)
  })
})
