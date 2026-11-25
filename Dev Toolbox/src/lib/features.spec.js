import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FEATURES, getFeature, isFeatureCode } from './features.js'

const expectedFeatures = [
  ['home', '开发工具箱', '全部工具统一入口', '开发工具箱'],
  ['timestamp', '时间戳转换', '日期时间格式转换', '时间戳转换'],
  ['uuid', 'UUID 生成', '生成 UUID', 'UUID 生成'],
  ['base64', 'Base64 编解码', 'Base64 编码与解码', 'Base64 编解码'],
  ['url', 'URL 编解码', 'URL 编码与解码', 'URL 编解码'],
  ['diff', '文本 Diff', '文本差异对比', '文本 Diff'],
  ['json', 'JSON 工具', 'JSON 可视化与格式化', 'JSON 工具'],
  ['xml', 'XML 工具', 'XML 可视化与格式化', 'XML 工具'],
  ['jwt', 'JWT 工具', 'JWT 解析、验证与签名', 'JWT 工具']
]

const pluginJson = JSON.parse(readFileSync('public/plugin.json', 'utf8'))

describe('frozen feature metadata', () => {
  it('exports exactly the nine frozen features and no extras', () => {
    expect(FEATURES.map((feature) => feature.code)).toEqual(
      expectedFeatures.map(([code]) => code)
    )
    expect(
      FEATURES.map(({ code, name, description, cmd }) => [
        code,
        name,
        description,
        cmd
      ])
    ).toEqual(expectedFeatures)
    expect(getFeature('timestamp')?.name).toBe('时间戳转换')
    expect(isFeatureCode('uuid')).toBe(true)
    expect(getFeature('unknown')).toBeNull()
  })

  it('keeps plugin.json aligned with the frozen metadata', () => {
    expect(pluginJson.main).toBe('index.html')
    expect(pluginJson.logo).toBe('logo.png')
    expect(pluginJson.preload).toBeUndefined()
    expect(pluginJson.pluginSetting).toEqual({ single: false })
    expect(pluginJson.features).toHaveLength(expectedFeatures.length)
    expect(pluginJson.features.map((feature) => feature.code)).toEqual(
      expectedFeatures.map(([code]) => code)
    )

    for (const [index, feature] of pluginJson.features.entries()) {
      const [, , description, cmd] = expectedFeatures[index]
      expect(feature.explain).toBe(description)
      expect(feature.description).toBe(description)
      expect(feature.cmds).toContain(cmd)
      expect(feature.cmds.some((entry) => typeof entry === 'string')).toBe(true)
    }
  })
})
