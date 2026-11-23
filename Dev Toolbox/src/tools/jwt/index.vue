<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'
import ClaimsTable from './ClaimsTable.vue'
import EmptyState from '../../components/EmptyState.vue'
import ErrorNotice from '../../components/ErrorNotice.vue'
import ModeTabs from '../../components/ModeTabs.vue'
import OutputList from '../../components/OutputList.vue'
import ToolFrame from '../../components/ToolFrame.vue'
import { inspectClaims } from './claims.js'
import { createJwtCrypto } from './crypto.js'
import {
  DEFAULT_HEADER,
  DEFAULT_PAYLOAD,
  JWT_HMAC_ALGORITHM_OPTIONS,
  finalizeGeneratedJws,
  isHmacAlgorithm,
  parseCompactJws,
  prepareSigningInput,
  validateSecret
} from './logic.js'

const props = defineProps({
  action: {
    type: Object,
    required: true
  },
  enterAction: {
    type: Object,
    default: null
  },
  cryptoProvider: {
    type: Object,
    default: undefined
  },
  now: {
    type: Function,
    default: undefined
  }
})

const MODES = Object.freeze([
  Object.freeze({ id: 'decode', label: '解析 / 验证' }),
  Object.freeze({ id: 'encode', label: '生成 / 签名' })
])

const OPERATION_TIMEOUT_MS = 10_000
const DISPLAY_LIMIT = 10_000
const TRUNCATION_NOTE = '显示已截断，复制仍为完整值'

const cryptoClient = createJwtCrypto(
  () => props.cryptoProvider || globalThis.crypto
)

const mode = ref('decode')
const tokenInput = ref('')
const verifySecret = ref('')
const showVerifySecret = ref(false)
const verificationStatus = ref('未验证')
const verificationError = ref('')
const verificationPending = ref(false)

const headerText = ref(DEFAULT_HEADER)
const payloadText = ref(DEFAULT_PAYLOAD)
const signingAlgorithm = ref('HS256')
const signingSecret = ref('')
const showSigningSecret = ref(false)
const signingStatus = ref('未生成')
const signingError = ref('')
const signingPending = ref(false)
const generatedToken = ref('')
const generatedSignature = ref('')

const tokenInputElement = ref(null)
const cryptoAvailable = ref(cryptoClient.isAvailable())
let generation = 0
let operationTimer = null

const actionCode = computed(() =>
  typeof props.action?.code === 'string' ? props.action.code : ''
)

function currentTime() {
  try {
    if (typeof props.now === 'function') {
      const value = Number(props.now())
      if (Number.isFinite(value)) return value
    }
  } catch {
    // Fall through to the local clock.
  }
  return Date.now()
}

function clearOperationTimer() {
  if (operationTimer !== null) {
    clearTimeout(operationTimer)
    operationTimer = null
  }
}

function beginGeneration() {
  generation += 1
  clearOperationTimer()
  return generation
}

function resetVerification() {
  beginGeneration()
  verificationPending.value = false
  verificationStatus.value = '未验证'
  verificationError.value = ''
}

function resetSigning() {
  beginGeneration()
  signingPending.value = false
  signingStatus.value = '未生成'
  signingError.value = ''
  generatedToken.value = ''
  generatedSignature.value = ''
}

function resetForModeSwitch() {
  beginGeneration()
  cryptoAvailable.value = cryptoClient.isAvailable()

  tokenInput.value = ''
  verifySecret.value = ''
  showVerifySecret.value = false
  verificationPending.value = false
  verificationStatus.value = '未验证'
  verificationError.value = ''

  headerText.value = DEFAULT_HEADER
  payloadText.value = DEFAULT_PAYLOAD
  signingAlgorithm.value = 'HS256'
  signingSecret.value = ''
  showSigningSecret.value = false
  signingPending.value = false
  signingStatus.value = '未生成'
  signingError.value = ''
  generatedToken.value = ''
  generatedSignature.value = ''
}

const decodeState = computed(() => {
  if (!tokenInput.value.trim()) return { state: 'empty' }
  const parsed = parseCompactJws(tokenInput.value)
  if (!parsed.ok) {
    return { state: 'error', error: parsed.error }
  }
  return { state: 'ready', token: parsed.value }
})

const decodedToken = computed(() =>
  decodeState.value.state === 'ready' ? decodeState.value.token : null
)

const decodedRows = computed(() => {
  const token = decodedToken.value
  if (!token) return []
  return [
    { label: 'Header JSON', value: token.headerText },
    { label: 'Payload JSON', value: token.payloadText },
    {
      label: `Signature (Base64URL, ${token.signatureByteLength} 字节)`,
      value: token.signatureSegment
    }
  ]
})

const claims = computed(() => {
  const token = decodedToken.value
  if (!token) return { entries: [], hasWarnings: false }
  return inspectClaims(token.payload, currentTime())
})

const headerKeyWarning = computed(() => {
  const token = decodedToken.value
  if (!token || !token.headerKeys.length) return ''
  return `Header 包含 ${token.headerKeys
    .join('/')
    .toUpperCase()} 密钥字段；这些字段已忽略，验证仅使用输入的密钥。`
})

const unsupportedExplanation = computed(() => {
  const token = decodedToken.value
  if (!token) return ''
  if (token.unsecured) {
    return '无签名或 alg:none 的 JWS 不能执行签名验证。'
  }
  if (token.unsupportedReason === 'header_crit') {
    return 'Header crit 非空，签名验证已停用。'
  }
  if (token.unsupportedReason === 'header_b64') {
    return 'Header b64:false 不受支持，签名验证已停用。'
  }
  if (!isHmacAlgorithm(token.algorithm)) {
    return '仅 HS256、HS384 和 HS512 可验证；当前算法仅解析。'
  }
  return ''
})

const effectiveVerificationStatus = computed(() => {
  if (verificationStatus.value !== '未验证') {
    return verificationStatus.value
  }
  const token = decodedToken.value
  return token ? token.status : '未验证'
})

function secretState(secret, algorithm) {
  if (!secret) {
    return {
      status: 'empty',
      byteLength: 0,
      weak: false,
      error: null
    }
  }

  const result = validateSecret(secret, algorithm)
  if (!result.ok) {
    return {
      status: 'error',
      byteLength: 0,
      weak: false,
      error: result.error
    }
  }

  return {
    status: 'ok',
    byteLength: result.value.byteLength,
    minimumBytes: result.value.minimumBytes,
    weak: result.value.weak,
    error: null
  }
}

const verifySecretState = computed(() =>
  secretState(verifySecret.value, decodedToken.value?.algorithm)
)

const verifyWeakNotice = computed(() => {
  const state = verifySecretState.value
  if (state.status !== 'ok' || !state.weak) return ''
  return `弱密钥，仅适合调试：${decodedToken.value.algorithm} 建议至少 ${state.minimumBytes} 字节（当前 ${state.byteLength} 字节）。`
})

const canVerify = computed(
  () =>
    decodeState.value.state === 'ready' &&
    decodedToken.value.canVerify &&
    cryptoAvailable.value &&
    verifySecretState.value.status === 'ok' &&
    !verificationPending.value
)

const signingDraft = computed(() =>
  prepareSigningInput({
    headerText: headerText.value,
    payloadText: payloadText.value,
    algorithm: signingAlgorithm.value
  })
)

const signingSecretState = computed(() =>
  secretState(signingSecret.value, signingAlgorithm.value)
)

const signingWeakNotice = computed(() => {
  const state = signingSecretState.value
  if (state.status !== 'ok' || !state.weak) return ''
  return `弱密钥，仅适合调试：${signingAlgorithm.value} 建议至少 ${state.minimumBytes} 字节（当前 ${state.byteLength} 字节）。`
})

const signingHeaderKeyWarning = computed(() => {
  if (!signingDraft.value.ok || !signingDraft.value.value.headerKeys.length) {
    return ''
  }
  return `Header 包含 ${signingDraft.value.value.headerKeys
    .join('/')
    .toUpperCase()} 密钥字段；这些字段不会作为签名密钥。`
})

const signingBlockingError = computed(() => {
  if (!signingDraft.value.ok) {
    return signingDraft.value.error.message
  }
  if (signingSecretState.value.status === 'error') {
    return signingSecretState.value.error.message
  }
  return ''
})

const canSign = computed(
  () =>
    signingDraft.value.ok &&
    cryptoAvailable.value &&
    signingSecretState.value.status === 'ok' &&
    !signingPending.value
)

const generatedRows = computed(() => {
  if (!generatedToken.value) return []
  return [
    { label: '生成的 JWS', value: generatedToken.value },
    { label: 'Signature (Base64URL)', value: generatedSignature.value }
  ]
})

function hasTruncatedRow(rows) {
  return rows.some(
    (row) => String(row.value ?? '').length > DISPLAY_LIMIT
  )
}

const hasDecodedTruncation = computed(() =>
  hasTruncatedRow(decodedRows.value)
)
const hasGeneratedTruncation = computed(() =>
  hasTruncatedRow(generatedRows.value)
)

function isCurrentVerification(operationGeneration, snapshot) {
  const token = decodedToken.value
  return (
    operationGeneration === generation &&
    mode.value === 'decode' &&
    verifySecret.value === snapshot.secret &&
    token !== null &&
    token.token === snapshot.token &&
    token.algorithm === snapshot.algorithm
  )
}

function isCurrentSigning(operationGeneration, snapshot) {
  return (
    operationGeneration === generation &&
    mode.value === 'encode' &&
    signingSecret.value === snapshot.secret &&
    signingDraft.value.ok &&
    signingDraft.value.value.signingInput === snapshot.signingInput
  )
}

async function verifyToken() {
  if (verificationPending.value || !canVerify.value) return

  const token = decodedToken.value
  const snapshot = {
    token: token.token,
    secret: verifySecret.value,
    algorithm: token.algorithm
  }
  const operationGeneration = beginGeneration()

  cryptoAvailable.value = cryptoClient.isAvailable()
  if (!cryptoAvailable.value) {
    verificationError.value =
      '当前环境不支持 Web Crypto，签名验证不可用'
    return
  }

  verificationPending.value = true
  verificationError.value = ''
  verificationStatus.value = '验证中…'

  operationTimer = setTimeout(() => {
    if (operationGeneration !== generation) return
    generation += 1
    operationTimer = null
    verificationPending.value = false
    verificationStatus.value = '验证超时'
  }, OPERATION_TIMEOUT_MS)

  try {
    const verified = await cryptoClient.verify(
      snapshot.algorithm,
      snapshot.secret,
      token.signingInput,
      token.signatureBytes
    )
    if (!isCurrentVerification(operationGeneration, snapshot)) return
    clearOperationTimer()
    verificationPending.value = false
    verificationStatus.value = verified ? '签名已验证' : '签名无效'
  } catch {
    if (!isCurrentVerification(operationGeneration, snapshot)) return
    clearOperationTimer()
    verificationPending.value = false
    verificationStatus.value = '未验证'
    verificationError.value = '签名验证失败，请重试'
  }
}

async function signAndGenerate() {
  if (signingPending.value || !canSign.value) return

  const draft = signingDraft.value.value
  const snapshot = {
    secret: signingSecret.value,
    algorithm: draft.algorithm,
    signingInput: draft.signingInput
  }
  const operationGeneration = beginGeneration()

  cryptoAvailable.value = cryptoClient.isAvailable()
  if (!cryptoAvailable.value) {
    signingError.value =
      '当前环境不支持 Web Crypto，签名生成不可用'
    return
  }

  signingPending.value = true
  signingError.value = ''
  signingStatus.value = '签名中…'
  generatedToken.value = ''
  generatedSignature.value = ''

  operationTimer = setTimeout(() => {
    if (operationGeneration !== generation) return
    generation += 1
    operationTimer = null
    signingPending.value = false
    signingStatus.value = '签名超时'
  }, OPERATION_TIMEOUT_MS)

  try {
    const signatureBytes = await cryptoClient.sign(
      snapshot.algorithm,
      snapshot.secret,
      snapshot.signingInput
    )
    if (!isCurrentSigning(operationGeneration, snapshot)) return

    const signatureSegment =
      cryptoClient.encodeSignature(signatureBytes)
    const finalized = finalizeGeneratedJws(
      draft.headerSegment,
      draft.payloadSegment,
      signatureSegment
    )
    if (!finalized.ok) {
      clearOperationTimer()
      signingPending.value = false
      signingStatus.value = '未生成'
      signingError.value = finalized.error.message
      return
    }

    clearOperationTimer()
    signingPending.value = false
    signingStatus.value = '签名完成'
    generatedToken.value = finalized.value.token
    generatedSignature.value = finalized.value.signatureSegment
  } catch {
    if (!isCurrentSigning(operationGeneration, snapshot)) return
    clearOperationTimer()
    signingPending.value = false
    signingStatus.value = '未生成'
    signingError.value = '签名生成失败，请重试'
  }
}

watch([tokenInput, verifySecret], resetVerification)
watch(
  [headerText, payloadText, signingAlgorithm, signingSecret],
  resetSigning
)
watch(mode, resetForModeSwitch)

onMounted(() => {
  cryptoAvailable.value = cryptoClient.isAvailable()
  tokenInputElement.value?.focus()
})

onBeforeUnmount(() => {
  beginGeneration()
  tokenInput.value = ''
  verifySecret.value = ''
  signingSecret.value = ''
  showVerifySecret.value = false
  showSigningSecret.value = false
  verificationPending.value = false
  signingPending.value = false
  verificationStatus.value = '未验证'
  signingStatus.value = '未生成'
  verificationError.value = ''
  signingError.value = ''
  generatedToken.value = ''
  generatedSignature.value = ''
  headerText.value = DEFAULT_HEADER
  payloadText.value = DEFAULT_PAYLOAD
})
</script>

<template>
  <ToolFrame
    title="JWT 工具"
    description="本地解析、验证与生成 JWS；签名不提供机密性"
  >
    <div
      class="jwt-tool"
      data-tool="jwt"
      :data-action-code="actionCode"
      :data-mode="mode"
    >
      <ModeTabs v-model="mode" :modes="MODES" />

      <p
        v-if="!cryptoAvailable"
        class="jwt-crypto-note"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        当前环境不支持 Web Crypto，解析仍可用，验证与签名已停用。
      </p>

      <section
        v-if="mode === 'decode'"
        class="jwt-panel"
        aria-labelledby="jwt-decoder-title"
      >
        <h2 id="jwt-decoder-title" class="jwt-panel__title">
          解析 / 验证
        </h2>

        <label class="jwt-field" for="jwt-token-input">
          <span class="jwt-field__label">JWT 输入</span>
          <textarea
            id="jwt-token-input"
            ref="tokenInputElement"
            v-model="tokenInput"
            class="jwt-field__input jwt-field__input--token"
            rows="5"
            spellcheck="false"
            autocomplete="off"
            wrap="soft"
            placeholder="粘贴 compact JWS，例如 header.payload.signature"
            :aria-describedby="
              decodeState.state === 'ready'
                ? 'jwt-verify-status'
                : undefined
            "
            :aria-invalid="decodeState.state === 'error' ? 'true' : undefined"
          />
        </label>

        <EmptyState
          v-if="decodeState.state === 'empty'"
          message="请输入 compact JWS 以开始解析"
        />

        <ErrorNotice
          v-else-if="decodeState.state === 'error'"
          :message="decodeState.error.message"
        />

        <template v-else>
          <div class="jwt-meta">
            <span>
              算法：<code class="jwt-code">{{ decodedToken.algorithm }}</code>
            </span>
          </div>

          <p
            v-if="headerKeyWarning"
            class="jwt-warning"
            data-testid="jwt-header-key-warning"
          >
            {{ headerKeyWarning }}
          </p>

          <p
            v-if="unsupportedExplanation"
            class="jwt-warning"
            data-testid="jwt-unsupported-note"
          >
            {{ unsupportedExplanation }}
          </p>

          <div class="jwt-verify">
            <label class="jwt-field jwt-verify__secret" for="jwt-verify-secret">
              <span class="jwt-field__label">验证密钥</span>
              <input
                id="jwt-verify-secret"
                v-model="verifySecret"
                :type="showVerifySecret ? 'text' : 'password'"
                class="jwt-field__input"
                autocomplete="new-password"
                autocapitalize="off"
                spellcheck="false"
                aria-describedby="jwt-verify-status jwt-verify-secret-help"
              />
            </label>
            <button
              type="button"
              class="jwt-button jwt-button--secondary"
              :aria-pressed="showVerifySecret ? 'true' : 'false'"
              :aria-label="
                showVerifySecret ? '隐藏验证密钥' : '显示验证密钥'
              "
              @click="showVerifySecret = !showVerifySecret"
            >
              {{ showVerifySecret ? '隐藏密钥' : '显示密钥' }}
            </button>
            <button
              type="button"
              class="jwt-button"
              data-testid="jwt-verify-button"
              :disabled="!canVerify && !verificationPending"
              :aria-disabled="
                verificationPending || !canVerify ? 'true' : undefined
              "
              :aria-busy="verificationPending ? 'true' : undefined"
              @click="verifyToken"
            >
              {{ verificationPending ? '验证中…' : '验证签名' }}
            </button>
          </div>

          <p class="jwt-status-line">
            <span>状态：</span>
            <strong
              id="jwt-verify-status"
              class="jwt-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              tabindex="0"
              data-testid="jwt-verify-status"
            >
              {{ effectiveVerificationStatus }}
            </strong>
          </p>

          <p id="jwt-verify-secret-help" class="jwt-help">
            密钥只保存在当前内存，不会复制、记录或发送。
          </p>

          <p
            v-if="verifyWeakNotice"
            class="jwt-warning"
            data-testid="jwt-verify-weak-key"
          >
            {{ verifyWeakNotice }}
          </p>

          <ErrorNotice
            v-if="verifySecretState.status === 'error'"
            :message="verifySecretState.error.message"
          />

          <ErrorNotice
            v-if="verificationError"
            :message="verificationError"
          />

          <OutputList :rows="decodedRows" data-testid="jwt-decoded-output" />

          <p
            v-if="hasDecodedTruncation"
            class="jwt-truncation"
            data-testid="jwt-truncation-note"
          >
            {{ TRUNCATION_NOTE }}
          </p>

          <ClaimsTable :entries="claims.entries" />
        </template>
      </section>

      <section
        v-else
        class="jwt-panel"
        aria-labelledby="jwt-encoder-title"
      >
        <h2 id="jwt-encoder-title" class="jwt-panel__title">
          生成 / 签名
        </h2>

        <label class="jwt-field" for="jwt-header-input">
          <span class="jwt-field__label">Header JSON</span>
          <textarea
            id="jwt-header-input"
            v-model="headerText"
            class="jwt-field__input"
            rows="5"
            spellcheck="false"
            autocapitalize="off"
            placeholder='{"alg":"HS256","typ":"JWT"}'
          />
        </label>

        <label class="jwt-field" for="jwt-payload-input">
          <span class="jwt-field__label">Payload JSON</span>
          <textarea
            id="jwt-payload-input"
            v-model="payloadText"
            class="jwt-field__input"
            rows="7"
            spellcheck="false"
            autocapitalize="off"
            placeholder="{}"
          />
        </label>

        <label class="jwt-field" for="jwt-sign-algorithm">
          <span class="jwt-field__label">签名算法</span>
          <select
            id="jwt-sign-algorithm"
            v-model="signingAlgorithm"
            class="jwt-field__input jwt-field__select"
          >
            <option
              v-for="option in JWT_HMAC_ALGORITHM_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <div class="jwt-signing-controls">
          <label class="jwt-field jwt-signing-controls__secret" for="jwt-sign-secret">
            <span class="jwt-field__label">签名密钥</span>
            <input
              id="jwt-sign-secret"
              v-model="signingSecret"
              :type="showSigningSecret ? 'text' : 'password'"
              class="jwt-field__input"
              autocomplete="new-password"
              autocapitalize="off"
              spellcheck="false"
              aria-describedby="jwt-sign-status jwt-sign-secret-help"
            />
          </label>
          <button
            type="button"
            class="jwt-button jwt-button--secondary"
            :aria-pressed="showSigningSecret ? 'true' : 'false'"
            :aria-label="
              showSigningSecret ? '隐藏签名密钥' : '显示签名密钥'
            "
            @click="showSigningSecret = !showSigningSecret"
          >
            {{ showSigningSecret ? '隐藏密钥' : '显示密钥' }}
          </button>
          <button
            type="button"
            class="jwt-button"
            data-testid="jwt-sign-button"
            :disabled="!canSign && !signingPending"
            :aria-disabled="signingPending || !canSign ? 'true' : undefined"
            :aria-busy="signingPending ? 'true' : undefined"
            @click="signAndGenerate"
          >
            {{ signingPending ? '签名中…' : '签名并生成' }}
          </button>
        </div>

        <p
          id="jwt-sign-status"
          class="jwt-meta__status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          tabindex="0"
          data-testid="jwt-sign-status"
        >
          状态：<strong class="jwt-status">{{ signingStatus }}</strong>
        </p>

        <p id="jwt-sign-secret-help" class="jwt-help">
          密钥只保存在当前内存，不会复制、记录或发送。
        </p>

        <p
          v-if="signingHeaderKeyWarning"
          class="jwt-warning"
          data-testid="jwt-sign-header-key-warning"
        >
          {{ signingHeaderKeyWarning }}
        </p>

        <p
          v-if="signingWeakNotice"
          class="jwt-warning"
          data-testid="jwt-sign-weak-key"
        >
          {{ signingWeakNotice }}
        </p>

        <ErrorNotice
          v-if="signingBlockingError"
          :message="signingBlockingError"
        />

        <ErrorNotice v-if="signingError" :message="signingError" />

        <OutputList
          v-if="generatedRows.length"
          :rows="generatedRows"
          data-testid="jwt-generated-output"
        />

        <p
          v-if="hasGeneratedTruncation"
          class="jwt-truncation"
          data-testid="jwt-truncation-note"
        >
          {{ TRUNCATION_NOTE }}
        </p>
      </section>
    </div>
  </ToolFrame>
</template>

<style scoped>
.jwt-tool,
.jwt-panel,
.jwt-field {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.jwt-tool {
  gap: 14px;
}

.jwt-panel {
  align-content: start;
}

.jwt-panel__title {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 650;
  line-height: 1.4;
}

.jwt-field {
  gap: 6px;
}

.jwt-field__label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.jwt-field__input {
  width: 100%;
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  outline: 0;
  background: var(--surface);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
}

textarea.jwt-field__input {
  min-height: 112px;
  resize: vertical;
  overflow-wrap: anywhere;
}

.jwt-field__input--token {
  min-height: 124px;
}

.jwt-field__select {
  max-width: 220px;
  cursor: pointer;
}

.jwt-field__input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
}

.jwt-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 16px;
  min-width: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.jwt-meta__status {
  min-width: 0;
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.jwt-code,
.jwt-status {
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.jwt-status {
  overflow-wrap: anywhere;
}

.jwt-status-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 6px;
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.55;
}

.jwt-status:focus-visible,
.jwt-meta__status:focus-visible {
  border-radius: 3px;
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.jwt-verify,
.jwt-signing-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 8px;
  min-width: 0;
}

.jwt-verify__secret,
.jwt-signing-controls__secret {
  flex: 1 1 210px;
  min-width: min(100%, 180px);
}

.jwt-button {
  flex: 0 0 auto;
  min-height: 38px;
  padding: 8px 13px;
  border: 1px solid var(--accent);
  border-radius: 7px;
  background: var(--accent);
  color: #ffffff;
  font-size: 13px;
  line-height: 1.35;
  cursor: pointer;
}

.jwt-button--secondary {
  border-color: var(--border-strong);
  background: var(--surface-raised);
  color: var(--text-secondary);
}

.jwt-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.jwt-button[aria-disabled='true']:not(:disabled) {
  cursor: progress;
  opacity: 0.65;
}

.jwt-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.jwt-help,
.jwt-warning,
.jwt-truncation,
.jwt-crypto-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.jwt-help {
  color: var(--text-muted);
}

.jwt-warning,
.jwt-crypto-note {
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
}

.jwt-truncation {
  color: var(--text-secondary);
  font-weight: 600;
}

@media (max-width: 520px) {
  .jwt-field__select {
    max-width: none;
  }

  .jwt-verify,
  .jwt-signing-controls {
    align-items: stretch;
  }

  .jwt-button {
    flex: 1 1 auto;
  }
}
</style>
