const STRING_CLAIMS = Object.freeze(['iss', 'sub', 'jti'])
const NUMERIC_DATE_CLAIMS = Object.freeze(['exp', 'nbf', 'iat'])
const MAX_DATE_MILLISECONDS = 8.64e15

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatUtc(timestamp) {
  return new Date(timestamp).toISOString()
}

function typeLabel(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function stringClaim(name, value) {
  if (typeof value === 'string') {
    return {
      name,
      value,
      state: 'info',
      message: '字符串'
    }
  }

  return {
    name,
    value: typeLabel(value),
    state: 'warning',
    message: '类型错误：应为字符串'
  }
}

function audienceClaim(value) {
  if (typeof value === 'string') {
    return {
      name: 'aud',
      value,
      state: 'info',
      message: '字符串受众'
    }
  }

  if (!Array.isArray(value)) {
    return {
      name: 'aud',
      value: typeLabel(value),
      state: 'warning',
      message: '类型错误：应为字符串或字符串数组'
    }
  }

  if (value.length === 0) {
    return {
      name: 'aud',
      value: '[]',
      state: 'warning',
      message: '受众数组为空'
    }
  }

  const nonStringCount = value.filter(
    (entry) => typeof entry !== 'string'
  ).length
  const display = value
    .map((entry) =>
      typeof entry === 'string' ? entry : `[${typeLabel(entry)}]`
    )
    .join(', ')

  return {
    name: 'aud',
    value: display,
    state: nonStringCount ? 'warning' : 'info',
    message: nonStringCount
      ? `受众数组包含 ${nonStringCount} 个非字符串条目`
      : `字符串数组受众（${value.length} 项）`
  }
}

function numericDateClaim(name, value, nowMs) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return {
      name,
      value: typeLabel(value),
      state: 'warning',
      message: '类型错误：NumericDate 秒数应为有限数值'
    }
  }

  const timestamp = value * 1000
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(timestamp) > MAX_DATE_MILLISECONDS
  ) {
    return {
      name,
      value: String(value),
      state: 'warning',
      message: '时间超出可表示范围'
    }
  }

  const iso = formatUtc(timestamp)
  const display = `${value} · ${iso}`

  if (name === 'exp') {
    const expired = nowMs >= timestamp
    return {
      name,
      value: display,
      state: expired ? 'warning' : 'ok',
      message: expired ? '已过期' : '未过期'
    }
  }

  if (name === 'nbf') {
    const notYetValid = nowMs < timestamp
    return {
      name,
      value: display,
      state: notYetValid ? 'warning' : 'ok',
      message: notYetValid ? '尚未生效' : '已生效'
    }
  }

  const future = nowMs < timestamp
  return {
    name,
    value: display,
    state: future ? 'warning' : 'ok',
    message: future ? '签发时间在未来' : '签发时间已到达'
  }
}

export function inspectClaims(payload, nowMs = Date.now()) {
  if (!isPlainObject(payload)) {
    return { entries: [], hasWarnings: false }
  }

  const currentTime = Number.isFinite(nowMs) ? nowMs : Date.now()
  const entries = []

  for (const name of STRING_CLAIMS) {
    if (hasOwn(payload, name)) {
      entries.push(stringClaim(name, payload[name]))
    }
  }

  if (hasOwn(payload, 'aud')) {
    entries.push(audienceClaim(payload.aud))
  }

  for (const name of NUMERIC_DATE_CLAIMS) {
    if (hasOwn(payload, name)) {
      entries.push(numericDateClaim(name, payload[name], currentTime))
    }
  }

  return {
    entries,
    hasWarnings: entries.some((entry) => entry.state === 'warning')
  }
}
