export const FEATURES = Object.freeze([
  Object.freeze({
    code: 'timestamp',
    name: '时间戳转换',
    description: '日期时间格式转换',
    cmd: '时间戳转换'
  }),
  Object.freeze({
    code: 'uuid',
    name: 'UUID 生成',
    description: '生成 UUID',
    cmd: 'UUID 生成'
  }),
  Object.freeze({
    code: 'base64',
    name: 'Base64 编解码',
    description: 'Base64 编码与解码',
    cmd: 'Base64 编解码'
  }),
  Object.freeze({
    code: 'url',
    name: 'URL 编解码',
    description: 'URL 编码与解码',
    cmd: 'URL 编解码'
  }),
  Object.freeze({
    code: 'diff',
    name: '文本 Diff',
    description: '文本差异对比',
    cmd: '文本 Diff'
  }),
  Object.freeze({
    code: 'json',
    name: 'JSON 工具',
    description: 'JSON 可视化与格式化',
    cmd: 'JSON 工具'
  }),
  Object.freeze({
    code: 'xml',
    name: 'XML 工具',
    description: 'XML 可视化与格式化',
    cmd: 'XML 工具'
  }),
  Object.freeze({
    code: 'jwt',
    name: 'JWT 工具',
    description: 'JWT 解析、验证与签名',
    cmd: 'JWT 工具'
  })
])

const featuresByCode = new Map(FEATURES.map((feature) => [feature.code, feature]))

export function getFeature(code) {
  if (typeof code !== 'string') return null
  return featuresByCode.get(code) || null
}

export function isFeatureCode(code) {
  return getFeature(code) !== null
}
