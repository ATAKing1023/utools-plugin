import {
  Base64UrlError,
  decodeBase64Url,
  encodeUtf8Base64Url
} from './base64url.js'

export const JWT_LIMITS = Object.freeze({
  tokenBytes: 64 * 1024,
  headerBytes: 8 * 1024,
  payloadBytes: 48 * 1024,
  signatureChars: 8 * 1024,
  secretBytes: 4 * 1024,
  jsonDepth: 64
})

export const JWT_HMAC_ALGORITHMS = Object.freeze([
  'HS256',
  'HS384',
  'HS512'
])

export const JWT_HMAC_ALGORITHM_OPTIONS = Object.freeze(
  JWT_HMAC_ALGORITHMS.map((value) => ({ value, label: value }))
)

export const HMAC_MIN_SECRET_BYTES = Object.freeze({
  HS256: 32,
  HS384: 48,
  HS512: 64
})

export const HEADER_KEY_FIELDS = Object.freeze([
  'jwk',
  'jku',
  'x5c',
  'x5u'
])

export const DEFAULT_HEADER = '{"alg":"HS256","typ":"JWT"}'
export const DEFAULT_PAYLOAD = '{}'

const BASE64URL_MESSAGES = Object.freeze({
  alphabet: 'Base64URL 含有非法字符或填充',
  length: 'Base64URL 长度无效',
  'trailing-bits': 'Base64URL 末尾填充位不是规范形式',
  type: 'Base64URL 内容类型无效'
})

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function failure(code, message, field = null) {
  return {
    ok: false,
    error: {
      code,
      message,
      field
    }
  }
}

function success(value) {
  return { ok: true, value }
}

export function getUtf8ByteLength(text) {
  if (typeof text !== 'string') return 0
  return new TextEncoder().encode(text).length
}

export function isHmacAlgorithm(algorithm) {
  return JWT_HMAC_ALGORITHMS.includes(algorithm)
}

export function getMinimumSecretBytes(algorithm) {
  return HMAC_MIN_SECRET_BYTES[algorithm] || null
}

export function inspectHeaderKeyFields(header) {
  if (!isPlainObject(header)) return []
  return HEADER_KEY_FIELDS.filter((field) => hasOwn(header, field))
}

export function validateSecret(secret, algorithm) {
  if (typeof secret !== 'string' || secret.length === 0) {
    return failure('secret_empty', '请输入签名密钥', 'secret')
  }

  const byteLength = getUtf8ByteLength(secret)
  if (byteLength > JWT_LIMITS.secretBytes) {
    return failure(
      'secret_limit',
      '签名密钥超过 4 KiB 上限',
      'secret'
    )
  }

  const minimumBytes = getMinimumSecretBytes(algorithm)
  return success({
    byteLength,
    minimumBytes,
    weak: Boolean(minimumBytes && byteLength < minimumBytes)
  })
}

export function getJsonDepth(text) {
  let depth = 0
  let maximum = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
    } else if (character === '{' || character === '[') {
      depth += 1
      maximum = Math.max(maximum, depth)
    } else if (character === '}' || character === ']') {
      depth = Math.max(0, depth - 1)
    }
  }

  return maximum
}

export function parseJsonObject(text, options) {
  const { field, limits = JWT_LIMITS } = options
  const byteLimit =
    field === 'header' ? limits.headerBytes : limits.payloadBytes
  const byteLength =
    typeof text === 'string' ? getUtf8ByteLength(text) : 0

  if (byteLength > byteLimit) {
    return failure(
      `${field}_limit`,
      field === 'header'
        ? '解码后的 Header 超过 8 KiB 上限'
        : '解码后的 Payload 超过 48 KiB 上限',
      field
    )
  }

  let value
  try {
    value = JSON.parse(text)
  } catch {
    return failure(
      `${field}_json`,
      field === 'header' ? 'Header 不是有效 JSON' : 'Payload 不是有效 JSON',
      field
    )
  }

  if (!isPlainObject(value)) {
    return failure(
      `${field}_object`,
      field === 'header'
        ? 'Header 顶层必须是 JSON 对象'
        : 'Payload 顶层必须是 JSON 对象',
      field
    )
  }

  if (getJsonDepth(text) > limits.jsonDepth) {
    return failure(
      `${field}_depth`,
      field === 'header'
        ? 'Header JSON 嵌套超过 64 层'
        : 'Payload JSON 嵌套超过 64 层',
      field
    )
  }

  return success({ value, byteLength })
}

function decodeField(segment, field, limits, utf8) {
  let bytes
  try {
    bytes = decodeBase64Url(segment)
  } catch (error) {
    const code =
      error instanceof Base64UrlError ? error.code : 'invalid'
    return failure(
      `${field}_base64url_${code}`,
      `${field === 'header' ? 'Header' : field === 'payload' ? 'Payload' : 'Signature'} 的 ${
        BASE64URL_MESSAGES[code] || 'Base64URL 格式无效'
      }`,
      field
    )
  }

  if (utf8) {
    const limit =
      field === 'header' ? limits.headerBytes : limits.payloadBytes
    if (bytes.length > limit) {
      return failure(
        `${field}_limit`,
        field === 'header'
          ? '解码后的 Header 超过 8 KiB 上限'
          : '解码后的 Payload 超过 48 KiB 上限',
        field
      )
    }

    try {
      const text = new TextDecoder('utf-8', {
        fatal: true
      }).decode(bytes)
      return success({ bytes, text })
    } catch {
      return failure(
        `${field}_utf8`,
        field === 'header'
          ? 'Header 不是有效的 UTF-8'
          : 'Payload 不是有效的 UTF-8',
        field
      )
    }
  }

  return success({ bytes })
}

function headerUnsupportedReason(header) {
  if (hasOwn(header, 'crit')) {
    const supported =
      Array.isArray(header.crit) && header.crit.length === 0
    if (!supported) return 'header_crit'
  }

  if (hasOwn(header, 'b64') && header.b64 !== true) {
    return 'header_b64'
  }

  return null
}

export function parseCompactJws(input, options = {}) {
  if (typeof input !== 'string') {
    return failure('token_type', 'JWT 输入必须是字符串', 'token')
  }

  const limits = { ...JWT_LIMITS, ...(options.limits || {}) }
  const token = input.trim()

  if (!token) {
    return failure('token_empty', '请输入 JWT', 'token')
  }

  if (getUtf8ByteLength(token) > limits.tokenBytes) {
    return failure(
      'token_limit',
      'JWT 超过 64 KiB UTF-8 上限',
      'token'
    )
  }

  if (/\s/.test(token)) {
    return failure(
      'token_internal_whitespace',
      'JWT 内部不允许包含空白字符',
      'token'
    )
  }

  const segments = token.split('.')
  if (segments.length === 5) {
    return failure(
      'jwe_unsupported',
      '检测到 JWE（5 段），本工具不支持 JWE',
      'token'
    )
  }

  if (segments.length !== 3) {
    return failure(
      'jws_segments',
      `紧凑 JWS 必须恰好包含 3 段，当前为 ${segments.length} 段`,
      'token'
    )
  }

  const [headerSegment, payloadSegment, signatureSegment] = segments
  if (!headerSegment) {
    return failure('header_empty', 'Header 段不能为空', 'header')
  }
  if (!payloadSegment) {
    return failure('payload_empty', 'Payload 段不能为空', 'payload')
  }

  if (signatureSegment.length > limits.signatureChars) {
    return failure(
      'signature_limit',
      'Signature 段超过 8 KiB 编码字符上限',
      'signature'
    )
  }

  const headerDecoded = decodeField(
    headerSegment,
    'header',
    limits,
    true
  )
  if (!headerDecoded.ok) return headerDecoded

  const payloadDecoded = decodeField(
    payloadSegment,
    'payload',
    limits,
    true
  )
  if (!payloadDecoded.ok) return payloadDecoded

  const signatureDecoded = decodeField(
    signatureSegment,
    'signature',
    limits,
    false
  )
  if (!signatureDecoded.ok) return signatureDecoded

  const headerParsed = parseJsonObject(headerDecoded.value.text, {
    field: 'header',
    limits
  })
  if (!headerParsed.ok) return headerParsed

  const payloadParsed = parseJsonObject(payloadDecoded.value.text, {
    field: 'payload',
    limits
  })
  if (!payloadParsed.ok) return payloadParsed

  const header = headerParsed.value.value
  if (typeof header.alg !== 'string' || !header.alg) {
    return failure(
      'header_alg',
      'Header alg 必须是非空字符串',
      'header'
    )
  }

  const headerKeys = inspectHeaderKeyFields(header)
  const unsupportedReason = headerUnsupportedReason(header)
  const emptySignature = signatureSegment.length === 0
  const unsecured = header.alg === 'none' || emptySignature

  let status = '未验证'
  let canVerify = true
  if (unsecured) {
    status = '无签名/不安全'
    canVerify = false
  } else if (unsupportedReason || !isHmacAlgorithm(header.alg)) {
    status = '算法不支持'
    canVerify = false
  }

  return success({
    token,
    headerSegment,
    payloadSegment,
    signatureSegment,
    signatureBytes: signatureDecoded.value.bytes,
    signatureByteLength: signatureDecoded.value.bytes.length,
    signingInput: `${headerSegment}.${payloadSegment}`,
    headerText: headerDecoded.value.text,
    payloadText: payloadDecoded.value.text,
    header,
    payload: payloadParsed.value.value,
    algorithm: header.alg,
    emptySignature,
    unsecured,
    unsupportedReason,
    canVerify,
    status,
    headerKeys
  })
}

export function prepareSigningInput(input, options = {}) {
  const limits = { ...JWT_LIMITS, ...(options.limits || {}) }
  const algorithm =
    typeof input.algorithm === 'string' ? input.algorithm : ''

  if (!isHmacAlgorithm(algorithm)) {
    return failure(
      'sign_algorithm_unsupported',
      '请选择 HS256、HS384 或 HS512',
      'algorithm'
    )
  }

  const headerParsed = parseJsonObject(input.headerText, {
    field: 'header',
    limits
  })
  if (!headerParsed.ok) return headerParsed

  const payloadParsed = parseJsonObject(input.payloadText, {
    field: 'payload',
    limits
  })
  if (!payloadParsed.ok) return payloadParsed

  const header = headerParsed.value.value
  if (typeof header.alg !== 'string' || !header.alg) {
    return failure(
      'header_alg',
      'Header alg 必须是非空字符串',
      'header'
    )
  }

  if (header.alg !== algorithm) {
    return failure(
      'sign_algorithm_mismatch',
      'Header alg 必须与所选签名算法一致',
      'header'
    )
  }

  if (!isHmacAlgorithm(header.alg)) {
    return failure(
      'sign_algorithm_unsupported',
      '仅支持 HS256、HS384 和 HS512 签名',
      'header'
    )
  }

  const unsupportedReason = headerUnsupportedReason(header)
  if (unsupportedReason === 'header_crit') {
    return failure(
      'sign_crit_unsupported',
      'Header crit 非空，生成已阻止',
      'header'
    )
  }
  if (unsupportedReason === 'header_b64') {
    return failure(
      'sign_b64_unsupported',
      'Header b64:false 不受支持，生成已阻止',
      'header'
    )
  }

  let minifiedHeader
  let minifiedPayload
  try {
    minifiedHeader = JSON.stringify(header)
    minifiedPayload = JSON.stringify(payloadParsed.value.value)
  } catch {
    return failure(
      'sign_json_serialization',
      'Header 或 Payload 无法序列化为 JSON',
      'header'
    )
  }

  const headerSegment = encodeUtf8Base64Url(minifiedHeader)
  const payloadSegment = encodeUtf8Base64Url(minifiedPayload)
  const signingInput = `${headerSegment}.${payloadSegment}`

  return success({
    algorithm,
    header,
    payload: payloadParsed.value.value,
    headerText: minifiedHeader,
    payloadText: minifiedPayload,
    headerSegment,
    payloadSegment,
    signingInput,
    headerKeys: inspectHeaderKeyFields(header)
  })
}

export function finalizeGeneratedJws(
  headerSegment,
  payloadSegment,
  signatureSegment,
  options = {}
) {
  const limits = { ...JWT_LIMITS, ...(options.limits || {}) }
  const token = `${headerSegment}.${payloadSegment}.${signatureSegment}`

  if (getUtf8ByteLength(token) > limits.tokenBytes) {
    return failure(
      'generated_token_limit',
      '生成的 JWT 超过 64 KiB UTF-8 上限',
      'token'
    )
  }

  return success({ token, signatureSegment })
}
