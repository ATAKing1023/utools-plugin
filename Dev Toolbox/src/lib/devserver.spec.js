import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEV_SERVER_PORT } from '../../vite.config.mjs'

const pluginJson = JSON.parse(readFileSync('public/plugin.json', 'utf8'))

describe('development server configuration', () => {
  it('points plugin.json development.main at the dev server port', () => {
    expect(pluginJson.development?.main).toBe(
      `http://127.0.0.1:${DEV_SERVER_PORT}`
    )
  })

  it('uses a dedicated port that does not collide with the vite default', () => {
    expect(DEV_SERVER_PORT).not.toBe(5173)
    expect(Number.isInteger(DEV_SERVER_PORT)).toBe(true)
    expect(DEV_SERVER_PORT).toBeGreaterThan(1024)
    expect(DEV_SERVER_PORT).toBeLessThan(65536)
  })

  it('keeps the dev server host and port in sync with plugin.json', () => {
    const url = new URL(pluginJson.development.main)

    expect(url.hostname).toBe('127.0.0.1')
    expect(Number(url.port)).toBe(DEV_SERVER_PORT)
  })
})
