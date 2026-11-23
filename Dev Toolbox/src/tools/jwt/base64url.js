const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/
const LOOKUP = new Int16Array(128).fill(-1)

for (let index = 0; index < ALPHABET.length; index += 1) {
  LOOKUP[ALPHABET.charCodeAt(index)] = index
}

export class Base64UrlError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'Base64UrlError'
    this.code = code
  }
}

function assertText(value) {
  if (typeof value !== 'string') {
    throw new Base64UrlError('type', 'Base64URL 内容必须是字符串')
  }
}

export function isBase64Url(value) {
  return typeof value === 'string' && BASE64URL_PATTERN.test(value)
}

export function decodeBase64Url(value) {
  assertText(value)

  if (!BASE64URL_PATTERN.test(value)) {
    throw new Base64UrlError(
      'alphabet',
      'Base64URL 仅允许字母、数字、- 和 _，不允许填充'
    )
  }

  if (value.length % 4 === 1) {
    throw new Base64UrlError('length', 'Base64URL 长度无效')
  }

  const remainder = value.length % 4
  if (remainder === 2) {
    const trailing = LOOKUP[value.charCodeAt(value.length - 1)]
    if ((trailing & 0b1111) !== 0) {
      throw new Base64UrlError(
        'trailing-bits',
        'Base64URL 末尾填充位不是规范形式'
      )
    }
  } else if (remainder === 3) {
    const trailing = LOOKUP[value.charCodeAt(value.length - 1)]
    if ((trailing & 0b11) !== 0) {
      throw new Base64UrlError(
        'trailing-bits',
        'Base64URL 末尾填充位不是规范形式'
      )
    }
  }

  const output = new Uint8Array(Math.floor((value.length * 6) / 8))
  let outputIndex = 0
  let buffer = 0
  let bits = 0

  for (let index = 0; index < value.length; index += 1) {
    buffer = ((buffer << 6) | LOOKUP[value.charCodeAt(index)]) & 0x3fff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      output[outputIndex] = (buffer >>> bits) & 0xff
      outputIndex += 1
      buffer &= (1 << bits) - 1
    }
  }

  return output
}

export function encodeBase64Url(bytes) {
  if (!(bytes instanceof Uint8Array) && !ArrayBuffer.isView(bytes)) {
    throw new Base64UrlError('type', 'Base64URL 编码需要 Uint8Array')
  }

  const source =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let output = ''

  for (let index = 0; index < source.length; index += 3) {
    const first = source[index]
    const second = source[index + 1]
    const third = source[index + 2]
    const remaining = source.length - index

    output += ALPHABET[first >>> 2]

    if (remaining === 1) {
      output += ALPHABET[(first & 0b11) << 4]
      continue
    }

    output += ALPHABET[((first & 0b11) << 4) | (second >>> 4)]

    if (remaining === 2) {
      output += ALPHABET[(second & 0b1111) << 2]
      continue
    }

    output += ALPHABET[((second & 0b1111) << 2) | (third >>> 6)]
    output += ALPHABET[third & 0b111111]
  }

  return output
}

export function encodeUtf8Base64Url(text) {
  if (typeof text !== 'string') {
    throw new Base64UrlError('type', 'Base64URL 文本编码需要字符串')
  }
  return encodeBase64Url(new TextEncoder().encode(text))
}

export function decodeUtf8Base64Url(value) {
  const bytes = decodeBase64Url(value)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Base64UrlError(
      'utf8',
      'Base64URL 内容不是有效的 UTF-8'
    )
  }
}
