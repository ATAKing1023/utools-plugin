import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encodeBase64Url } from './base64url.js'
import {
  JwtCryptoError,
  createJwtCrypto,
  getHashAlgorithm,
  importHmacKey,
  isCryptoAvailable,
  signHmac,
  verifyHmac
} from './crypto.js'

const KAT = Object.freeze([
  {
    algorithm: 'HS256',
    secret: 'dev-toolbox-s7-hs256-secret-000',
    signingInput:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzeW50aGV0aWMtand0IiwiaXNzIjoic3ludGhldGljLWlzc3VlciIsImF1ZCI6WyJkZXYtdG9vbGJveCJdLCJpYXQiOjE3NjM4NTYwMDAsImV4cCI6MTc2Mzg2MzIwMH0',
    signature: 'LFVymmux6nAe-JGghDREeH8mzYSAT4JkTgI0CZXZ7hQ'
  },
  {
    algorithm: 'HS384',
    secret: 's7-HS384-密钥-🌍',
    signingInput:
      'eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9.eyJzdWIiOiLlkIjmiJDmtYvor5Ug8J-MjSIsImp0aSI6IjAxSlRFU1RWRUNUT1IifQ',
    signature:
      'nWcyVP01tEdxispWHNXqicy1HR3MnoHGSdhOUnb40sjliUyS0JoyV7sgKn5vt449'
  },
  {
    algorithm: 'HS512',
    secret: `s7-HS512-${'x'.repeat(64)}`,
    signingInput:
      'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzeW50aGV0aWMtand0IiwiYXVkIjoiZGV2LXRvb2xib3gifQ',
    signature:
      'Nk3S_Ny2R3m6gDGIULL5UbEP7nLPt9eCb0YwUq0ST4DG2UupxFEfRB1HoP9apP6iuWBHNcaG5SoV1PkPWftZiw'
  }
])

describe('Web Crypto HMAC known-answer tests', () => {
  it.each(KAT)(
    'signs and verifies the independent $algorithm vector',
    async ({ algorithm, secret, signingInput, signature }) => {
      const bytes = await signHmac(
        webcrypto,
        algorithm,
        secret,
        signingInput
      )
      expect(encodeBase64Url(bytes)).toBe(signature)

      expect(
        await verifyHmac(
          webcrypto,
          algorithm,
          secret,
          signingInput,
          signature
        )
      ).toBe(true)
      expect(
        await verifyHmac(
          webcrypto,
          algorithm,
          secret,
          signingInput,
          bytes
        )
      ).toBe(true)
    }
  )

  it('rejects wrong secrets, tampered input and cross-algorithm signatures', async () => {
    const [hs256, hs384, hs512] = KAT

    expect(
      await verifyHmac(
        webcrypto,
        hs256.algorithm,
        `${hs256.secret}-wrong`,
        hs256.signingInput,
        hs256.signature
      )
    ).toBe(false)
    expect(
      await verifyHmac(
        webcrypto,
        hs256.algorithm,
        hs256.secret,
        `${hs256.signingInput}x`,
        hs256.signature
      )
    ).toBe(false)
    expect(
      await verifyHmac(
        webcrypto,
        hs384.algorithm,
        hs256.secret,
        hs256.signingInput,
        hs256.signature
      )
    ).toBe(false)
    expect(
      await verifyHmac(
        webcrypto,
        hs512.algorithm,
        hs512.secret,
        hs512.signingInput,
        new Uint8Array([1, 2, 3])
      )
    ).toBe(false)
  })

  it('imports a raw UTF-8 secret as a non-extractable HMAC key', async () => {
    const key = await importHmacKey(
      webcrypto,
      'HS384',
      's7-HS384-密钥-🌍',
      ['sign']
    )

    expect(key.extractable).toBe(false)
    expect(key.algorithm).toMatchObject({
      name: 'HMAC',
      hash: { name: 'SHA-384' }
    })
    expect(key.usages).toEqual(['sign'])
    await expect(
      webcrypto.subtle.exportKey('raw', key)
    ).rejects.toThrow()
  })

  it('maps only the allowlisted HS algorithms', () => {
    expect(getHashAlgorithm('HS256')).toBe('SHA-256')
    expect(getHashAlgorithm('HS384')).toBe('SHA-384')
    expect(getHashAlgorithm('HS512')).toBe('SHA-512')
    expect(getHashAlgorithm('RS256')).toBeNull()
    expect(getHashAlgorithm('none')).toBeNull()
  })
})

describe('crypto availability and failure handling', () => {
  it('fails closed when subtle is absent', async () => {
    expect(isCryptoAvailable({})).toBe(false)
    expect(isCryptoAvailable(undefined)).toBe(false)

    await expect(
      signHmac({}, 'HS256', 'secret', 'input')
    ).rejects.toMatchObject({ code: 'unavailable' })
    await expect(
      verifyHmac({}, 'HS256', 'secret', 'input', 'c2ln')
    ).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('rejects unsupported algorithms before provider use', async () => {
    await expect(
      signHmac(webcrypto, 'RS256', 'secret', 'input')
    ).rejects.toMatchObject({ code: 'unsupported_algorithm' })
    await expect(
      verifyHmac(webcrypto, 'none', 'secret', 'input', '')
    ).rejects.toBeInstanceOf(JwtCryptoError)
  })

  it('sanitises provider rejection text containing secret canaries', async () => {
    const canary =
      'SECRET_CANARY_provider_error_4f9d7a'
    const provider = {
      subtle: {
        async importKey() {
          throw new Error(`provider leaked ${canary}`)
        },
        async sign() {
          throw new Error(`provider leaked ${canary}`)
        },
        async verify() {
          throw new Error(`provider leaked ${canary}`)
        }
      }
    }

    let signError
    try {
      await signHmac(provider, 'HS256', canary, 'input')
    } catch (error) {
      signError = error
    }
    expect(signError).toBeInstanceOf(JwtCryptoError)
    expect(signError.code).toBe('provider_failed')
    expect(signError.message).not.toContain(canary)

    let verifyError
    try {
      await verifyHmac(
        provider,
        'HS256',
        canary,
        'input',
        new Uint8Array([1])
      )
    } catch (error) {
      verifyError = error
    }
    expect(verifyError).toBeInstanceOf(JwtCryptoError)
    expect(verifyError.message).not.toContain(canary)
  })

  it('reads crypto.subtle at operation time', async () => {
    let provider = {}
    const client = createJwtCrypto(() => provider)

    expect(client.isAvailable()).toBe(false)
    provider = { subtle: webcrypto.subtle }
    expect(client.isAvailable()).toBe(true)

    const signature = await client.sign(
      'HS256',
      KAT[0].secret,
      KAT[0].signingInput
    )
    expect(client.encodeSignature(signature)).toBe(KAT[0].signature)
  })

  it('uses subtle.verify rather than a manual MAC comparison', () => {
    const source = readFileSync(
      'src/tools/jwt/crypto.js',
      'utf8'
    )

    expect(source).toContain('subtle.verify')
    expect(source).not.toMatch(
      /signatureBytes\s*===|===\s*signatureBytes|timingSafeEqual/
    )
  })
})
