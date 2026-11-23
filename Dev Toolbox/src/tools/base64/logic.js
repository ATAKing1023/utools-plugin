const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const BINARY_CHUNK_SIZE = 0x8000

function bytesToBinary(bytes) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += BINARY_CHUNK_SIZE) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + BINARY_CHUNK_SIZE)
    )
  }
  return binary
}

export function encodeBase64(input) {
  const text = String(input ?? '')
  if (!text) return ''

  try {
    const bytes = new TextEncoder().encode(text)
    return btoa(bytesToBinary(bytes))
  } catch {
    throw new Error('文本无法编码为 Base64')
  }
}

export function decodeBase64(input) {
  const value = String(input ?? '')
  if (!value) return ''

  if (value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) {
    throw new Error('Base64 格式无效，请检查字符和末尾填充')
  }

  let binary
  try {
    binary = atob(value)
  } catch {
    throw new Error('Base64 格式无效，请检查字符和末尾填充')
  }

  if (btoa(binary) !== value) {
    throw new Error('Base64 格式无效，请检查字符和末尾填充')
  }

  const bytes = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0)
  )

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('Base64 解码结果不是有效的 UTF-8 文本')
  }
}
