export const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const UUID_BYTE_LENGTH = 16

export function createUuidFromBytes(bytes) {
  if (!bytes || typeof bytes.length !== 'number' || bytes.length < UUID_BYTE_LENGTH) {
    throw new Error('UUID 随机字节不足')
  }

  const values = Uint8Array.from(bytes).slice(0, UUID_BYTE_LENGTH)
  values[6] = (values[6] & 0x0f) | 0x40
  values[8] = (values[8] & 0x3f) | 0x80

  const hex = Array.from(values, (value) => value.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join('')
  ].join('-')
}

export function generateUuid(cryptoSource = globalThis.crypto) {
  if (cryptoSource && typeof cryptoSource.randomUUID === 'function') {
    try {
      const generated = String(cryptoSource.randomUUID())
      if (UUID_V4_PATTERN.test(generated)) return generated
    } catch {}
  }

  if (cryptoSource && typeof cryptoSource.getRandomValues === 'function') {
    const bytes = new Uint8Array(UUID_BYTE_LENGTH)
    cryptoSource.getRandomValues(bytes)
    return createUuidFromBytes(bytes)
  }

  throw new Error('当前环境不支持安全随机数，无法生成 UUID')
}

export function toUuidRows(uuid) {
  const lower = String(uuid).toLowerCase()
  if (!UUID_V4_PATTERN.test(lower)) {
    throw new Error('生成的 UUID 格式无效')
  }

  return [
    { label: '小写', value: lower },
    { label: '大写', value: lower.toUpperCase() },
    { label: '去掉[-]小写', value: lower.replace(/-/g, '') },
    { label: '去掉[-]大写', value: lower.replace(/-/g, '').toUpperCase() }
  ]
}
