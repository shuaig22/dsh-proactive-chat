import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProactiveChatEngine } from '../lib/engine.js'
import { PersonaFileLoader } from '../lib/persona.js'
import { StateStore, ownerTag } from '../lib/store.js'

function harness(overrides = {}, compatibility = {
  allowReply: true,
  allowProactive: true,
  reason: 'standalone',
}, options = {}) {
  const directory = options.directory ?? mkdtempSync(join(tmpdir(), 'dsh-proactive-chat-'))
  const ownsDirectory = !options.directory
  const clock = { now: Date.UTC(2026, 9, 31, 4, 0, 0) }
  const timers = []
  const sent = []
  const requests = []
  const config = {
    enabled: true,
  ownerId: '1234567890',
    onebotUrl: 'ws://127.0.0.1:3002',
    onebotToken: '',
    replyDelayMs: 0,
    chattyDelaySec: 10,
    balancedDelaySec: 120,
    activeWindowMinutes: 120,
    chattyMinMessages: 2,
    idleCheckInMinutes: 360,
    quietHoursEnabled: false,
    quietHoursStart: 0,
    quietHoursEnd: 7,
    dailyMax: 160,
    dailyTokens: 120000,
    maxOutputTokens: 160,
    maxChars: 120,
    historyLimit: 16,
    maxUnanswered: 2,
    quietMinutes: 45,
    requestTimeoutSec: 45,
    llmProvider: '',
    llmModel: '',
    personaFile: 'C:/test/persona.md',
    personaMaxChars: 3000,
    ...overrides,
  }
  const llm = {
    async *stream(request) {
      requests.push(request)
      yield { type: 'text-delta', text: '我还在，你接着说。' }
      yield { type: 'usage', usage: { totalTokens: 12 } }
    },
  }
  const personaLoader = options.personaLoader ?? {
    load: () => ({
      ok: true,
      path: 'C:/test/persona.md',
      text: '自然聊天。',
      stale: false,
      changed: false,
    }),
  }
  const store = new StateStore(join(directory, 'state.json'), { now: () => clock.now })
  const engine = new ProactiveChatEngine({
    getConfig: () => config,
    getLlm: () => llm,
    getRoute: () => ({ provider: 'fake', model: 'fake-1' }),
    store,
    getCompatibility: () => compatibility,
    sendPrivate: async (userId, text) => sent.push({ userId, text }),
    logger: { info() {}, warn() {} },
    now: () => clock.now,
    setTimer: (fn, delay) => {
      const timer = { fn, delay, unref() {} }
      timers.push(timer)
      return timer
    },
    clearTimer: () => {},
    random: () => 0.5,
    personaLoader,
  })
  engine.start()
  return {
    directory, clock, timers, sent, requests, config, store, engine, compatibility,
    cleanup: () => {
      engine.stop()
      if (ownsDirectory) rmSync(directory, { recursive: true, force: true })
    },
  }
}

const event = (id, text) => ({
  post_type: 'message',
  message_type: 'private',
  user_id: 1234567890,
  message_id: id,
  message: [{ type: 'text', data: { text } }],
})

test('replies to owner and switches to the configured hot-chat interval', async () => {
  const h = harness()
  try {
    h.engine.onEvent(event(1, '今天有点累'))
    await h.engine.flush()
    assert.equal(h.sent.length, 1)
    assert.equal(h.timers.at(-1).delay, 120000)

    h.clock.now += 1000
    h.engine.onEvent(event(2, '不过快弄完了'))
    await h.engine.flush()
    assert.equal(h.sent.length, 2)
    assert.equal(h.timers.at(-1).delay, 10000)
  } finally {
    h.cleanup()
  }
})

test('stops proactive sends after two unanswered messages', async () => {
  const h = harness()
  try {
    h.engine.onEvent(event(1, '在吗'))
    await h.engine.flush()
    h.clock.now += 20000
    await h.engine.runProactive()
    h.clock.now += 20000
    await h.engine.runProactive()
    const state = h.store.load(h.config.ownerId)
    assert.equal(state.unanswered, 2)
    assert.ok(state.quietUntil > h.clock.now)
    assert.equal(h.sent.length, 3)
  } finally {
    h.cleanup()
  }
})

test('keeps a hot chat going through quiet hours', async () => {
  const h = harness({
    quietHoursEnabled: true,
    quietHoursStart: 0,
    quietHoursEnd: 7,
  })
  try {
    h.clock.now = new Date(2026, 9, 31, 1, 0, 0).getTime()
    h.engine.onEvent(event(1, '还醒着吗'))
    await h.engine.flush()
    h.clock.now += 1000
    h.engine.onEvent(event(2, '再陪我聊一会儿'))
    await h.engine.flush()
    h.clock.now += 16000
    await h.engine.runProactive()
    assert.equal(h.sent.length, 3)
  } finally {
    h.cleanup()
  }
})

test('daily budget prevents another send', async () => {
  const h = harness({ dailyMax: 1 })
  try {
    h.engine.onEvent(event(1, '在吗'))
    await h.engine.flush()
    h.clock.now += 20000
    h.engine.onEvent(event(2, '还在吗'))
    await h.engine.flush()
    assert.equal(h.sent.length, 1)
  } finally {
    h.cleanup()
  }
})

test('state never stores the raw owner QQ', async () => {
  const h = harness()
  try {
    h.engine.onEvent(event(1, '测试'))
    await h.engine.flush()
    const state = h.store.load(h.config.ownerId)
    assert.equal(state.ownerTag, ownerTag(h.config.ownerId))
    assert.equal(JSON.stringify(state).includes(h.config.ownerId), false)
  } finally {
    h.cleanup()
  }
})

test('identity replies suppress duplicate normal replies but keep proactive chat available', async () => {
  const h = harness({}, {
    allowReply: false,
    allowProactive: true,
    reason: 'identity-replies',
  })
  try {
    h.engine.onEvent(event(1, '先记下这句'))
    await h.engine.flush()
    const afterReply = h.store.load(h.config.ownerId)
    assert.equal(h.sent.length, 0)
    assert.equal(afterReply.history.length, 1)

    h.clock.now += 1000
    await h.engine.runProactive()
    assert.equal(h.sent.length, 1)
    assert.equal(h.sent[0].text, '我还在，你接着说。')
  } finally {
    h.cleanup()
  }
})

test('identity companion suppresses every outgoing message from the standalone plugin', async () => {
  const h = harness({}, {
    allowReply: false,
    allowProactive: false,
    reason: 'identity-companion',
  })
  try {
    h.engine.onEvent(event(1, '身份插件会回复'))
    await h.engine.flush()
    h.clock.now += 20000
    await h.engine.runProactive()
    const state = h.store.load(h.config.ownerId)
    assert.equal(h.sent.length, 0)
    assert.equal(state.history.length, 1)
  } finally {
    h.cleanup()
  }
})

test('hot-reloads the selected persona file before the next reply', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-proactive-persona-'))
  const personaFile = join(directory, 'persona.md')
  writeFileSync(personaFile, '示例角色：说话简洁。', 'utf8')
  const h = harness({ personaFile }, undefined, {
    directory,
    personaLoader: new PersonaFileLoader(),
  })
  try {
    h.engine.onEvent(event(1, '你好'))
    await h.engine.flush()
    assert.match(h.requests[0].system, /示例角色：说话简洁。/)
    assert.match(h.requests[0].system, /每次只输出一到两句/)

    writeFileSync(personaFile, '示例角色：喜欢聊天气，说话更柔和一些。', 'utf8')
    h.clock.now += 1000
    h.engine.onEvent(event(2, '今天天气不错'))
    await h.engine.flush()
    assert.match(h.requests[1].system, /示例角色：喜欢聊天气，说话更柔和一些。/)
    assert.doesNotMatch(h.requests[1].system, /示例角色：说话简洁。/)
  } finally {
    h.cleanup()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('does not send model output when no valid persona file has loaded', async () => {
  const warnings = []
  const h = harness({ personaFile: '' }, undefined, {
    personaLoader: {
      load: () => ({
        ok: false,
        code: 'persona-file-missing',
        error: '还没有选择人格文件',
        path: '',
      }),
    },
  })
  h.engine.logger = { info() {}, warn: (message) => warnings.push(message) }
  try {
    h.engine.onEvent(event(1, '你好'))
    await h.engine.flush()
    assert.equal(h.requests.length, 0)
    assert.equal(h.sent.length, 0)
    assert.match(warnings[0], /还没有选择人格文件/)
  } finally {
    h.cleanup()
  }
})

