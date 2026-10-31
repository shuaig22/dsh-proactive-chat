import { ownerTag } from './store.js'
import { extractMessageText } from './onebot.js'

const MINUTE = 60000
const HOUR = 3600000

function cleanText(input, maxChars) {
  let value = String(input ?? '')
    .replace(/```[a-zA-Z0-9_-]*\s*/g, '')
    .replace(/```/g, '')
    .replace(/\|\|\|/g, '')
    .replace(/[｜|]{3,}/g, '')
    .replace(/^\s*(?:assistant|AI|主人|用户)\s*[:：]\s*/i, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
  if (value.length > maxChars) value = `${value.slice(0, Math.max(0, maxChars - 1))}…`
  return value
}

function usageTotal(usage, prompt, output) {
  if (usage && typeof usage === 'object') {
    for (const key of ['totalTokens', 'total_tokens', 'total']) {
      const value = Number(usage[key])
      if (Number.isFinite(value) && value > 0) return Math.round(value)
    }
    const sum = ['inputTokens', 'outputTokens', 'cachedInputTokens', 'cacheReadTokens']
      .reduce((total, key) => total + Math.max(0, Number(usage[key]) || 0), 0)
    if (sum > 0) return Math.round(sum)
  }
  const all = `${prompt}\n${output}`
  const cjk = (all.match(/[\u3400-\u9fff]/g) || []).length
  return Math.max(1, Math.ceil(cjk / 1.5 + (all.length - cjk) / 4))
}

async function collectStream(llm, request) {
  const output = []
  let usage = null
  for await (const chunk of llm.stream(request)) {
    if (!chunk) continue
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') output.push(chunk.text)
    else if (chunk.type === 'usage') usage = chunk.usage || null
    else if (!chunk.type && typeof chunk.text === 'string') output.push(chunk.text)
    else if (!chunk.type && typeof chunk.delta === 'string') output.push(chunk.delta)
  }
  return { text: output.join('').trim(), usage }
}

function inQuietHours(config, now) {
  if (!config.quietHoursEnabled) return false
  const hour = new Date(now).getHours()
  const start = config.quietHoursStart
  const end = config.quietHoursEnd
  if (start === end) return false
  return start < end ? hour >= start && hour < end : hour >= start || hour < end
}

function fallbackText(state, proactive, maxChars) {
  const lastUser = [...state.history].reverse().find((item) => item.role === 'user')
  const topic = cleanText(lastUser?.text || '', 32).replace(/[。！？!?]+$/g, '')
  if (topic) {
    return cleanText(
      proactive ? `刚才你说“${topic}”，后来呢？` : `嗯，我听着。你说“${topic}”，然后呢？`,
      maxChars,
    )
  }
  return cleanText(proactive ? '我还在，突然想问你一句，忙完了吗？' : '嗯，我在，继续说。', maxChars)
}

export class ProactiveChatEngine {
  constructor({
    getConfig,
    getLlm,
    getRoute,
    store,
    sendPrivate,
    logger = console,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    random = Math.random,
    getCompatibility = () => ({
      allowReply: true,
      allowProactive: true,
      reason: 'standalone',
    }),
  }) {
    this.getConfig = getConfig
    this.getLlm = getLlm
    this.getRoute = getRoute
    this.store = store
    this.sendPrivate = sendPrivate
    this.logger = logger
    this.now = now
    this.setTimer = setTimer
    this.clearTimer = clearTimer
    this.random = random
    this.getCompatibility = getCompatibility
    this.timer = null
    this.running = false
    this.queue = Promise.resolve()
  }

  start() {
    this.running = true
  }

  stop() {
    this.running = false
    this.clearTimer(this.timer)
    this.timer = null
  }

  enqueue(work) {
    this.queue = this.queue.then(work, work)
    return this.queue
  }

  flush() {
    return this.queue
  }

  onEvent(event) {
    if (!this.running) return
    if (event?.post_type !== 'message' || event?.message_type !== 'private') return
    const config = this.getConfig()
    if (!config.enabled || !config.ownerId) return
    if (String(event.user_id ?? '') !== config.ownerId) return
    const text = extractMessageText(event)
    if (!text) return
    this.enqueue(() => this.handleIncoming(text, event))
      .catch((error) => this.logger?.warn?.(`[dsh-proactive-chat] 入站处理失败: ${error?.message || error}`))
  }

  async handleIncoming(text, event = {}) {
    const config = this.getConfig()
    const now = this.now()
    const state = this.store.load(config.ownerId)
    const messageId = String(event.message_id ?? '')
    if (messageId && state.seenIds.includes(messageId)) return
    if (messageId) state.seenIds = [...state.seenIds, messageId].slice(-100)
    this.store.rollDay(state)
    state.lastUserAt = now
    state.unanswered = 0
    state.quietUntil = 0
    state.recentUserAt = [...state.recentUserAt, now]
      .filter((at) => now - Number(at || 0) <= 24 * HOUR)
      .slice(-50)
    state.history = [...state.history, { role: 'user', text: cleanText(text, 500), at: now }]
      .slice(-Math.max(4, config.historyLimit * 2))
    this.store.save(state)
    const compatibility = this.getCompatibility()
    if (!compatibility.allowReply) return false
    if (config.replyDelayMs > 0) await this.sleep(config.replyDelayMs)
    return this.composeAndSend(false)
  }

  runProactive() {
    if (!this.running) return Promise.resolve()
    return this.enqueue(() => this.composeAndSend(true))
      .catch((error) => this.logger?.warn?.(`[dsh-proactive-chat] 主动续话失败: ${error?.message || error}`))
  }

  modeOf(state, config, now) {
    if (state.quietUntil > now) return 'quiet'
    if (!state.lastUserAt) return 'quiet'
    const sinceUser = now - state.lastUserAt
    if (sinceUser > config.idleCheckInMinutes * MINUTE) return 'quiet'
    const recentCount = state.recentUserAt
      .filter((at) => now - Number(at || 0) <= config.activeWindowMinutes * MINUTE)
      .length
    if (sinceUser <= 45 * MINUTE && recentCount >= config.chattyMinMessages) return 'chatty'
    return 'balanced'
  }

  async composeAndSend(proactive) {
    if (!this.running) return false
    const config = this.getConfig()
    if (!config.enabled || !config.ownerId) return false
    const compatibility = this.getCompatibility()
    if (proactive ? !compatibility.allowProactive : !compatibility.allowReply) return false
    const now = this.now()
    let state = this.store.load(config.ownerId)
    this.store.rollDay(state)
    if (config.dailyMax <= 0 || state.sentToday >= config.dailyMax) {
      this.logger?.info?.('[dsh-proactive-chat] 已达到每日消息上限')
      return false
    }
    if (config.dailyTokens <= 0 || state.tokensToday >= config.dailyTokens) {
      this.logger?.info?.('[dsh-proactive-chat] 已达到每日 Token 上限')
      return false
    }
    if (proactive && state.quietUntil > now) return false
    const mode = this.modeOf(state, config, now)
    if (proactive && mode !== 'chatty' && inQuietHours(config, now)) {
      this.scheduleNext(Math.min(30 * MINUTE, this.msUntilQuietEnd(now, config)))
      return false
    }
    if (proactive && mode === 'quiet') return false

    const generated = await this.generateReply(state, config, mode, proactive, now)
    const text = cleanText(generated.text, config.maxChars)
    if (!text) return false
    await this.sendPrivate(config.ownerId, text)

    state = this.store.load(config.ownerId)
    this.store.rollDay(state)
    state.history = [...state.history, {
      role: 'assistant',
      text,
      at: now,
      proactive: !!proactive,
      source: generated.source,
    }].slice(-Math.max(4, config.historyLimit * 2))
    state.lastBotAt = now
    state.sentToday += 1
    state.tokensToday += Math.max(0, generated.tokens)
    if (proactive) {
      state.lastProactiveAt = now
      state.unanswered += 1
      if (state.unanswered >= config.maxUnanswered) {
        state.quietUntil = now + config.quietMinutes * MINUTE
        this.logger?.info?.(`[dsh-proactive-chat] 连续 ${state.unanswered} 次没回应，冷却 ${config.quietMinutes} 分钟`)
      }
    } else {
      state.unanswered = 0
    }
    this.store.save(state)
    this.logger?.info?.(`[dsh-proactive-chat] 已发送 ${proactive ? '主动续话' : '回复'} (${generated.source}, ${generated.tokens} tokens)`)
    if (state.quietUntil > now) {
      this.clearTimer(this.timer)
      this.timer = null
    } else {
      const baseSec = mode === 'chatty' ? config.chattyDelaySec : config.balancedDelaySec
      const jitter = 0.92 + this.random() * 0.16
      this.scheduleNext(Math.round(baseSec * 1000 * jitter))
    }
    return true
  }

  async generateReply(state, config, mode, proactive, now) {
    const route = this.getRoute(config)
    const llm = this.getLlm()
    const recent = state.history
      .slice(-config.historyLimit)
      .map((item) => `${item.role === 'user' ? '主人' : '我'}：${item.text}`)
      .join('\n')
      .slice(-1600)
    const task = proactive
      ? `现在是${mode}状态。主人还没有回复，你可以自然地再往下接一句，不要重复，不要连着刷屏。`
      : '主人刚发来消息，直接、自然地接住。'
    const prompt = `${task}\n最近聊天：\n${recent || '（还没有聊天记录）'}\n只输出一到两句自然的中文短句。`
    if (llm?.stream && route.provider && route.model) {
      try {
        const result = await collectStream(llm, {
          provider: route.provider,
          model: route.model,
          system: config.systemPrompt,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
          maxTokens: config.maxOutputTokens,
          temperature: 0.7,
          reasoningEffort: 'low',
          signal: AbortSignal.timeout(config.requestTimeoutSec * 1000),
        })
        const text = cleanText(result.text, config.maxChars)
        if (text) {
          return {
            text,
            source: 'llm',
            tokens: usageTotal(result.usage, `${config.systemPrompt}\n${prompt}`, result.text),
          }
        }
      } catch (error) {
        this.logger?.warn?.(`[dsh-proactive-chat] 模型调用失败，使用本地短句: ${error?.message || error}`)
      }
    }
    return {
      text: fallbackText(state, proactive, config.maxChars),
      source: 'local',
      tokens: 0,
    }
  }

  scheduleNext(delayMs) {
    if (!this.running || !Number.isFinite(delayMs) || delayMs <= 0) return
    this.clearTimer(this.timer)
    this.timer = this.setTimer(() => {
      this.timer = null
      this.runProactive()
    }, Math.max(1000, Math.round(delayMs)))
    this.timer?.unref?.()
  }

  msUntilQuietEnd(now, config) {
    if (!inQuietHours(config, now)) return 0
    const date = new Date(now)
    const end = new Date(now)
    end.setHours(config.quietHoursEnd, 0, 0, 0)
    if (end <= date) end.setDate(end.getDate() + 1)
    return Math.max(MINUTE, end.getTime() - now)
  }

  sleep(ms) {
    return new Promise((resolve) => {
      const timer = this.setTimer(resolve, ms)
      timer?.unref?.()
    })
  }
}

export const _internal = { cleanText, inQuietHours, usageTotal, ownerTag }

