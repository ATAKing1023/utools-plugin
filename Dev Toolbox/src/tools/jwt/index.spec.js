import { flushPromises, mount } from '@vue/test-utils'
import { webcrypto } from 'node:crypto'
import { nextTick } from 'vue'
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'
import { installUtoolsDouble } from '../../test/utoolsDouble.js'
import JwtTool from './index.vue'
import {
  decodeUtf8Base64Url,
  encodeBase64Url,
  encodeUtf8Base64Url
} from './base64url.js'
import { signHmac, verifyHmac } from './crypto.js'

const SECRET = 'dev-toolbox-s7-hs256-secret-000'
const NOW = 1_763_856_000_000

async function createSignedToken({
  header = { alg: 'HS256', typ: 'JWT' },
  payload = {
    sub: 'synthetic-component',
    iss: 'synthetic-issuer',
    aud: ['dev-toolbox'],
    iat: 1_763_856_000,
    exp: 1_763_863_200
  },
  secret = SECRET,
  algorithm = 'HS256'
} = {}) {
  const headerText = JSON.stringify(header)
  const payloadText = JSON.stringify(payload)
  const signingInput = `${encodeUtf8Base64Url(
    headerText
  )}.${encodeUtf8Base64Url(payloadText)}`
  const signature = encodeBase64Url(
    await signHmac(webcrypto, algorithm, secret, signingInput)
  )
  return {
    token: `${signingInput}.${signature}`,
    headerText,
    payloadText,
    signingInput,
    signature
  }
}

function createUnsignedToken(header, payload, signature = 'c2ln') {
  return `${encodeUtf8Base64Url(
    JSON.stringify(header)
  )}.${encodeUtf8Base64Url(JSON.stringify(payload))}.${signature}`
}

function mountTool({
  cryptoProvider = webcrypto,
  now = () => NOW
} = {}) {
  const double = installUtoolsDouble()
  const wrapper = mount(JwtTool, {
    props: {
      action: {
        code: 'jwt',
        type: 'text',
        payload: 'JWT 工具',
        from: 'main'
      },
      cryptoProvider,
      now
    },
    attachTo: document.body
  })
  return { wrapper, double }
}

async function settle() {
  for (let index = 0; index < 8; index += 1) {
    await flushPromises()
    await Promise.resolve()
    await nextTick()
  }
}

async function waitForText(wrapper, selector, expected) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const node = wrapper.find(selector)
    if (node.exists() && node.text() === expected) return
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
  throw new Error(
    `Timed out waiting for ${selector} to equal ${expected}`
  )
}

function findButton(wrapper, text) {
  return wrapper
    .findAll('button')
    .find((button) => button.text() === text)
}

function danglingAriaReferences(wrapper) {
  const elements = [
    wrapper.element,
    ...wrapper.element.querySelectorAll('*')
  ]
  const referenceAttributes = [
    'aria-describedby',
    'aria-labelledby',
    'aria-controls'
  ]
  const dangling = []

  for (const element of elements) {
    for (const attribute of referenceAttributes) {
      const value = element.getAttribute(attribute)
      if (!value) continue
      for (const id of value.split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) {
          dangling.push({
            element: element.tagName,
            id: element.id,
            attribute,
            target: id
          })
        }
      }
    }
  }

  return dangling
}

function createDeferredProvider() {
  const verifyCalls = []
  const signCalls = []
  const provider = {
    subtle: {
      async importKey() {
        return {}
      },
      sign() {
        return new Promise((resolve, reject) => {
          signCalls.push({ resolve, reject })
        })
      },
      verify() {
        return new Promise((resolve, reject) => {
          verifyCalls.push({ resolve, reject })
        })
      }
    }
  }

  return { provider, verifyCalls, signCalls }
}

async function waitForCall(calls) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (calls.length) return
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('expected provider call did not start')
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('JWT decoder UI', () => {
  it('keeps every ARIA reference resolvable across decoder states', async () => {
    const { wrapper } = mountTool()
    const token = wrapper.get('#jwt-token-input')

    expect(danglingAriaReferences(wrapper)).toEqual([])

    await token.setValue('malformed.invalid.token!')
    expect(wrapper.get('[role="alert"]')).toBeTruthy()
    expect(danglingAriaReferences(wrapper)).toEqual([])

    await token.setValue(createUnsignedToken({ alg: 'HS256' }, {}))
    await settle()
    expect(danglingAriaReferences(wrapper)).toEqual([])
    expect(token.attributes('aria-describedby')).toBe(
      'jwt-verify-status'
    )
    expect(
      wrapper.element.querySelectorAll('#jwt-verify-status')
    ).toHaveLength(1)
    expect(
      document.getElementById('jwt-verify-status')
    ).toBeTruthy()
  })

  it('auto-focuses, starts unverified and displays exact decoded text', async () => {
    const signed = await createSignedToken()
    const { wrapper } = mountTool()

    expect(document.activeElement).toBe(
      wrapper.get('#jwt-token-input').element
    )
    expect(
      wrapper
        .findAll('[role="tab"]')
        .map((tab) => tab.text())
    ).toEqual(['解析 / 验证', '生成 / 签名'])
    expect(
      wrapper
        .get('[role="tab"][aria-selected="true"]')
        .text()
    ).toBe('解析 / 验证')
    await wrapper.get('#jwt-token-input').setValue(signed.token)
    await settle()

    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '未验证'
    )
    expect(wrapper.get('[data-tool="jwt"]').attributes('data-mode')).toBe(
      'decode'
    )

    const rows = wrapper.findAll('.output-row')
    expect(rows).toHaveLength(3)
    expect(rows[0].get('.output-row__label').text()).toBe('Header JSON')
    expect(rows[0].get('.output-row__value').text()).toBe(
      signed.headerText
    )
    expect(rows[1].get('.output-row__label').text()).toBe('Payload JSON')
    expect(rows[1].get('.output-row__value').text()).toBe(
      signed.payloadText
    )
    expect(rows[2].get('.output-row__label').text()).toBe(
      'Signature (Base64URL, 32 字节)'
    )
    expect(rows[2].get('.output-row__value').text()).toBe(
      signed.signature
    )
    expect(wrapper.text()).toContain('标准声明')
    expect(wrapper.get('[data-claim="exp"]').text()).toContain('未过期')
    expect(wrapper.get('[data-claim="aud"]').text()).toContain(
      'dev-toolbox'
    )
    expect(wrapper.text()).toContain('声明时间检查不等于签名验证')
  })

  it('masks secrets, exposes attributes and toggles aria-pressed', async () => {
    const { wrapper } = mountTool()
    await wrapper
      .get('#jwt-token-input')
      .setValue(createUnsignedToken({ alg: 'HS256' }, {}))
    const secret = wrapper.get('#jwt-verify-secret')
    const toggle = findButton(wrapper, '显示密钥')

    expect(secret.attributes('type')).toBe('password')
    expect(secret.attributes('autocomplete')).toBe('new-password')
    expect(secret.attributes('autocapitalize')).toBe('off')
    expect(secret.attributes('spellcheck')).toBe('false')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    expect(toggle.attributes('aria-label')).toBe('显示验证密钥')

    await toggle.trigger('click')
    expect(wrapper.get('#jwt-verify-secret').attributes('type')).toBe(
      'text'
    )
    expect(findButton(wrapper, '隐藏密钥').attributes('aria-pressed')).toBe(
      'true'
    )

    await findButton(wrapper, '隐藏密钥').trigger('click')
    expect(wrapper.get('#jwt-verify-secret').attributes('type')).toBe(
      'password'
    )
    expect(findButton(wrapper, '显示密钥').attributes('aria-pressed')).toBe(
      'false'
    )
  })

  it('verifies explicitly, rejects wrong secrets and resets on edits', async () => {
    const signed = await createSignedToken()
    const { wrapper } = mountTool()
    const token = wrapper.get('#jwt-token-input')

    await token.setValue(signed.token)
    const secret = wrapper.get('#jwt-verify-secret')
    await secret.setValue(SECRET)
    const verify = findButton(wrapper, '验证签名')
    expect(verify.attributes('disabled')).toBeUndefined()

    await verify.trigger('click')
    await waitForText(
      wrapper,
      '[data-testid="jwt-verify-status"]',
      '签名已验证'
    )

    await secret.setValue(`${SECRET}-wrong`)
    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '未验证'
    )
    await findButton(wrapper, '验证签名').trigger('click')
    await waitForText(
      wrapper,
      '[data-testid="jwt-verify-status"]',
      '签名无效'
    )
    expect(wrapper.findAll('.output-row')).toHaveLength(3)

    await token.setValue(`${signed.token}A`)
    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '未验证'
    )
  })

  it('shows no-signature, unsupported and malformed states safely', async () => {
    const { wrapper } = mountTool()
    const token = wrapper.get('#jwt-token-input')

    await token.setValue(
      createUnsignedToken({ alg: 'none' }, { sub: 'unsecured' }, '')
    )
    await settle()
    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '无签名/不安全'
    )
    expect(
      wrapper
        .findAll('.output-row__label')
        .at(-1)
        .text()
    ).toBe('Signature (Base64URL, 0 字节)')
    expect(findButton(wrapper, '验证签名').attributes('disabled')).toBe(
      ''
    )

    await token.setValue(
      createUnsignedToken({ alg: 'RS256', typ: 'JWT' }, {})
    )
    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '算法不支持'
    )
    expect(wrapper.get('[data-testid="jwt-unsupported-note"]').text()).toContain(
      '仅 HS256'
    )

    await token.setValue(
      createUnsignedToken({ alg: 'HS256', crit: [] }, {})
    )
    await settle()
    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '算法不支持'
    )
    expect(wrapper.get('[data-testid="jwt-unsupported-note"]').text()).toContain(
      'Header 包含 crit'
    )
    expect(findButton(wrapper, '验证签名').attributes('disabled')).toBe(
      ''
    )

    await token.setValue('a.b.c.d.e')
    expect(wrapper.get('[role="alert"]').text()).toContain(
      '不支持 JWE'
    )
    expect(wrapper.findAll('.output-row')).toHaveLength(0)

    await token.setValue('abc. def.ghi')
    expect(wrapper.get('[role="alert"]').text()).toContain(
      '内部不允许包含空白字符'
    )
  })

  it('warns about ignored header key material and still verifies with the secret', async () => {
    const signed = await createSignedToken({
      header: {
        alg: 'HS256',
        typ: 'JWT',
        jku: 'https://invalid.example/jwks',
        x5u: 'https://invalid.example/cert'
      }
    })
    const { wrapper } = mountTool()

    await wrapper.get('#jwt-token-input').setValue(signed.token)
    await wrapper.get('#jwt-verify-secret').setValue(SECRET)
    expect(
      wrapper.get('[data-testid="jwt-header-key-warning"]').text()
    ).toContain('这些字段已忽略')

    await findButton(wrapper, '验证签名').trigger('click')
    await waitForText(
      wrapper,
      '[data-testid="jwt-verify-status"]',
      '签名已验证'
    )
    expect(
      wrapper.get('[data-testid="jwt-header-key-warning"]').text()
    ).toContain('验证仅使用输入的密钥')
  })

  it('renders hostile and prototype-shaped claims as inert text', async () => {
    const payload = {
      iss: '<img src=x onerror="window.__jwtXss=1">',
      sub: '<script>window.__jwtXss=2</script>',
      aud: ['safe', 7],
      exp: NOW / 1000 - 1,
      constructor: 'literal'
    }
    Object.defineProperty(payload, '__proto__', {
      value: { polluted: true },
      enumerable: true,
      configurable: true,
      writable: true
    })
    const token = createUnsignedToken({ alg: 'HS256' }, payload)
    const { wrapper } = mountTool()

    await wrapper.get('#jwt-token-input').setValue(token)
    await settle()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain(
      '<img src=x onerror="window.__jwtXss=1">'
    )
    expect(wrapper.text()).toContain(
      '<script>window.__jwtXss=2</script>'
    )
    expect(window.__jwtXss).toBeUndefined()
    expect({}.polluted).toBeUndefined()
    expect(wrapper.get('[data-claim="iss"]').attributes('data-state')).toBe(
      'info'
    )
    expect(wrapper.get('[data-claim="aud"]').attributes('data-state')).toBe(
      'warning'
    )
    expect(wrapper.get('[data-claim="exp"]').text()).toContain('已过期')
    expect(wrapper.findAll('.output-row__value')[1].text()).toContain(
      '__proto__'
    )
  })

  it('never copies the secret through rows or shortcuts', async () => {
    const signed = await createSignedToken()
    const { wrapper, double } = mountTool()

    await wrapper.get('#jwt-token-input').setValue(signed.token)
    await wrapper.get('#jwt-verify-secret').setValue(SECRET)
    await findButton(wrapper, '验证签名').trigger('click')
    await waitForText(
      wrapper,
      '[data-testid="jwt-verify-status"]',
      '签名已验证'
    )

    for (const button of wrapper.findAll('.output-row__copy')) {
      await button.trigger('click')
    }

    expect(double.calls.copyText).toEqual([
      signed.headerText,
      signed.payloadText,
      signed.signature
    ])
    for (const value of double.calls.copyText) {
      expect(value).not.toContain(SECRET)
    }

    double.resetCalls()
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'Digit2',
        key: '2',
        altKey: true,
        bubbles: true
      })
    )
    expect(double.calls.copyText).toEqual([signed.payloadText])
  })

  it('shows truncation and copies the exact full payload', async () => {
    const payloadText = `{"x":"${'a'.repeat(11_000)}"}`
    const token = `${encodeUtf8Base64Url(
      '{"alg":"HS256"}'
    )}.${encodeUtf8Base64Url(payloadText)}.AA`
    const { wrapper, double } = mountTool()

    await wrapper.get('#jwt-token-input').setValue(token)
    await settle()

    expect(
      wrapper.get('[data-testid="jwt-truncation-note"]').text()
    ).toBe('显示已截断，复制仍为完整值')
    const shown = wrapper.findAll('.output-row__value')[1].text()
    expect(shown).toHaveLength(10_006)
    expect(shown.endsWith('......')).toBe(true)

    await wrapper.findAll('.output-row__copy')[1].trigger('click')
    expect(double.calls.copyText).toEqual([payloadText])
  })

  it('fails closed when Web Crypto is absent but keeps decoding available', async () => {
    const signed = await createSignedToken()
    const { wrapper } = mountTool({ cryptoProvider: {} })

    await wrapper.get('#jwt-token-input').setValue(signed.token)
    await settle()

    expect(wrapper.findAll('.output-row')).toHaveLength(3)
    expect(wrapper.get('.jwt-crypto-note').text()).toContain(
      '当前环境不支持 Web Crypto'
    )
    expect(findButton(wrapper, '验证签名').attributes('disabled')).toBe(
      ''
    )
  })

  it('warns about weak and overlong secrets without truncating', async () => {
    const signed = await createSignedToken()
    const { wrapper } = mountTool()

    await wrapper.get('#jwt-token-input').setValue(signed.token)
    const secret = wrapper.get('#jwt-verify-secret')
    await secret.setValue('short')
    expect(wrapper.get('[data-testid="jwt-verify-weak-key"]').text()).toContain(
      '弱密钥，仅适合调试'
    )
    expect(findButton(wrapper, '验证签名').attributes('disabled')).toBeUndefined()

    await secret.setValue('a'.repeat(4097))
    expect(wrapper.get('[role="alert"]').text()).toContain(
      '签名密钥超过 4 KiB 上限'
    )
    expect(findButton(wrapper, '验证签名').attributes('disabled')).toBe(
      ''
    )
  })
})

describe('JWT async safety', () => {
  it('ignores an old result after a token edit while pending', async () => {
    const signed = await createSignedToken()
    const { provider, verifyCalls } = createDeferredProvider()
    const { wrapper } = mountTool({ cryptoProvider: provider })

    await wrapper.get('#jwt-token-input').setValue(signed.token)
    await wrapper.get('#jwt-verify-secret').setValue(SECRET)
    await findButton(wrapper, '验证签名').trigger('click')
    await settle()

    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '验证中…'
    )
    expect(
      wrapper
        .get('[data-testid="jwt-verify-button"]')
        .attributes('disabled')
    ).toBeUndefined()
    expect(
      wrapper
        .get('[data-testid="jwt-verify-button"]')
        .attributes('aria-disabled')
    ).toBe('true')

    await wrapper.get('#jwt-token-input').setValue(`${signed.token}A`)
    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '未验证'
    )
    expect(findButton(wrapper, '验证签名').attributes('disabled')).toBeUndefined()

    verifyCalls[0].resolve(true)
    await settle()
    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '未验证'
    )
  })

  it('applies out-of-order results only to the latest operation', async () => {
    const signed = await createSignedToken()
    const { provider, verifyCalls } = createDeferredProvider()
    const { wrapper } = mountTool({ cryptoProvider: provider })

    await wrapper.get('#jwt-token-input').setValue(signed.token)
    await wrapper.get('#jwt-verify-secret').setValue('first-secret')
    await findButton(wrapper, '验证签名').trigger('click')
    await settle()

    await wrapper.get('#jwt-verify-secret').setValue('second-secret')
    await findButton(wrapper, '验证签名').trigger('click')
    await settle()
    expect(verifyCalls).toHaveLength(2)

    verifyCalls[1].resolve(true)
    await settle()
    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '签名已验证'
    )

    verifyCalls[0].resolve(false)
    await settle()
    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '签名已验证'
    )
  })

  it('times out verification, invalidates the generation and re-enables retry', async () => {
    vi.useFakeTimers()
    const signed = await createSignedToken()
    const { provider, verifyCalls } = createDeferredProvider()
    const { wrapper } = mountTool({ cryptoProvider: provider })

    await wrapper.get('#jwt-token-input').setValue(signed.token)
    await wrapper.get('#jwt-verify-secret').setValue(SECRET)
    await findButton(wrapper, '验证签名').trigger('click')

    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '验证中…'
    )
    await vi.advanceTimersByTimeAsync(10_000)
    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '验证超时'
    )
    expect(findButton(wrapper, '验证签名').attributes('disabled')).toBeUndefined()

    verifyCalls[0].resolve(true)
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()
    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '验证超时'
    )
  })

  it('does not steal focus when an async status arrives', async () => {
    const signed = await createSignedToken()
    const { provider, verifyCalls } = createDeferredProvider()
    const { wrapper } = mountTool({ cryptoProvider: provider })

    await wrapper.get('#jwt-token-input').setValue(signed.token)
    const secret = wrapper.get('#jwt-verify-secret')
    await secret.setValue(SECRET)
    await findButton(wrapper, '验证签名').trigger('click')
    secret.element.focus()
    await waitForCall(verifyCalls)
    verifyCalls[0].resolve(true)
    await settle()

    expect(document.activeElement).toBe(secret.element)
    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '签名已验证'
    )
  })

  it('keeps pending verify and sign actions focusable and guards repeats', async () => {
    const signed = await createSignedToken()
    const { provider, verifyCalls, signCalls } = createDeferredProvider()
    const { wrapper } = mountTool({ cryptoProvider: provider })

    await wrapper.get('#jwt-token-input').setValue(signed.token)
    await wrapper.get('#jwt-verify-secret').setValue(SECRET)
    const verify = wrapper.get('[data-testid="jwt-verify-button"]')
    verify.element.focus()
    await verify.trigger('click')
    await waitForCall(verifyCalls)

    expect(document.activeElement).toBe(verify.element)
    expect(verify.attributes('disabled')).toBeUndefined()
    expect(verify.attributes('aria-disabled')).toBe('true')
    expect(verify.attributes('aria-busy')).toBe('true')

    await verify.trigger('click')
    expect(verifyCalls).toHaveLength(1)

    verifyCalls[0].resolve(true)
    await waitForText(
      wrapper,
      '[data-testid="jwt-verify-status"]',
      '签名已验证'
    )
    expect(document.activeElement).toBe(verify.element)
    expect(verify.attributes('disabled')).toBeUndefined()
    expect(verify.attributes('aria-disabled')).toBeUndefined()
    expect(verify.attributes('aria-busy')).toBeUndefined()

    await wrapper.get('[role="tab"][data-mode-id="encode"]').trigger('click')
    await settle()
    await wrapper.get('#jwt-sign-secret').setValue(SECRET)
    const sign = wrapper.get('[data-testid="jwt-sign-button"]')
    sign.element.focus()
    await sign.trigger('click')
    await waitForCall(signCalls)

    expect(document.activeElement).toBe(sign.element)
    expect(sign.attributes('disabled')).toBeUndefined()
    expect(sign.attributes('aria-disabled')).toBe('true')
    expect(sign.attributes('aria-busy')).toBe('true')

    await sign.trigger('click')
    expect(signCalls).toHaveLength(1)

    signCalls[0].resolve(new Uint8Array(32))
    await waitForText(
      wrapper,
      '[data-testid="jwt-sign-status"]',
      '状态：签名完成'
    )
    expect(document.activeElement).toBe(sign.element)
    expect(sign.attributes('disabled')).toBeUndefined()
    expect(sign.attributes('aria-disabled')).toBeUndefined()
    expect(sign.attributes('aria-busy')).toBeUndefined()
  })

  it('sanitises provider failures and keeps retry available', async () => {
    const signed = await createSignedToken()
    const canary = `${SECRET}-CANARY-${signed.token}`
    const provider = {
      subtle: {
        async importKey() {
          return {}
        },
        async sign() {
          throw new Error(canary)
        },
        async verify() {
          throw new Error(canary)
        }
      }
    }
    const consoleSpies = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'debug')
    ]
    const { wrapper } = mountTool({ cryptoProvider: provider })

    await wrapper.get('#jwt-token-input').setValue(signed.token)
    await wrapper.get('#jwt-verify-secret').setValue(SECRET)
    await findButton(wrapper, '验证签名').trigger('click')
    await settle()

    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '未验证'
    )
    expect(wrapper.get('[role="alert"]').text()).toContain(
      '签名验证失败，请重试'
    )
    expect(wrapper.text()).not.toContain(canary)
    expect(wrapper.text()).not.toContain('CANARY')
    expect(findButton(wrapper, '验证签名').attributes('disabled')).toBeUndefined()
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('clears pending work on unmount and ignores a late result', async () => {
    const signed = await createSignedToken()
    const { provider, verifyCalls } = createDeferredProvider()
    const { wrapper } = mountTool({ cryptoProvider: provider })

    await wrapper.get('#jwt-token-input').setValue(signed.token)
    await wrapper.get('#jwt-verify-secret').setValue(SECRET)
    await findButton(wrapper, '验证签名').trigger('click')
    await settle()

    wrapper.unmount()
    expect(document.body.textContent).not.toContain(SECRET)
    verifyCalls[0].resolve(true)
    await settle()
    expect(document.body.textContent).not.toContain(SECRET)
  })

  it('clears operation timers on a mode switch', async () => {
    vi.useFakeTimers()
    const signed = await createSignedToken()
    const { provider } = createDeferredProvider()
    const { wrapper } = mountTool({ cryptoProvider: provider })

    await wrapper.get('#jwt-token-input').setValue(signed.token)
    await wrapper.get('#jwt-verify-secret').setValue(SECRET)
    await findButton(wrapper, '验证签名').trigger('click')
    expect(wrapper.get('[data-testid="jwt-verify-status"]').text()).toBe(
      '验证中…'
    )
    const timersBeforeSwitch = vi.getTimerCount()
    expect(timersBeforeSwitch).toBeGreaterThan(0)

    await wrapper.get('[role="tab"][data-mode-id="encode"]').trigger('click')
    expect(vi.getTimerCount()).toBeLessThan(timersBeforeSwitch)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(wrapper.get('[data-testid="jwt-sign-status"]').text()).toBe(
      '状态：未生成'
    )
  })

  it('sanitises signing provider failures', async () => {
    const signed = await createSignedToken()
    const canary = `${SECRET}-SIGN-CANARY-${signed.token}`
    const provider = {
      subtle: {
        async importKey() {
          return {}
        },
        async sign() {
          throw new Error(canary)
        },
        async verify() {
          throw new Error(canary)
        }
      }
    }
    const { wrapper } = mountTool({ cryptoProvider: provider })

    await wrapper.get('[role="tab"][data-mode-id="encode"]').trigger('click')
    await wrapper.get('#jwt-sign-secret').setValue(SECRET)
    await findButton(wrapper, '签名并生成').trigger('click')
    await settle()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      '签名生成失败，请重试'
    )
    expect(wrapper.text()).not.toContain('SIGN-CANARY')
    expect(findButton(wrapper, '签名并生成').attributes('disabled')).toBeUndefined()
  })
})

describe('JWT encoder UI', () => {
  it('provides encoder defaults, algorithm choices and explicit signing', async () => {
    const { wrapper } = mountTool()

    await wrapper.get('[role="tab"][data-mode-id="encode"]').trigger('click')
    await settle()

    expect(wrapper.get('#jwt-header-input').element.value).toBe(
      '{"alg":"HS256","typ":"JWT"}'
    )
    expect(wrapper.get('#jwt-payload-input').element.value).toBe('{}')
    expect(
      wrapper
        .get('#jwt-sign-algorithm')
        .findAll('option')
        .map((option) => option.text())
    ).toEqual(['HS256', 'HS384', 'HS512'])
    expect(wrapper.get('[data-testid="jwt-sign-status"]').text()).toBe(
      '状态：未生成'
    )
    expect(wrapper.find('[data-testid="jwt-generated-output"]').exists()).toBe(
      false
    )
    expect(findButton(wrapper, '签名并生成').attributes('disabled')).toBe(
      ''
    )

    await wrapper.get('#jwt-payload-input').setValue(
      '{"sub":"signed-component"}'
    )
    await wrapper.get('#jwt-sign-secret').setValue(SECRET)
    expect(findButton(wrapper, '签名并生成').attributes('disabled')).toBeUndefined()

    await findButton(wrapper, '签名并生成').trigger('click')
    await waitForText(
      wrapper,
      '[data-testid="jwt-sign-status"]',
      '状态：签名完成'
    )
    const rows = wrapper.findAll('[data-testid="jwt-generated-output"] .output-row')
    expect(rows).toHaveLength(2)
    const token = rows[0].get('.output-row__value').text()
    const signature = rows[1].get('.output-row__value').text()
    const [headerSegment, payloadSegment, signatureSegment] =
      token.split('.')

    expect(headerSegment).toBe(
      encodeUtf8Base64Url('{"alg":"HS256","typ":"JWT"}')
    )
    expect(payloadSegment).toBe(
      encodeUtf8Base64Url('{"sub":"signed-component"}')
    )
    expect(signature).toBe(signatureSegment)
    expect(
      await verifyHmac(
        webcrypto,
        'HS256',
        SECRET,
        `${headerSegment}.${payloadSegment}`,
        signature
      )
    ).toBe(true)

    await wrapper.get('#jwt-payload-input').setValue('{"sub":"edited"}')
    expect(wrapper.get('[data-testid="jwt-sign-status"]').text()).toBe(
      '状态：未生成'
    )
    expect(wrapper.find('[data-testid="jwt-generated-output"]').exists()).toBe(
      false
    )
  })

  it('generates the JWS from exact minified editor bytes', async () => {
    const { wrapper } = mountTool()
    await wrapper.get('[role="tab"][data-mode-id="encode"]').trigger('click')
    await settle()
    await wrapper.get('#jwt-header-input').setValue(
      '{ "typ" : "JWT", "alg" : "HS256" }'
    )
    const payloadText = String.raw`{ "big": 9007199254740993, "neg": -0, "escaped": "\u4e2d", "space": "a  b" }`
    await wrapper.get('#jwt-payload-input').setValue(payloadText)
    await wrapper.get('#jwt-sign-secret').setValue(SECRET)
    await findButton(wrapper, '签名并生成').trigger('click')
    await waitForText(
      wrapper,
      '[data-testid="jwt-sign-status"]',
      '状态：签名完成'
    )

    const token = wrapper
      .get('[data-testid="jwt-generated-output"] .output-row__value')
      .text()
    const [headerSegment, payloadSegment] = token.split('.')
    expect(decodeUtf8Base64Url(headerSegment)).toBe(
      '{"typ":"JWT","alg":"HS256"}'
    )
    expect(decodeUtf8Base64Url(payloadSegment)).toBe(
      String.raw`{"big":9007199254740993,"neg":-0,"escaped":"\u4e2d","space":"a  b"}`
    )
  })

  it('blocks algorithm mismatch, crit, invalid objects and overlong secrets', async () => {
    const { wrapper } = mountTool()
    await wrapper.get('[role="tab"][data-mode-id="encode"]').trigger('click')
    await settle()

    await wrapper.get('#jwt-sign-algorithm').setValue('HS384')
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Header alg 必须与所选签名算法一致'
    )
    expect(findButton(wrapper, '签名并生成').attributes('disabled')).toBe('')

    await wrapper.get('#jwt-sign-algorithm').setValue('HS256')
    await wrapper.get('#jwt-header-input').setValue(
      '{"alg":"HS256","crit":["exp"]}'
    )
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Header crit 字段不受支持'
    )

    await wrapper.get('#jwt-header-input').setValue(
      '{"alg":"HS256","crit":[]}'
    )
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Header crit 字段不受支持'
    )

    await wrapper.get('#jwt-header-input').setValue('[]')
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Header 顶层必须是 JSON 对象'
    )

    await wrapper.get('#jwt-header-input').setValue(
      '{"alg":"HS256","typ":"JWT"}'
    )
    await wrapper.get('#jwt-sign-secret').setValue('a'.repeat(4097))
    expect(wrapper.get('[role="alert"]').text()).toContain(
      '签名密钥超过 4 KiB 上限'
    )
    expect(findButton(wrapper, '签名并生成').attributes('disabled')).toBe('')
  })

  it('discloses generated-token truncation while copying the full JWS', async () => {
    const { wrapper, double } = mountTool()
    await wrapper.get('[role="tab"][data-mode-id="encode"]').trigger('click')
    await wrapper.get('#jwt-payload-input').setValue(
      `{"x":"${'a'.repeat(8000)}"}`
    )
    await wrapper.get('#jwt-sign-secret').setValue(SECRET)
    await findButton(wrapper, '签名并生成').trigger('click')
    await waitForText(
      wrapper,
      '[data-testid="jwt-sign-status"]',
      '状态：签名完成'
    )

    expect(
      wrapper.get('[data-testid="jwt-truncation-note"]').text()
    ).toBe('显示已截断，复制仍为完整值')
    const shown = wrapper
      .get('[data-testid="jwt-generated-output"] .output-row__value')
      .text()
    expect(shown).toHaveLength(10_006)
    expect(shown.endsWith('......')).toBe(true)

    await wrapper
      .get('[data-testid="jwt-generated-output"] .output-row__copy')
      .trigger('click')
    const copied = double.calls.copyText[0]
    expect(copied.length).toBeGreaterThan(10_000)
    expect(copied.startsWith(shown.slice(0, 10_000))).toBe(true)
    expect(copied).not.toBe(shown)
    expect(copied.split('.')).toHaveLength(3)
  })

  it('times out signing, invalidates late completion and re-enables the action', async () => {
    vi.useFakeTimers()
    const { provider, signCalls } = createDeferredProvider()
    const { wrapper } = mountTool({ cryptoProvider: provider })

    await wrapper.get('[role="tab"][data-mode-id="encode"]').trigger('click')
    await settle()
    await wrapper.get('#jwt-sign-secret').setValue(SECRET)
    await findButton(wrapper, '签名并生成').trigger('click')

    expect(wrapper.get('[data-testid="jwt-sign-status"]').text()).toBe(
      '状态：签名中…'
    )
    expect(
      wrapper
        .get('[data-testid="jwt-sign-button"]')
        .attributes('disabled')
    ).toBeUndefined()
    expect(
      wrapper
        .get('[data-testid="jwt-sign-button"]')
        .attributes('aria-disabled')
    ).toBe('true')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(wrapper.get('[data-testid="jwt-sign-status"]').text()).toBe(
      '状态：签名超时'
    )
    expect(findButton(wrapper, '签名并生成').attributes('disabled')).toBeUndefined()

    signCalls[0].resolve(new Uint8Array(32))
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()
    expect(wrapper.get('[data-testid="jwt-sign-status"]').text()).toBe(
      '状态：签名超时'
    )
    expect(wrapper.find('[data-testid="jwt-generated-output"]').exists()).toBe(
      false
    )
  })

  it('clears mode state, secrets, outputs and statuses on mode switches', async () => {
    const signed = await createSignedToken()
    const { wrapper } = mountTool()

    await wrapper.get('#jwt-token-input').setValue(signed.token)
    await wrapper.get('#jwt-verify-secret').setValue(SECRET)
    await findButton(wrapper, '验证签名').trigger('click')
    await waitForText(
      wrapper,
      '[data-testid="jwt-verify-status"]',
      '签名已验证'
    )

    await wrapper.get('[role="tab"][data-mode-id="encode"]').trigger('click')
    await settle()
    expect(wrapper.get('#jwt-header-input').element.value).toBe(
      '{"alg":"HS256","typ":"JWT"}'
    )
    expect(wrapper.get('#jwt-payload-input').element.value).toBe('{}')
    expect(wrapper.get('#jwt-sign-secret').element.value).toBe('')
    expect(wrapper.get('#jwt-sign-secret').attributes('type')).toBe(
      'password'
    )
    expect(wrapper.get('[data-testid="jwt-sign-status"]').text()).toBe(
      '状态：未生成'
    )

    await wrapper.get('[role="tab"][data-mode-id="decode"]').trigger('click')
    await settle()
    expect(wrapper.get('#jwt-token-input').element.value).toBe('')
    expect(wrapper.find('#jwt-verify-secret').exists()).toBe(false)
    expect(wrapper.find('[data-testid="jwt-verify-status"]').exists()).toBe(
      false
    )
    expect(wrapper.findAll('.output-row')).toHaveLength(0)
    expect(wrapper.find('.claims').exists()).toBe(false)
  })

  it('supports keyboard tab switching and keeps documented ARIA semantics', async () => {
    const { wrapper } = mountTool()
    const tabs = wrapper.findAll('[role="tab"]')
    tabs[0].element.focus()

    await tabs[0].trigger('keydown', { key: 'ArrowRight' })
    await settle()
    expect(wrapper.get('[data-tool="jwt"]').attributes('data-mode')).toBe(
      'encode'
    )
    expect(tabs[1].attributes('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(
      wrapper.findAll('[role="tab"]')[1].element
    )

    await wrapper.get('[role="tab"][data-mode-id="decode"]').trigger('click')
    await settle()
    await wrapper
      .get('#jwt-token-input')
      .setValue(createUnsignedToken({ alg: 'HS256' }, {}))
    await settle()
    const status = wrapper.get('[data-testid="jwt-verify-status"]')
    const secret = wrapper.get('#jwt-verify-secret')
    expect(status.attributes('role')).toBe('status')
    expect(status.attributes('aria-live')).toBe('polite')
    expect(status.attributes('aria-atomic')).toBe('true')
    expect(secret.attributes('type')).toBe('password')
  })

  it('keeps required controls available at 320, 375 and 1200 widths', async () => {
    const signed = await createSignedToken()

    for (const width of [320, 375, 1200]) {
      window.innerWidth = width
      const { wrapper } = mountTool()
      await wrapper.get('#jwt-token-input').setValue(signed.token)
      await settle()

      expect(wrapper.get('[data-tool="jwt"]')).toBeTruthy()
      expect(wrapper.get('#jwt-token-input')).toBeTruthy()
      expect(wrapper.get('#jwt-verify-secret')).toBeTruthy()
      expect(findButton(wrapper, '验证签名')).toBeTruthy()
      expect(wrapper.findAll('[role="tab"]')).toHaveLength(2)
      expect(wrapper.findAll('.output-row__copy')).toHaveLength(3)
      wrapper.unmount()
    }
  })
})
