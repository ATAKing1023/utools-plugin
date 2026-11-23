import { describe, expect, it } from 'vitest'
import { decodeBase64, encodeBase64 } from './logic.js'

const ROUND_TRIP_SAMPLES = [
  'Hello, world!',
  '你好，开发者工具',
  'Emoji: 😀🌍🚀',
  'line one\nline two\r\nline three',
  'mixed 中文 + ASCII + 😀\n第二行'
]

describe('Base64 encoding', () => {
  it.each(ROUND_TRIP_SAMPLES)(
    'round-trips Unicode and line breaks',
    (text) => {
      expect(decodeBase64(encodeBase64(text))).toBe(text)
    }
  )

  it('matches deterministic UTF-8 base64 vectors', () => {
    expect(encodeBase64('hello')).toBe('aGVsbG8=')
    expect(encodeBase64('你好')).toBe('5L2g5aW9')
    expect(encodeBase64('😀')).toBe('8J+YgA==')
    expect(encodeBase64('a\nb')).toBe('YQpi')
    expect(encodeBase64('你好, 🌍\nline 2')).toBe(
      '5L2g5aW9LCDwn4yNCmxpbmUgMg=='
    )
  })

  it('decodes known values exactly', () => {
    expect(decodeBase64('aGVsbG8=')).toBe('hello')
    expect(decodeBase64('5L2g5aW9')).toBe('你好')
    expect(decodeBase64('8J+YgA==')).toBe('😀')
    expect(decodeBase64('')).toBe('')
    expect(encodeBase64('')).toBe('')
  })
})

describe('Base64 strict validation', () => {
  it.each([
    ['wrong length', 'a'],
    ['missing padding', 'aGVsbG8'],
    ['invalid alphabet', 'aGVsbG8*'],
    ['invalid padding', 'aGVsbG8=='],
    ['padding-only value', '===='],
    ['non-canonical pad bits', 'AB=='],
    ['embedded whitespace', 'aGVs bG8=']
  ])('rejects %s', (_caseName, value) => {
    expect(() => decodeBase64(value)).toThrow(
      'Base64 格式无效，请检查字符和末尾填充'
    )
  })

  it.each(['/w==', '//8='])(
    'rejects invalid UTF-8 bytes in %s',
    (value) => {
      expect(() => decodeBase64(value)).toThrow(
        'Base64 解码结果不是有效的 UTF-8 文本'
      )
    }
  )
})
