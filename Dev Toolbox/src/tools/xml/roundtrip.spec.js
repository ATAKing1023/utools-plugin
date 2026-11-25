import { describe, expect, it } from 'vitest'
import {
  jsonToTypeScriptInterface,
  jsonToXml
} from '../json/actions.js'
import { formatXmlText, validateXml, xmlToJson } from './logic.js'

describe('xml and json conversion round trips', () => {
  it('converts xml to json and back to the same structure', () => {
    const xml =
      '<root id="1"><name>Ada</name><tag>a</tag><tag>b</tag></root>'

    const converted = xmlToJson(xml)
    expect(converted.ok).toBe(true)

    const roundTripped = jsonToXml(converted.value)
    expect(roundTripped).toBe(xml)
  })

  it('round trips nested elements and mixed content', () => {
    const xml =
      '<root><group name="g"><item>1</item></group><note>text</note></root>'

    const converted = xmlToJson(xml)
    expect(converted.ok).toBe(true)
    expect(jsonToXml(converted.value)).toBe(xml)
  })

  it('produces a parseable xml document from any converted json', () => {
    const sources = [
      '<root/>',
      '<root></root>',
      '<root>text</root>',
      '<root a="1" b="2"/>',
      '<root><a/><b/></root>',
      '<root><a>1</a><a>2</a></root>'
    ]

    for (const source of sources) {
      const converted = xmlToJson(source)
      expect(converted.ok).toBe(true)

      const xml = jsonToXml(converted.value)
      expect(validateXml(xml).ok).toBe(true)
    }
  })

  it('keeps the converted json aligned with the json tool xml detection', async () => {
    const { detectJsonSource } = await import('../json/actions.js')
    const xml = '<root id="1"><name>Ada</name></root>'

    const fromXmlTool = xmlToJson(xml)
    const fromJsonTool = detectJsonSource(xml)

    expect(fromJsonTool.ok).toBe(true)
    expect(fromJsonTool.source).toBe('xml')
    expect(fromJsonTool.value).toEqual(fromXmlTool.value)
  })

  it('converts converted xml json into a valid typescript interface', () => {
    const converted = xmlToJson('<root id="1"><name>Ada</name></root>')
    const typescript = jsonToTypeScriptInterface(converted.value)

    expect(typescript).toContain('export interface RootObject {')
    expect(typescript).toContain('  "@id": string;')
    expect(typescript).toContain('  name: string;')
  })

  it('keeps the formatted xml equivalent to the source structure', () => {
    const xml = '<root id="1"><name>Ada</name></root>'
    const formatted = formatXmlText(xml)

    expect(formatted.ok).toBe(true)

    const before = xmlToJson(xml)
    const after = xmlToJson(formatted.value)
    expect(after.value).toEqual(before.value)
  })

  it('round trips json through xml without adding wrapper keys', () => {
    const original = {
      version: '3.0.0-SNAPSHOT',
      dashboardList: [
        {
          id: 'dashboard-a',
          name: '每日运行指导书',
          config: {
            componentList: [{ id: 'c1' }, { id: 'c2' }]
          }
        },
        {
          id: 'dashboard-b',
          name: '第二块看板'
        }
      ]
    }

    const xml = jsonToXml(original)
    const converted = xmlToJson(xml)

    expect(converted.ok).toBe(true)
    expect(converted.value).toEqual(original)
  })

  it('round trips single root element names that are not the synthetic root', () => {
    const original = {
      user: { id: '1', name: 'Ada' }
    }

    const xml = jsonToXml(original)
    const converted = xmlToJson(xml)

    expect(converted.value).toEqual(original)
  })
})
