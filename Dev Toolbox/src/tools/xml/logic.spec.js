import { describe, expect, it } from 'vitest'
import {
  escapeXmlAttribute,
  escapeXmlText,
  formatXmlText,
  isXmlInputEmpty,
  parseParserErrorMessage,
  parseXmlDocument,
  quoteDoctypeIdentifier,
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

  it('keeps text-only elements inline and preserves edge whitespace', () => {
    const result = formatXmlText(
      '<root><name> Alice </name><empty></empty></root>'
    )

    expect(result.ok).toBe(true)
    expect(result.value).toBe(
      '<root>\n  <name> Alice </name>\n  <empty/>\n</root>'
    )
  })

  it('preserves whitespace separators in mixed content', () => {
    const input = '<root><p>Hello <b>world</b> <i>again</i>!</p></root>'
    const result = formatXmlText(input)

    expect(result).toEqual({
      ok: true,
      value: '<root>\n  <p>Hello <b>world</b> <i>again</i>!</p>\n</root>'
    })

    const inputDocument = parseXmlDocument(input)
    const outputDocument = parseXmlDocument(result.value)
    expect(inputDocument.ok).toBe(true)
    expect(outputDocument.ok).toBe(true)
    expect(outputDocument.document.querySelector('p').textContent).toBe(
      inputDocument.document.querySelector('p').textContent
    )
    expect(outputDocument.document.querySelector('p').textContent).toBe(
      'Hello world again!'
    )
  })

  it('preserves whitespace-only separators between inline elements', () => {
    const input = '<root><p><b>Hello</b> <i>world</i></p></root>'
    const result = formatXmlText(input)

    expect(result).toEqual({
      ok: true,
      value: '<root>\n  <p><b>Hello</b> <i>world</i></p>\n</root>'
    })

    const outputDocument = parseXmlDocument(result.value)
    expect(outputDocument.ok).toBe(true)
    expect(outputDocument.document.querySelector('p').textContent).toBe(
      'Hello world'
    )
  })

  it.each([
    ['newline-space', '\n '],
    ['newline-indent', '\n  '],
    ['crlf', '\r\n '],
    ['newline-tab', '\n\t']
  ])(
    'preserves %s separators in mixed content when reparsed',
    (_name, separator) => {
      const input =
        `<root><p><b>Hello</b>${separator}<i>world</i></p></root>`
      const inputDocument = parseXmlDocument(input)
      const expectedText =
        inputDocument.document.querySelector('p').textContent
      const result = formatXmlText(input)

      expect(result.ok).toBe(true)
      expect(validateXml(result.value).ok).toBe(true)

      const outputDocument = parseXmlDocument(result.value)
      expect(outputDocument.ok).toBe(true)
      expect(outputDocument.document.querySelector('p').textContent).toBe(
        expectedText
      )
      expect(result.value).toContain(
        `<b>Hello</b>${separator.replace(/\r\n/g, '\n')}<i>world</i>`
      )
    }
  )

  it('does not treat a bare newline separator as indentation', () => {
    const input = '<root><p><b>Hello</b>\n<i>world</i></p></root>'
    const result = formatXmlText(input)

    expect(result.ok).toBe(true)

    const outputDocument = parseXmlDocument(result.value)
    expect(outputDocument.ok).toBe(true)
    expect(outputDocument.document.querySelector('p').textContent).toBe(
      'Hello\nworld'
    )
  })

  it('preserves whitespace throughout xml:space=preserve subtrees', () => {
    const input = [
      '<root>',
      '<p xml:space="preserve">Hello <b>world</b> <i>again</i>!</p>',
      '<code xml:space="preserve">  leading and trailing  </code>',
      '</root>'
    ].join('')
    const result = formatXmlText(input)

    expect(result).toEqual({
      ok: true,
      value: [
        '<root>',
        '  <p xml:space="preserve">Hello <b>world</b> <i>again</i>!</p>',
        '  <code xml:space="preserve">  leading and trailing  </code>',
        '</root>'
      ].join('\n')
    })

    const outputDocument = parseXmlDocument(result.value)
    expect(outputDocument.ok).toBe(true)
    expect(outputDocument.document.querySelector('p').textContent).toBe(
      'Hello world again!'
    )
    expect(outputDocument.document.querySelector('code').textContent).toBe(
      '  leading and trailing  '
    )
  })

  it('preserves inherited preserve-space text when reparsing', () => {
    const input = [
      '<root xml:space="preserve">\n',
      '  <p>Hello <b>world</b> <i>again</i>!</p>\n',
      '</root>'
    ].join('')
    const result = formatXmlText(input)

    expect(result).toEqual({ ok: true, value: input })

    const inputDocument = parseXmlDocument(input)
    const outputDocument = parseXmlDocument(result.value)
    expect(outputDocument.ok).toBe(true)
    expect(outputDocument.document.documentElement.textContent).toBe(
      inputDocument.document.documentElement.textContent
    )

    const separatorInput = '<root xml:space="preserve"> <a/> </root>'
    const separatorResult = formatXmlText(separatorInput)
    expect(separatorResult).toEqual({
      ok: true,
      value: separatorInput
    })

    const separatorDocument = parseXmlDocument(separatorResult.value)
    expect(separatorDocument.ok).toBe(true)
    expect(separatorDocument.document.documentElement.textContent).toBe(
      '  '
    )
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

  it('chooses safe delimiters for quote-bearing DOCTYPE identifiers', () => {
    const systemInput = '<!DOCTYPE root SYSTEM \'a"b\'><root/>'
    const publicInput = '<!DOCTYPE root PUBLIC "pub\'id" \'sys"id\'><root/>'

    const systemResult = formatXmlText(systemInput)
    const publicResult = formatXmlText(publicInput)

    expect(systemResult).toEqual({
      ok: true,
      value: '<!DOCTYPE root SYSTEM \'a"b\'>\n<root/>'
    })
    expect(publicResult).toEqual({
      ok: true,
      value: '<!DOCTYPE root PUBLIC "pub\'id" \'sys"id\'>\n<root/>'
    })
    expect(parseXmlDocument(systemResult.value).ok).toBe(true)
    expect(parseXmlDocument(publicResult.value).ok).toBe(true)
    expect(validateXml(systemResult.value).ok).toBe(true)
    expect(validateXml(publicResult.value).ok).toBe(true)
  })

  it('ignores DOCTYPE-like text in comments and processing instructions', () => {
    const commentInput =
      '<!-- fake <!DOCTYPE root SYSTEM "wrong"> -->' +
      '<!DOCTYPE root SYSTEM \'a"b\'><root/>'
    const commentResult = formatXmlText(commentInput)

    expect(commentResult).toEqual({
      ok: true,
      value: [
        '<!-- fake <!DOCTYPE root SYSTEM "wrong"> -->',
        '<!DOCTYPE root SYSTEM \'a"b\'>',
        '<root/>'
      ].join('\n')
    })
    expect(validateXml(commentResult.value).ok).toBe(true)
    expect(parseXmlDocument(commentResult.value).ok).toBe(true)

    const piInput =
      '<?probe fake <!DOCTYPE root SYSTEM "wrong">?>' +
      '<!DOCTYPE root PUBLIC "pub\'id" \'sys"id\'><root/>'
    const piResult = formatXmlText(piInput)

    expect(piResult).toEqual({
      ok: true,
      value: [
        '<?probe fake <!DOCTYPE root SYSTEM "wrong">?>',
        '<!DOCTYPE root PUBLIC "pub\'id" \'sys"id\'>',
        '<root/>'
      ].join('\n')
    })
    expect(validateXml(piResult.value).ok).toBe(true)
    expect(parseXmlDocument(piResult.value).ok).toBe(true)
  })

  it('fails safely when a DOCTYPE identifier contains both quote types', () => {
    expect(() => quoteDoctypeIdentifier('a"b\'c')).toThrow(
      /无法安全序列化/
    )
  })

  it('treats blank input as empty', () => {
    expect(isXmlInputEmpty('')).toBe(true)
    expect(isXmlInputEmpty(' \n\t')).toBe(true)
    expect(isXmlInputEmpty('<root/>')).toBe(false)
  })
})
