import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test as base, expect } from '@playwright/test'

const appRoot = fileURLToPath(new URL('../../', import.meta.url))

export const APP_URL = pathToFileURL(
  path.join(appRoot, 'dist', 'index.html')
).href

export const test = base.extend({
  utoolsDouble: [
    async ({ context }, use) => {
      await context.addInitScript(() => {
        const storage = new Map()
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

        const record = (name, args) => {
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
            return false
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

        window.utools = utools
        window.__utoolsTest = {
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
          getCalls() {
            return JSON.parse(JSON.stringify(calls))
          },
          getEvents() {
            return events.slice()
          },
          resetCalls() {
            Object.values(calls).forEach((entries) => {
              entries.length = 0
            })
            events.length = 0
          }
        }
      })

      await use()
    },
    { auto: true }
  ]
})

export function collectPageErrors(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

export async function openApp(page) {
  await page.goto(APP_URL, { waitUntil: 'load' })
  await page.locator('.app-shell').waitFor()
}

export { expect }
