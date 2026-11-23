export function encodeUrl(input) {
  try {
    return encodeURIComponent(String(input ?? ''))
  } catch {
    throw new Error('URL 编码失败：文本包含无效的 Unicode 字符')
  }
}

export function decodeUrl(input) {
  try {
    return decodeURIComponent(String(input ?? ''))
  } catch {
    throw new Error('URL 解码失败：包含无效的百分号编码')
  }
}
