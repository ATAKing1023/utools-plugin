import { describe, expect, it } from 'vitest'
import { encodeUtf8Base64Url } from './base64url.js'
import {
  DEFAULT_HEADER,
  DEFAULT_PAYLOAD,
  JWT_LIMITS,
  finalizeGeneratedJws,
  getJsonDepth,
  parseCompactJws,
  parseJsonObject,
  prepareSigningInput,
  validateSecret
} from './logic.js'

const SIGNATURE = 'c2lnbmF0dXJl'

function segment(text) {
  return encodeUtf8Base64Url(text)
}

function directToken(headerText, payloadText, signature = SIGNATURE) {
  return `${segment(headerText)}.${segment(payloadText)}.${signature}`
}

function objectToken(header, payload, signature = SIGNATURE) {
  return directToken(
    JSON.stringify(header),
    JSON.stringify(payload),
    signature
  )
}

describe('compact JWS parsing', () => {
  it('accepts exactly three segments and preserves exact decoded text', () => {
    const headerText =
      '{"alg":"HS256","typ":"JWT","jwk":{"kty":"ignored"}}'
    const payloadText =
      '{"n":9007199254740993,"x":1e400,"dup":1,"dup":2,"__proto__":{"polluted":true}}'
    const parsed = parseCompactJws(
      directToken(headerText, payloadText)
    )

    expect(parsed.ok).toBe(true)
    expect(parsed.value.headerText).toBe(headerText)
    expect(parsed.value.payloadText).toBe(payloadText)
    expect(parsed.value.signatureSegment).toBe(SIGNATURE)
    expect(parsed.value.signatureByteLength).toBe(9)
    expect(parsed.value.status).toBe('未验证')
    expect(parsed.value.headerKeys).toEqual(['jwk'])
    expect({}.polluted).toBeUndefined()
  })

  it('accepts an empty signature only as an explicit unsafe display', () => {
    const parsed = parseCompactJws(
      directToken('{"alg":"HS256"}', '{"sub":"empty"}', '')
    )

    expect(parsed.ok).toBe(true)
    expect(parsed.value.emptySignature).toBe(true)
    expect(parsed.value.signatureByteLength).toBe(0)
    expect(parsed.value.canVerify).toBe(false)
    expect(parsed.value.status).toBe('无签名/不安全')
  })

  it('reports two, four and five segments distinctly', () => {
    const header = segment('{"alg":"HS256"}')
    const payload = segment('{}')

    expect(parseCompactJws(`${header}.${payload}`).error.code).toBe(
      'jws_segments'
    )
    expect(
      parseCompactJws(`${header}.${payload}.${SIGNATURE}.extra`).error
        .code
    ).toBe('jws_segments')
    expect(
      parseCompactJws(
        `${header}.${payload}.${SIGNATURE}.four.five`
      ).error.code
    ).toBe('jwe_unsupported')
  })

  it('rejects internal whitespace, empty fields and empty tokens', () => {
    const token = objectToken({ alg: 'HS256' }, {})

    expect(parseCompactJws('   ').error.code).toBe('token_empty')
    expect(
      parseCompactJws(token.replace('.', '. ')).error.code
    ).toBe('token_internal_whitespace')
    expect(parseCompactJws(`.${segment('{}')}.${SIGNATURE}`).error.code).toBe(
      'header_empty'
    )
    expect(
      parseCompactJws(`${segment('{"alg":"HS256"}' )}..${SIGNATURE}`).error
        .code
    ).toBe('payload_empty')
  })

  it('trims only the outer whitespace before parsing', () => {
    const token = objectToken({ alg: 'HS256' }, { sub: 'trimmed' })
    const parsed = parseCompactJws(`\n\t${token}\r\n`)

    expect(parsed.ok).toBe(true)
    expect(parsed.value.token).toBe(token)
  })

  it('rejects malformed and non-canonical Base64URL segments', () => {
    const header = segment('{"alg":"HS256"}')
    const payload = segment('{}')

    expect(
      parseCompactJws(`${header}+.${payload}.${SIGNATURE}`).error.code
    ).toContain('header_base64url')
    expect(
      parseCompactJws(`${header}.${payload}.${SIGNATURE}=`).error.code
    ).toContain('signature_base64url')
    expect(
      parseCompactJws(`${header}.${payload}.A`).error.code
    ).toContain('signature_base64url')
  })

  it('rejects invalid UTF-8 and non-object JSON roots', () => {
    expect(
      parseCompactJws(
        `_w.${segment('{}')}.${SIGNATURE}`
      ).error.code
    ).toBe('header_utf8')
    expect(
      parseCompactJws(
        `${segment('[]')}.${segment('{}')}.${SIGNATURE}`
      ).error.code
    ).toBe('header_object')
    expect(
      parseCompactJws(
        `${segment('{"alg":"HS256"}')}.${segment('"text"')}.${SIGNATURE}`
      ).error.code
    ).toBe('payload_object')
    expect(
      parseCompactJws(
        `${segment('{"alg":"HS256"}')}.${segment('{broken')}.${SIGNATURE}`
      ).error.code
    ).toBe('payload_json')
  })

  it('requires a string alg and blocks crit/b64 extensions', () => {
    expect(
      parseCompactJws(
        objectToken({ alg: null }, {})
      ).error.code
    ).toBe('header_alg')
    expect(
      parseCompactJws(
        objectToken({ alg: 'HS256', crit: ['exp'] }, {})
      ).value.status
    ).toBe('算法不支持')
    expect(
      parseCompactJws(
        objectToken({ alg: 'HS256', b64: false }, {})
      ).value.status
    ).toBe('算法不支持')
    expect(
      parseCompactJws(
        objectToken({ alg: 'HS256', crit: [] }, {})
      ).value.canVerify
    ).toBe(true)
  })

  it('distinguishes none, empty-signature and unsupported algorithms', () => {
    const none = parseCompactJws(
      directToken('{"alg":"none"}', '{}', '')
    ).value
    expect(none.status).toBe('无签名/不安全')
    expect(none.canVerify).toBe(false)

    const rs256 = parseCompactJws(
      objectToken({ alg: 'RS256' }, {})
    ).value
    expect(rs256.status).toBe('算法不支持')
    expect(rs256.canVerify).toBe(false)
  })

  it('detects all ignored header key fields without using them', () => {
    const parsed = parseCompactJws(
      objectToken(
        {
          alg: 'HS256',
          jwk: { kty: 'oct', k: 'ignored' },
          jku: 'https://invalid.example/jwks',
          x5c: ['ignored'],
          x5u: 'https://invalid.example/cert'
        },
        {}
      )
    )

    expect(parsed.value.headerKeys).toEqual([
      'jwk',
      'jku',
      'x5c',
      'x5u'
    ])
    expect(parsed.value.canVerify).toBe(true)
  })

  it('enforces the signature encoded-character limit exactly', () => {
    const header = segment('{"alg":"HS256"}')
    const payload = segment('{}')
    const atLimit = parseCompactJws(
      `${header}.${payload}.${'A'.repeat(JWT_LIMITS.signatureChars)}`
    )
    const overLimit = parseCompactJws(
      `${header}.${payload}.${'A'.repeat(
        JWT_LIMITS.signatureChars + 1
      )}`
    )

    expect(atLimit.ok).toBe(true)
    expect(overLimit.error.code).toBe('signature_limit')
  })

  it('accepts the raw token at 64 KiB and rejects one byte over', () => {
    const header = segment('{"alg":"HS256"}')
    const signature = 'A'.repeat(8192)
    const payloadText = `{"x":"${'a'.repeat(42983)}"}`
    const token = `${header}.${segment(payloadText)}.${signature}`

    expect(token.length).toBe(JWT_LIMITS.tokenBytes)
    expect(parseCompactJws(token).ok).toBe(true)
    expect(parseCompactJws(`${token}A`).error.code).toBe(
      'token_limit'
    )
  })

  it('uses UTF-8 bytes for secret limits and boundary warnings', () => {
    const exact = 'a'.repeat(JWT_LIMITS.secretBytes)
    const over = `${exact}a`
    const unicodeExact = `${'a'.repeat(
      JWT_LIMITS.secretBytes - 6
    )}密钥`

    expect(validateSecret(exact, 'HS256').ok).toBe(true)
    expect(validateSecret(exact, 'HS256').value.weak).toBe(false)
    expect(validateSecret(over, 'HS256').error.code).toBe(
      'secret_limit'
    )
    expect(validateSecret(unicodeExact, 'HS256').ok).toBe(true)
    expect(validateSecret('short', 'HS512').value.weak).toBe(true)
    expect(validateSecret('', 'HS256').error.code).toBe(
      'secret_empty'
    )
  })

  it('sanitises errors so token content is not echoed', () => {
    const parsed = parseCompactJws(
      `CANARY_TOKEN_123!@#.${segment('{}')}.${SIGNATURE}`
    )
    expect(parsed.error.message).not.toContain('CANARY_TOKEN_123')
  })
})

describe('JSON depth and field limits', () => {
  function nested(depth) {
    let value = {}
    let current = value
    for (let index = 1; index < depth; index += 1) {
      current.next = {}
      current = current.next
    }
    return JSON.stringify(value)
  }

  it('counts nested object/array containers and accepts depth 64', () => {
    expect(getJsonDepth(nested(64))).toBe(64)
    expect(getJsonDepth('{"text":"[[[not depth]]]"}')).toBe(1)

    const accepted = parseCompactJws(
      directToken('{"alg":"HS256"}', nested(64))
    )
    const rejected = parseCompactJws(
      directToken('{"alg":"HS256"}', nested(65))
    )

    expect(accepted.ok).toBe(true)
    expect(rejected.error.code).toBe('payload_depth')
  })

  function sizedHeader(bytes) {
    const prefix = '{"alg":"HS256","x":"'
    const suffix = '"}'
    return `${prefix}${'a'.repeat(bytes - prefix.length - suffix.length)}${suffix}`
  }

  function sizedPayload(bytes) {
    const prefix = '{"x":"'
    const suffix = '"}'
    return `${prefix}${'a'.repeat(bytes - prefix.length - suffix.length)}${suffix}`
  }

  it('accepts header and payload limits exactly and rejects +1', () => {
    expect(
      parseJsonObject(sizedHeader(JWT_LIMITS.headerBytes), {
        field: 'header'
      }).ok
    ).toBe(true)
    expect(
      parseJsonObject(sizedHeader(JWT_LIMITS.headerBytes + 1), {
        field: 'header'
      }).error.code
    ).toBe('header_limit')
    expect(
      parseJsonObject(sizedPayload(JWT_LIMITS.payloadBytes), {
        field: 'payload'
      }).ok
    ).toBe(true)
    expect(
      parseJsonObject(sizedPayload(JWT_LIMITS.payloadBytes + 1), {
        field: 'payload'
      }).error.code
    ).toBe('payload_limit')
  })
})

describe('encoder preparation', () => {
  it('minifies object JSON and creates the exact signing input', () => {
    const prepared = prepareSigningInput({
      headerText: '{ "typ" : "JWT", "alg" : "HS256" }',
      payloadText: '{ "sub" : "synthetic" }',
      algorithm: 'HS256'
    })

    expect(prepared.ok).toBe(true)
    expect(prepared.value.headerText).toBe(
      '{"typ":"JWT","alg":"HS256"}'
    )
    expect(prepared.value.payloadText).toBe(
      '{"sub":"synthetic"}'
    )
    expect(prepared.value.signingInput).toBe(
      `${segment('{"typ":"JWT","alg":"HS256"}')}.${segment(
        '{"sub":"synthetic"}'
      )}`
    )
  })

  it('accepts the documented defaults', () => {
    const prepared = prepareSigningInput({
      headerText: DEFAULT_HEADER,
      payloadText: DEFAULT_PAYLOAD,
      algorithm: 'HS256'
    })

    expect(prepared.ok).toBe(true)
    expect(prepared.value.header).toEqual({
      alg: 'HS256',
      typ: 'JWT'
    })
    expect(prepared.value.payload).toEqual({})
  })

  it('rejects non-object and malformed JSON', () => {
    expect(
      prepareSigningInput({
        headerText: '[]',
        payloadText: '{}',
        algorithm: 'HS256'
      }).error.code
    ).toBe('header_object')
    expect(
      prepareSigningInput({
        headerText: DEFAULT_HEADER,
        payloadText: 'null',
        algorithm: 'HS256'
      }).error.code
    ).toBe('payload_object')
    expect(
      prepareSigningInput({
        headerText: '{',
        payloadText: '{}',
        algorithm: 'HS256'
      }).error.code
    ).toBe('header_json')
  })

  it('rejects algorithm mismatch, none and unsupported algorithms', () => {
    expect(
      prepareSigningInput({
        headerText: '{"alg":"HS256"}',
        payloadText: '{}',
        algorithm: 'HS384'
      }).error.code
    ).toBe('sign_algorithm_mismatch')
    expect(
      prepareSigningInput({
        headerText: '{"alg":"none"}',
        payloadText: '{}',
        algorithm: 'HS256'
      }).error.code
    ).toBe('sign_algorithm_mismatch')
    expect(
      prepareSigningInput({
        headerText: '{"alg":"RS256"}',
        payloadText: '{}',
        algorithm: 'RS256'
      }).error.code
    ).toBe('sign_algorithm_unsupported')
  })

  it('blocks crit and b64:false for generation', () => {
    expect(
      prepareSigningInput({
        headerText: '{"alg":"HS256","crit":["exp"]}',
        payloadText: '{}',
        algorithm: 'HS256'
      }).error.code
    ).toBe('sign_crit_unsupported')
    expect(
      prepareSigningInput({
        headerText: '{"alg":"HS256","b64":false}',
        payloadText: '{}',
        algorithm: 'HS256'
      }).error.code
    ).toBe('sign_b64_unsupported')
  })

  it('allows header key fields only as ignored metadata', () => {
    const prepared = prepareSigningInput({
      headerText:
        '{"alg":"HS256","jku":"https://invalid.example/jwks","x5u":"https://invalid.example/cert"}',
      payloadText: '{}',
      algorithm: 'HS256'
    })

    expect(prepared.ok).toBe(true)
    expect(prepared.value.headerKeys).toEqual(['jku', 'x5u'])
  })

  it('enforces the generated token limit at finalisation', () => {
    const token = finalizeGeneratedJws(
      'a',
      'b',
      'c'
    )
    expect(token.ok).toBe(true)

    expect(
      finalizeGeneratedJws(
        'a'.repeat(40_000),
        'b'.repeat(30_000),
        'c'
      ).error.code
    ).toBe('generated_token_limit')
  })
})
