import { describe, expect, it } from 'vitest'
import {
  TIMEZONE_KEYS,
  TIMEZONE_TABLE,
  getTimezoneEntry,
  isTimezoneOffsetKey
} from './timezones.js'

const EXPECTED_ENTRIES = [
  ['-11', '中途岛标准时间', 'Pacific/Pago_Pago'],
  ['-10', '夏威夷-阿留申标准时间', 'Pacific/Johnston'],
  ['-9:30', '马克萨斯群岛标准时间', 'Pacific/Marquesas'],
  ['-9', '阿拉斯加标准时间', 'America/Anchorage'],
  ['-8', '太平洋标准时间', 'America/Los_Angeles'],
  ['-7', '北美山区标准时间', 'America/Boise'],
  ['-6', '北美中部标准时间', 'America/Bahia_Banderas'],
  ['-5', '北美东部标准时间', 'America/Atikokan'],
  ['-4', '大西洋标准时间', 'America/Anguilla'],
  ['-3:30', '纽芬兰岛标准时间', 'America/St_Johns'],
  ['-3', '南美标准时间', 'America/Argentina/Cordoba'],
  ['-2', '巴西时间', 'America/Noronha'],
  ['-1', '佛得角标准时间', 'Atlantic/Cape_Verde'],
  ['+1', '欧洲中部时区', 'Africa/Algiers'],
  ['+2', '欧洲东部时区', 'Africa/Cairo'],
  ['+3', '莫斯科标准时间', 'Europe/Moscow'],
  ['+3:30', '伊朗标准时间', 'Asia/Tehran'],
  ['+4', '海湾标准时间', 'Asia/Dubai'],
  ['+4:30', '阿富汗标准时间', 'Asia/Kabul'],
  ['+5', '巴基斯坦标准时间', 'Asia/Karachi'],
  ['+5:30', '印度标准时间', 'Asia/Calcutta'],
  ['+5:45', '尼泊尔标准时间', 'Asia/Kathmandu'],
  ['+6', '孟加拉国标准时间', 'Asia/Dhaka'],
  ['+6:30', '缅甸标准时间', 'Asia/Yangon'],
  ['+7', '科布多标准时间', 'Asia/Hovd'],
  ['+8', '中国标准时间', 'Asia/Shanghai'],
  ['+9', '日本标准时间', 'Asia/Tokyo'],
  ['+9:30', '澳大利亚中部标准时间', 'Australia/Darwin'],
  ['+10', '澳大利亚东部标准时间', 'Australia/Lindeman'],
  ['+11', '瓦努阿图标准时间', 'Pacific/Efate'],
  ['+12', '太平洋标准时间B', 'Asia/Kamchatka'],
  ['+12:45', '查塔姆群岛标准时间', 'Pacific/Chatham'],
  ['+13', '太平洋标准时间C', 'Pacific/Fakaofo'],
  ['+14', '太平洋标准时间D', 'Pacific/Kiritimati']
]

describe('timezone table', () => {
  it('contains the exact 34 entries in reference order', () => {
    expect(Object.entries(TIMEZONE_TABLE)).toEqual(
      EXPECTED_ENTRIES.map(([key, text, utc]) => [key, { text, utc }])
    )
    expect(TIMEZONE_KEYS).toEqual(EXPECTED_ENTRIES.map(([key]) => key))
    expect(TIMEZONE_KEYS).toHaveLength(34)
    expect(TIMEZONE_KEYS).not.toContain('0')
    expect(TIMEZONE_KEYS).not.toContain('-12')
  })

  it('looks up only known offset keys', () => {
    expect(getTimezoneEntry('+8')).toEqual({
      text: '中国标准时间',
      utc: 'Asia/Shanghai'
    })
    expect(getTimezoneEntry('0')).toBeNull()
    expect(getTimezoneEntry('-12')).toBeNull()
    expect(isTimezoneOffsetKey(8)).toBe(false)
    expect(isTimezoneOffsetKey('+14')).toBe(true)
    expect(isTimezoneOffsetKey('toString')).toBe(false)
  })
})
