import { describe, expect, it } from 'vitest'
import { decodeUrl, encodeUrl } from './logic.js'

const ROUND_TRIP_SAMPLES = [
  'https://例子.example/路径?q=空格 space&x=1+2#片段',
  'a+b=c&d=e',
  '特殊字符 /?:@&=+$,#[]!',
  'Emoji 😀 and 中文',
  'line one\nline two'
]

describe('URL encoding and decoding', () => {
  it.each(ROUND_TRIP_SAMPLES)('round-trips %s', (text) => {
    expect(decodeUrl(encodeUrl(text))).toBe(text)
  })

  it('encodes spaces as %20', () => {
    expect(encodeUrl('a b')).toBe('a%20b')
  })

  it('preserves a literal plus while decoding', () => {
    expect(decodeUrl('a+b')).toBe('a+b')
    expect(decodeUrl('a+b%20c')).toBe('a+b c')
    expect(decodeUrl('%2B')).toBe('+')
  })

  it('rejects malformed percent-encoding', () => {
    expect(() => decodeUrl('%')).toThrow(
      'URL 解码失败：包含无效的百分号编码'
    )
    expect(() => decodeUrl('%ZZ')).toThrow(
      'URL 解码失败：包含无效的百分号编码'
    )
    expect(() => decodeUrl('%E0%A4%A')).toThrow(
      'URL 解码失败：包含无效的百分号编码'
    )
  })

  it('rejects invalid Unicode while encoding', () => {
    expect(() => encodeUrl('\uD800')).toThrow(
      'URL 编码失败：文本包含无效的 Unicode 字符'
    )
  })

  it('keeps empty input empty', () => {
    expect(encodeUrl('')).toBe('')
    expect(decodeUrl('')).toBe('')
  })
})
