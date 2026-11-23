export function createUtoolsDouble({ macOS = false, initialStorage = {} } = {}) {
  const storage = new Map(Object.entries(initialStorage))
  const enterListeners = []
  const outListeners = []
  const events = []
  const calls = {
    enter: [],
    out: [],
    copyText: [],
    hideMainWindow: [],
    dbGet: [],
    dbSet: [],
    dbRemove: []
  }

  function record(name, args) {
    events.push({ name, args })
  }

  const utools = {
    onPluginEnter(callback) {
      if (typeof callback === 'function') enterListeners.push(callback)
    },
    onPluginOut(callback) {
      if (typeof callback === 'function') outListeners.push(callback)
    },
    hideMainWindow(isFocusPrevWindow) {
      calls.hideMainWindow.push(isFocusPrevWindow)
      record('hideMainWindow', [isFocusPrevWindow])
      return true
    },
    copyText(text) {
      calls.copyText.push(text)
      record('copyText', [text])
      return true
    },
    isMacOS() {
      return macOS
    },
    dbStorage: {
      getItem(key) {
        calls.dbGet.push(key)
        record('dbGet', [key])
        return storage.has(key) ? storage.get(key) : null
      },
      setItem(key, value) {
        calls.dbSet.push([key, value])
        record('dbSet', [key, value])
        storage.set(key, value)
      },
      removeItem(key) {
        calls.dbRemove.push(key)
        record('dbRemove', [key])
        return storage.delete(key)
      }
    }
  }

  const double = {
    utools,
    calls,
    events,
    enter(action) {
      calls.enter.push(action)
      enterListeners.forEach((listener) => listener(action))
    },
    out(isKill = false) {
      calls.out.push(isKill)
      outListeners.forEach((listener) => listener(isKill))
    },
    listenerCounts() {
      return {
        enter: enterListeners.length,
        out: outListeners.length
      }
    },
    resetCalls() {
      Object.values(calls).forEach((entries) => {
        entries.length = 0
      })
      events.length = 0
    }
  }

  return double
}

export function installUtoolsDouble(options) {
  const double = createUtoolsDouble(options)
  window.utools = double.utools
  window.__utoolsTest = {
    enter: double.enter,
    out: double.out,
    listenerCounts: double.listenerCounts,
    resetCalls: double.resetCalls
  }
  return double
}
