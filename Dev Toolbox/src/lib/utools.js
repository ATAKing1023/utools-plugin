function getUtools() {
  if (typeof window === 'undefined') return null
  return window.utools && typeof window.utools === 'object' ? window.utools : null
}

export function isMacOS() {
  try {
    const utools = getUtools()
    return Boolean(utools && typeof utools.isMacOS === 'function' && utools.isMacOS())
  } catch {
    return false
  }
}

export function copyText(text) {
  try {
    const utools = getUtools()
    if (!utools || typeof utools.copyText !== 'function') return false
    return Boolean(utools.copyText(String(text)))
  } catch {
    return false
  }
}

export function hideMainWindow(isFocusPrevWindow) {
  try {
    const utools = getUtools()
    if (!utools || typeof utools.hideMainWindow !== 'function') return false
    return Boolean(utools.hideMainWindow(isFocusPrevWindow))
  } catch {
    return false
  }
}

export function dbGet(key) {
  try {
    const dbStorage = getUtools()?.dbStorage
    if (!dbStorage || typeof dbStorage.getItem !== 'function') return null
    return dbStorage.getItem(key)
  } catch {
    return null
  }
}

export function dbSet(key, value) {
  try {
    const dbStorage = getUtools()?.dbStorage
    if (!dbStorage || typeof dbStorage.setItem !== 'function') return false
    dbStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function onPluginEnter(callback) {
  try {
    const utools = getUtools()
    if (!utools || typeof utools.onPluginEnter !== 'function') return false
    if (typeof callback !== 'function') return false
    utools.onPluginEnter(callback)
    return true
  } catch {
    return false
  }
}

export function onPluginOut(callback) {
  try {
    const utools = getUtools()
    if (!utools || typeof utools.onPluginOut !== 'function') return false
    if (typeof callback !== 'function') return false
    utools.onPluginOut(callback)
    return true
  } catch {
    return false
  }
}
