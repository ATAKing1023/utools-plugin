import { describe, expect, it } from 'vitest'
import {
  UUID_V4_PATTERN,
  createUuidFromBytes,
  generateUuid,
  toUuidRows
} from './logic.js'

const KNOWN_UUID = '123e4567-e89b-42d3-a456-426614174000'

describe('UUID generation', () => {
  it('uses crypto.randomUUID and produces a v4-shaped result', () => {
    const source = { randomUUID: () => KNOWN_UUID }
    const uuid = generateUuid(source)

    expect(uuid).toBe(KNOWN_UUID)
    expect(uuid).toMatch(UUID_V4_PATTERN)
  })

  it('falls back to crypto.getRandomValues with version and variant bits', () => {
    const source = {
      getRandomValues(bytes) {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = index
        }
        return bytes
      }
    }

    expect(generateUuid(source)).toBe(
      '00010203-0405-4607-8809-0a0b0c0d0e0f'
    )
    expect(generateUuid(source)).toMatch(UUID_V4_PATTERN)
    expect(
      createUuidFromBytes(
        Uint8Array.from({ length: 16 }, (_, index) => index)
      )
    ).toMatch(UUID_V4_PATTERN)
  })

  it('falls back when randomUUID throws and fails safely when crypto is absent', () => {
    const source = {
      randomUUID() {
        throw new Error('not available')
      },
      getRandomValues(bytes) {
        bytes.fill(255)
        return bytes
      }
    }

    expect(generateUuid(source)).toBe(
      'ffffffff-ffff-4fff-bfff-ffffffffffff'
    )
    expect(() => generateUuid(null)).toThrow(
      '当前环境不支持安全随机数，无法生成 UUID'
    )
  })

  it('produces a different value on a subsequent generation', () => {
    let call = 0
    const source = {
      randomUUID: () =>
        call++ === 0
          ? KNOWN_UUID
          : '123e4567-e89b-42d3-a456-426614174001'
    }

    const first = generateUuid(source)
    const second = generateUuid(source)
    expect(second).not.toBe(first)
  })
})

describe('UUID output rows', () => {
  it('builds the four exact transformations', () => {
    expect(toUuidRows(KNOWN_UUID)).toEqual([
      { label: '小写', value: '123e4567-e89b-42d3-a456-426614174000' },
      { label: '大写', value: '123E4567-E89B-42D3-A456-426614174000' },
      { label: '去掉[-]小写', value: '123e4567e89b42d3a456426614174000' },
      { label: '去掉[-]大写', value: '123E4567E89B42D3A456426614174000' }
    ])
  })

  it('rejects malformed values instead of fabricating rows', () => {
    expect(() => toUuidRows('not-a-uuid')).toThrow('生成的 UUID 格式无效')
  })
})
