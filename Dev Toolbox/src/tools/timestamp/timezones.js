export const TIMEZONE_TABLE = Object.freeze({
  '-11': {
    text: '中途岛标准时间',
    utc: 'Pacific/Pago_Pago'
  },
  '-10': {
    text: '夏威夷-阿留申标准时间',
    utc: 'Pacific/Johnston'
  },
  '-9:30': {
    text: '马克萨斯群岛标准时间',
    utc: 'Pacific/Marquesas'
  },
  '-9': {
    text: '阿拉斯加标准时间',
    utc: 'America/Anchorage'
  },
  '-8': {
    text: '太平洋标准时间',
    utc: 'America/Los_Angeles'
  },
  '-7': {
    text: '北美山区标准时间',
    utc: 'America/Boise'
  },
  '-6': {
    text: '北美中部标准时间',
    utc: 'America/Bahia_Banderas'
  },
  '-5': {
    text: '北美东部标准时间',
    utc: 'America/Atikokan'
  },
  '-4': {
    text: '大西洋标准时间',
    utc: 'America/Anguilla'
  },
  '-3:30': {
    text: '纽芬兰岛标准时间',
    utc: 'America/St_Johns'
  },
  '-3': {
    text: '南美标准时间',
    utc: 'America/Argentina/Cordoba'
  },
  '-2': {
    text: '巴西时间',
    utc: 'America/Noronha'
  },
  '-1': {
    text: '佛得角标准时间',
    utc: 'Atlantic/Cape_Verde'
  },
  '+1': {
    text: '欧洲中部时区',
    utc: 'Africa/Algiers'
  },
  '+2': {
    text: '欧洲东部时区',
    utc: 'Africa/Cairo'
  },
  '+3': {
    text: '莫斯科标准时间',
    utc: 'Europe/Moscow'
  },
  '+3:30': {
    text: '伊朗标准时间',
    utc: 'Asia/Tehran'
  },
  '+4': {
    text: '海湾标准时间',
    utc: 'Asia/Dubai'
  },
  '+4:30': {
    text: '阿富汗标准时间',
    utc: 'Asia/Kabul'
  },
  '+5': {
    text: '巴基斯坦标准时间',
    utc: 'Asia/Karachi'
  },
  '+5:30': {
    text: '印度标准时间',
    utc: 'Asia/Calcutta'
  },
  '+5:45': {
    text: '尼泊尔标准时间',
    utc: 'Asia/Kathmandu'
  },
  '+6': {
    text: '孟加拉国标准时间',
    utc: 'Asia/Dhaka'
  },
  '+6:30': {
    text: '缅甸标准时间',
    utc: 'Asia/Yangon'
  },
  '+7': {
    text: '科布多标准时间',
    utc: 'Asia/Hovd'
  },
  '+8': {
    text: '中国标准时间',
    utc: 'Asia/Shanghai'
  },
  '+9': {
    text: '日本标准时间',
    utc: 'Asia/Tokyo'
  },
  '+9:30': {
    text: '澳大利亚中部标准时间',
    utc: 'Australia/Darwin'
  },
  '+10': {
    text: '澳大利亚东部标准时间',
    utc: 'Australia/Lindeman'
  },
  '+11': {
    text: '瓦努阿图标准时间',
    utc: 'Pacific/Efate'
  },
  '+12': {
    text: '太平洋标准时间B',
    utc: 'Asia/Kamchatka'
  },
  '+12:45': {
    text: '查塔姆群岛标准时间',
    utc: 'Pacific/Chatham'
  },
  '+13': {
    text: '太平洋标准时间C',
    utc: 'Pacific/Fakaofo'
  },
  '+14': {
    text: '太平洋标准时间D',
    utc: 'Pacific/Kiritimati'
  }
})

export const TIMEZONE_KEYS = Object.freeze(Object.keys(TIMEZONE_TABLE))

export function isTimezoneOffsetKey(value) {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(TIMEZONE_TABLE, value)
  )
}

export function getTimezoneEntry(offsetKey) {
  return isTimezoneOffsetKey(offsetKey) ? TIMEZONE_TABLE[offsetKey] : null
}
