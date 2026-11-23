import { describe, expect, it } from 'vitest'
import { inspectClaims } from './claims.js'

const NOW = 1_700_000_000_000

function entry(entries, name) {
  return entries.find((item) => item.name === name)
}

describe('standard claim inspection', () => {
  it('recognises typed string claims', () => {
    const result = inspectClaims(
      {
        iss: 'synthetic-issuer',
        sub: 'synthetic-subject',
        jti: 'synthetic-id',
        unknown: 'remains in payload text only'
      },
      NOW
    )

    expect(result.entries.map((item) => item.name)).toEqual([
      'iss',
      'sub',
      'jti'
    ])
    expect(result.hasWarnings).toBe(false)
    expect(entry(result.entries, 'iss').value).toBe(
      'synthetic-issuer'
    )
    expect(entry(result.entries, 'unknown')).toBeUndefined()
  })

  it('warns on wrong string and audience types without crashing', () => {
    const result = inspectClaims(
      {
        iss: 7,
        sub: null,
        jti: ['not', 'a', 'string'],
        aud: 42
      },
      NOW
    )

    expect(result.hasWarnings).toBe(true)
    for (const name of ['iss', 'sub', 'jti', 'aud']) {
      expect(entry(result.entries, name).state).toBe('warning')
      expect(entry(result.entries, name).message).toContain('类型错误')
    }
  })

  it('accepts string and string-array audiences', () => {
    const stringAudience = inspectClaims({ aud: 'app' }, NOW)
    expect(entry(stringAudience.entries, 'aud')).toMatchObject({
      value: 'app',
      state: 'info'
    })

    const arrayAudience = inspectClaims(
      { aud: ['app', 'api'] },
      NOW
    )
    expect(entry(arrayAudience.entries, 'aud')).toMatchObject({
      value: 'app, api',
      state: 'info'
    })
  })

  it('warns when an audience array contains non-string entries', () => {
    const result = inspectClaims(
      { aud: ['app', 7, null] },
      NOW
    )
    const audience = entry(result.entries, 'aud')

    expect(audience.state).toBe('warning')
    expect(audience.message).toContain('2 个非字符串条目')
    expect(result.hasWarnings).toBe(true)
  })

  it('uses inclusive exp expiry and nbf validity boundaries', () => {
    const expBoundary = inspectClaims(
      { exp: NOW / 1000 },
      NOW
    )
    expect(entry(expBoundary.entries, 'exp')).toMatchObject({
      state: 'warning',
      message: '已过期'
    })

    const expFuture = inspectClaims(
      { exp: NOW / 1000 + 1 },
      NOW
    )
    expect(entry(expFuture.entries, 'exp').message).toBe('未过期')

    const nbfBoundary = inspectClaims(
      { nbf: NOW / 1000 },
      NOW
    )
    expect(entry(nbfBoundary.entries, 'nbf')).toMatchObject({
      state: 'ok',
      message: '已生效'
    })

    const nbfFuture = inspectClaims(
      { nbf: NOW / 1000 + 1 },
      NOW
    )
    expect(entry(nbfFuture.entries, 'nbf')).toMatchObject({
      state: 'warning',
      message: '尚未生效'
    })
  })

  it('warns only when iat is in the future', () => {
    const current = inspectClaims(
      { iat: NOW / 1000 },
      NOW
    )
    expect(entry(current.entries, 'iat')).toMatchObject({
      state: 'ok',
      message: '签发时间已到达'
    })

    const future = inspectClaims(
      { iat: NOW / 1000 + 1 },
      NOW
    )
    expect(entry(future.entries, 'iat')).toMatchObject({
      state: 'warning',
      message: '签发时间在未来'
    })
  })

  it('warns on wrong numeric-date types and out-of-range values', () => {
    const wrongTypes = inspectClaims(
      {
        exp: '1700000000',
        nbf: null,
        iat: Number.POSITIVE_INFINITY
      },
      NOW
    )

    for (const name of ['exp', 'nbf', 'iat']) {
      expect(entry(wrongTypes.entries, name).state).toBe('warning')
      expect(entry(wrongTypes.entries, name).message).toContain(
        '类型错误'
      )
    }

    const outOfRange = inspectClaims(
      { exp: 9_000_000_000_000_000 },
      NOW
    )
    expect(entry(outOfRange.entries, 'exp')).toMatchObject({
      state: 'warning',
      message: '时间超出可表示范围'
    })
  })

  it('ignores prototype-shaped and unknown claims as entries', () => {
    const payload = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":"text","iss":"ok"}'
    )
    const result = inspectClaims(payload, NOW)

    expect(result.entries.map((item) => item.name)).toEqual(['iss'])
    expect({}.polluted).toBeUndefined()
  })
})
