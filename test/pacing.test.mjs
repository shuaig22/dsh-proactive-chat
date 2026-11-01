import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { ProactiveChatEngine } from '../lib/engine.js'
import { normalizeConfig } from '../lib/config.js'
import { StateStore } from '../lib/store.js'

const settle = () => new Promise((done) => setImmediate(done))
const incoming = (id, text = '测试消息', userId = '1234567890') => ({
  post_type: 'message', message_type: 'private', user_id: userId,
  message_id: id, raw_message: text,
})

function harness(t, { length = 50, modelDelay = 0, random = 0.5, failSends = 0, startAt, config: overrides = {} } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-pacing-'))
  const start = startAt ?? new Date(2026, 10, 1, 12).getTime()
  let now = start
  const timers = new Set()
  const setTimer = (fn, delay) => {
    const timer = { fn, at: now + delay, unref() {} }
    timers.add(timer)
    return timer
  }
  const config = normalizeConfig({
    ownerId: '1234567890', replyDelayMs: 0, quietHoursEnabled: false,
    maxChars: 300, chattyMinMessages: 1,
    typingDelayEnabled: true, typingMsPerChar: 120, typingMaxDelayMs: 12000,
    ...overrides,
  })
  const sent = [], requests = []
  const connection = { connected: true }
  const compatibility = { allowReply: true, allowProactive: true }
  const store = new StateStore(join(directory, 'state.json'), { now: () => now })
  const engine = new ProactiveChatEngine({
    getConfig: () => ({ ...config }), getRoute: () => ({ provider: 'test', model: 'test' }),
    getLlm: () => ({ async *stream(request) {
      requests.push(request)
      if (modelDelay) await new Promise(done => setTimer(done, modelDelay))
      yield { type: 'text-delta', text: '字'.repeat(length) }
      yield { type: 'usage', usage: { totalTokens: 12 } }
    } }),
    store, personaLoader: { load: () => ({ ok: true, text: '测试人格' }) },
    isConnected: () => connection.connected,
    getCompatibility: () => compatibility,
    sendPrivate: async (userId, text) => {
      if (failSends-- > 0) throw new Error('simulated send failure')
      sent.push({ userId, text, at: now - start })
    },
    logger: { info() {}, warn() {} }, now: () => now,
    setTimer, clearTimer: timer => timers.delete(timer), random: () => random,
  })
  engine.start()
  t.after(() => {
    engine.stop()
    const absolute = resolve(directory)
    assert.ok(absolute.startsWith(resolve(tmpdir()) + sep + 'dsh-pacing-'))
    rmSync(absolute, { recursive: true, force: true })
  })
  return {
    engine, config, sent, requests, store, timers, connection, compatibility,
    async receive(id, text, userId) { engine.onEvent(incoming(id, text, userId)); await settle() },
    async advance(ms) {
      const end = now + ms
      for (;;) {
        const next = [...timers].filter(timer => timer.at <= end).sort((a, b) => a.at - b.at)[0]
        if (!next) break
        now = next.at
        timers.delete(next)
        next.fn()
        await settle()
      }
      now = end
      await settle()
    },
  }
}

for (const [length, expectedMs] of [[5, 800], [50, 6000], [200, 12000]]) {
  test(`paces a ${length}-character reply before sending, then starts the continuation interval`, async t => {
    const h = harness(t, { length })
    await h.receive(1)
    await h.advance(expectedMs - 1)
    assert.equal(h.sent.length, 0)
    await h.advance(1)
    assert.equal(h.sent.length, 1)
    assert.equal(h.sent[0].at, expectedMs)
    assert.equal(h.store.load(h.config.ownerId).lastBotAt, new Date(2026, 10, 1, 12).getTime() + expectedMs)
    await h.advance(9999)
    assert.equal(h.requests.length, 1)
    await h.advance(1)
    assert.equal(h.requests.length, 2)
    assert.equal(h.sent.length, 1, 'proactive output must also wait for its typing delay')
    await h.advance(expectedMs)
    assert.equal(h.sent.length, 2)
  })
}

for (const [modelDelay, expectedMs] of [[2000, 6000], [7000, 7000]]) {
  test(`credits ${modelDelay}ms of model latency toward the typing delay`, async t => {
    const h = harness(t, { modelDelay })
    await h.receive(1)
    await h.advance(expectedMs - 1)
    assert.equal(h.sent.length, 0)
    await h.advance(1)
    assert.equal(h.sent[0]?.at, expectedMs)
  })
}

test('can disable typing delay without disabling normal replies', async t => {
  const h = harness(t, { config: { typingDelayEnabled: false } })
  await h.receive(1)
  assert.equal(h.sent[0]?.at, 0)
})

test('applies configured speed and cap while keeping random variation bounded', async t => {
  const h = harness(t, { length: 10, random: 1, config: { typingMsPerChar: 300, typingMaxDelayMs: 2000 } })
  await h.receive(1)
  await h.advance(1999)
  assert.equal(h.sent.length, 0)
  await h.advance(1)
  assert.equal(h.sent[0]?.at, 2000)
})

test('a new user message cancels stale output but preserves context and model usage', async t => {
  const h = harness(t)
  await h.receive(1, '第一句话')
  await h.advance(1000)
  await h.receive(2, '补充一句')
  await h.advance(5000)
  assert.equal(h.sent.length, 0)
  await h.advance(1000)
  assert.equal(h.sent.length, 1)
  assert.match(h.requests[1].messages[0].content[0].text, /第一句话/)
  assert.match(h.requests[1].messages[0].content[0].text, /补充一句/)
  assert.equal(h.store.load(h.config.ownerId).tokensToday, 24)
})

test('duplicate deliveries do not cancel the pending reply', async t => {
  const h = harness(t)
  h.engine.onEvent(incoming(1))
  h.engine.onEvent(incoming(1))
  await settle()
  await h.advance(1000)
  await h.receive(1)
  await h.advance(5000)
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].at, 6000)
  assert.equal(h.requests.length, 1)
})

test('a new message invalidates the old proactive timer while waiting to send', async t => {
  const h = harness(t)
  await h.receive(1)
  await h.advance(15000)
  await h.receive(2)
  await h.advance(1000)
  assert.equal(h.requests.length, 2)
  await h.advance(5000)
  assert.equal(h.sent.length, 2)
  assert.equal(h.requests.length, 2)
})

for (const action of ['stop', 'disable', 'change owner']) {
  test(`${action} prevents a pending reply from being sent`, async t => {
    const h = harness(t)
    await h.receive(1)
    await h.advance(1000)
    if (action === 'stop') h.engine.stop()
    if (action === 'disable') h.config.enabled = false
    if (action === 'change owner') h.config.ownerId = '9876543210'
    await h.advance(6000)
    await h.engine.flush()
    assert.equal(h.sent.length, 0)
  })
}

test('queued messages remain bound to the owner who sent them', async t => {
  const h = harness(t)
  h.engine.onEvent(incoming(1, '旧主人的消息'))
  h.config.ownerId = '9876543210'
  await settle()
  await h.advance(12000)
  assert.equal(h.sent.length, 0)
  assert.equal(h.store.load(h.config.ownerId).history.length, 0)
})

test('slows the second unanswered continuation and then stops after the configured limit', async t => {
  const h = harness(t, { length: 5 })
  await h.receive(1)
  await h.advance(11600)
  assert.equal(h.sent.length, 2)
  await h.advance(24999)
  assert.equal(h.requests.length, 2)
  await h.advance(1)
  assert.equal(h.requests.length, 3)
  await h.advance(800)
  assert.equal(h.sent[2]?.at, 37400)
  await h.advance(3600000)
  assert.equal(h.sent.length, 3)
  assert.equal(h.timers.size, 0)
})

test('coexistence starts proactive scheduling while another plugin handles replies', async t => {
  const h = harness(t, { length: 5 })
  h.compatibility.allowReply = false
  await h.receive(1)
  assert.equal(h.sent.length, 0)
  await h.advance(9999)
  assert.equal(h.requests.length, 0)
  await h.advance(801)
  assert.equal(h.sent.length, 1)
})

test('recovers from a send failure and still accounts for the failed output', async t => {
  const h = harness(t, { length: 5, failSends: 1 })
  await h.receive(1)
  await h.advance(800)
  assert.equal(h.sent.length, 0)
  assert.equal(h.store.load(h.config.ownerId).tokensToday, 12)
  await h.advance(30800)
  assert.equal(h.sent.length, 1)
  assert.equal(h.store.load(h.config.ownerId).tokensToday, 24)
})

test('disconnected transport retries without spending model tokens', async t => {
  const h = harness(t, { length: 5 })
  h.connection.connected = false
  await h.receive(1)
  await h.advance(60000)
  assert.equal(h.requests.length, 0)
  h.connection.connected = true
  await h.advance(30800)
  assert.equal(h.sent.length, 1)
  assert.equal(h.requests.length, 1)
})

test('proactive output that crosses into quiet hours is deferred before dispatch', async t => {
  const h = harness(t, {
    startAt: new Date(2026, 10, 1, 23, 59, 40).getTime(),
    config: { chattyMinMessages: 20, quietHoursEnabled: true, quietHoursStart: 0, quietHoursEnd: 7 },
  })
  await h.receive(1)
  await h.advance(15000)
  h.engine.runProactive()
  await settle()
  await h.advance(6000)
  assert.equal(h.requests.length, 2)
  assert.equal(h.sent.length, 1)
  await h.advance(600000)
  assert.equal(h.sent.length, 1)
})

for (const field of ['dailyMax', 'dailyTokens']) {
  test(`setting ${field} to zero suppresses output already waiting to send`, async t => {
    const h = harness(t)
    await h.receive(1)
    h.config[field] = 0
    await h.advance(6000)
    assert.equal(h.sent.length, 0)
    assert.equal(h.store.load(h.config.ownerId).tokensToday, 12)
  })
}

test('a request admitted within the token budget can deliver its already charged output', async t => {
  const h = harness(t, { config: { dailyTokens: 12 } })
  await h.receive(1)
  await h.advance(6000)
  assert.equal(h.sent.length, 1)
  await h.advance(20000)
  assert.equal(h.requests.length, 1)
})
