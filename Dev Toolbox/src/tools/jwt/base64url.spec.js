import { describe, expect, it } from 'vitest'
import {
  Base64UrlError,
  decodeBase64Url,
  decodeUtf8Base64Url,
  encodeBase64Url,
  encodeUtf8Base64Url,
  isBase64Url
} from './base64url.js'

const ROUND_TRIPS = [
  '',
  'hello',
  '你好',
  'Emoji: 😀🌍🚀',
  'line one\nline two\r\nline three',
  'mixed 中文 + ASCII + 😀\n第二行',
  '? > = / +'
]

describe('Base64URL encoding', () => {
  it.each(ROUND_TRIPS)('round-trips %j', (text) => {
    expect(decodeUtf8Base64Url(encodeUtf8Base64Url(text))).toBe(text)
  })

  it('matches unpadded deterministic vectors', () => {
    expect(encodeUtf8Base64Url('hello')).toBe('aGVsbG8')
    expect(encodeUtf8Base64Url('你好')).toBe('5L2g5aW9')
    expect(encodeUtf8Base64Url('😀')).toBe('8J-YgA')
    expect(encodeUtf8Base64Url('a')).toBe('YQ')
    expect(encodeUtf8Base64Url('ab')).toBe('YWI')
    expect(encodeUtf8Base64Url('?')).toBe('Pw')
  })

  it('encodes and decodes bytes without padding', () => {
    const bytes = Uint8Array.from([0x00, 0xff, 0x10, 0x7f, 0x80])
    const encoded = encodeBase64Url(bytes)

    expect(encoded).toBe('AP8Qf4A')
    expect(encoded).not.toContain('=')
    expect(Array.from(decodeBase64Url(encoded))).toEqual(
      Array.from(bytes)
    )
  })

  it('decodes empty content to an empty byte array', () => {
    expect(Array.from(decodeBase64Url(''))).toEqual([])
  })
})

describe('strict Base64URL decoding', () => {
  it.each([
    ['padding', 'YQ==', 'alphabet'],
    ['single padding', 'YQ=', 'alphabet'],
    ['plus alphabet', 'Y+', 'alphabet'],
    ['slash alphabet', 'Y/', 'alphabet'],
    ['invalid character', 'Y*', 'alphabet'],
    ['embedded whitespace', 'Y Q', 'alphabet'],
    ['mod-4 length one', 'a', 'length'],
    ['non-canonical one-byte pad bits', 'YR', 'trailing-bits'],
    ['non-canonical two-byte pad bits', 'YWJ', 'trailing-bits']
  ])('rejects %s', (_name, value, code) => {
    try {
      decodeBase64Url(value)
      throw new Error('expected decode to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(Base64UrlError)
      expect(error.code).toBe(code)
    }
  })

  it('accepts canonical two- and three-character tails', () => {
    expect(decodeUtf8Base64Url('YQ')).toBe('a')
    expect(decodeUtf8Base64Url('YWI')).toBe('ab')
  })

  it('rejects a non-string without coercion', () => {
    expect(() => decodeBase64Url(123)).toThrow(Base64UrlError)
  })

  it('rejects invalid UTF-8 bytes without replacement characters', () => {
    expect(() => decodeUtf8Base64Url('_w')).toThrow(
      'Base64URL 内容不是有效的 UTF-8'
    )
  })

  it('recognises only the Base64URL alphabet', () => {
    expect(isBase64Url('YQ')).toBe(true)
    expect(isBase64Url('YQ==')).toBe(false)
    expect(isBase64Url('Y+')).toBe(false)
    expect(isBase64Url(null)).toBe(false)
  })
})
