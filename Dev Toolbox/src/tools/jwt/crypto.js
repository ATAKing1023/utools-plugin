import {
  decodeBase64Url,
  encodeBase64Url
} from './base64url.js'
import {
  JWT_HMAC_ALGORITHMS,
  isHmacAlgorithm
} from './logic.js'

const HASH_BY_ALGORITHM = Object.freeze({
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512'
})

export class JwtCryptoError extends Error {
  constructor(code) {
    super(
      code === 'provider_failed'
        ? 'Web Crypto 操作失败'
        : 'Web Crypto 不可用或算法不受支持'
    )
    this.name = 'JwtCryptoError'
    this.code = code
  }
}

export { JWT_HMAC_ALGORITHMS }

export function getHashAlgorithm(algorithm) {
  return HASH_BY_ALGORITHM[algorithm] || null
}

export function getSubtle(provider) {
  try {
    const subtle = provider && provider.subtle
    if (
      !subtle ||
      typeof subtle.importKey !== 'function' ||
      typeof subtle.sign !== 'function' ||
      typeof subtle.verify !== 'function'
    ) {
      return null
    }
    return subtle
  } catch {
    return null
  }
}

export function isCryptoAvailable(provider) {
  return getSubtle(provider) !== null
}

function requireAlgorithm(algorithm) {
  const hash = getHashAlgorithm(algorithm)
  if (!hash || !isHmacAlgorithm(algorithm)) {
    throw new JwtCryptoError('unsupported_algorithm')
  }
  return hash
}

function requireSubtle(provider) {
  const subtle = getSubtle(provider)
  if (!subtle) throw new JwtCryptoError('unavailable')
  return subtle
}

async function providerOperation(operation) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof JwtCryptoError) throw error
    throw new JwtCryptoError('provider_failed')
  }
}

export function importHmacKey(
  provider,
  algorithm,
  secret,
  usages = ['sign', 'verify']
) {
  return providerOperation(async () => {
    const subtle = requireSubtle(provider)
    const hash = requireAlgorithm(algorithm)
    const secretBytes = new TextEncoder().encode(String(secret))
    return subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash },
      false,
      usages
    )
  })
}

export function signHmac(provider, algorithm, secret, signingInput) {
  return providerOperation(async () => {
    const subtle = requireSubtle(provider)
    const hash = requireAlgorithm(algorithm)
    const key = await importHmacKey(provider, algorithm, secret, ['sign'])
    const signature = await subtle.sign(
      { name: 'HMAC', hash },
      key,
      new TextEncoder().encode(String(signingInput))
    )
    return new Uint8Array(signature)
  })
}

export function verifyHmac(
  provider,
  algorithm,
  secret,
  signingInput,
  signature
) {
  return providerOperation(async () => {
    const subtle = requireSubtle(provider)
    const hash = requireAlgorithm(algorithm)
    const signatureBytes =
      signature instanceof Uint8Array
        ? signature
        : decodeBase64Url(String(signature ?? ''))
    const key = await importHmacKey(provider, algorithm, secret, ['verify'])
    return Boolean(
      await subtle.verify(
        { name: 'HMAC', hash },
        key,
        signatureBytes,
        new TextEncoder().encode(String(signingInput))
      )
    )
  })
}

export function createJwtCrypto(getProvider) {
  const provider = () => {
    if (typeof getProvider === 'function') return getProvider()
    if (getProvider !== undefined) return getProvider
    return globalThis.crypto
  }

  return {
    isAvailable() {
      return isCryptoAvailable(provider())
    },
    sign(algorithm, secret, signingInput) {
      return signHmac(provider(), algorithm, secret, signingInput)
    },
    verify(algorithm, secret, signingInput, signature) {
      return verifyHmac(
        provider(),
        algorithm,
        secret,
        signingInput,
        signature
      )
    },
    encodeSignature(signature) {
      return encodeBase64Url(signature)
    }
  }
}
