import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

const temporaryHome = mkdtempSync(join(tmpdir(), 'dsh-runtime-test-'))
const originalHome = process.env.DSH_HOME
process.env.DSH_HOME = temporaryHome
const { apply } = await import('../index.js')
if (originalHome === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = originalHome

const settle = () => new Promise(resolve => setImmediate(resolve))
test.after(() => {
  const target = resolve(temporaryHome)
  assert.ok(target.startsWith(resolve(tmpdir()) + sep + 'dsh-runtime-test-'))
  rmSync(target, { recursive: true, force: true })
})

for (const transition of ['enabled', 'ownerId']) {
  test(`runtime polling permanently invalidates old output after ${transition} changes away and back`, async t => {
    const OriginalSocket = globalThis.WebSocket
    globalThis.WebSocket = class { close() {} }
    const config = {
      ownerId: '1234567890', replyDelayMs: 0, quietHoursEnabled: false,
      llmProvider: 'test', llmModel: 'test',
      typingDelayEnabled: true, typingMsPerChar: 120, typingMaxDelayMs: 12000,
    }
    const runtime = apply({
      logger: { info() {}, warn() {} },
      get(name) {
        if (name === 'llm') return { async *stream() {
          yield { type: 'text-delta', text: '字'.repeat(50) }
          yield { type: 'usage', usage: { totalTokens: 12 } }
        } }
        return null
      },
      effect() {},
    }, config)
    t.after(() => { runtime.cleanup(); globalThis.WebSocket = OriginalSocket })
    const timers = new Set(), sent = []
    const engine = runtime.engine
    engine.setTimer = (fn, ms) => { const timer = { fn, ms }; timers.add(timer); return timer }
    engine.clearTimer = timer => timers.delete(timer)
    engine.personaLoader = { load: () => ({ ok: true, text: '测试人格' }) }
    engine.isConnected = () => true
    engine.getCompatibility = () => ({ allowReply: true, allowProactive: true })
    engine.sendPrivate = async (_ownerId, text) => sent.push(text)
    engine.onEvent({ post_type: 'message', message_type: 'private', user_id: '1234567890', message_id: transition, raw_message: '测试' })
    await settle()
    assert.equal(timers.size, 1)
    const original = transition === 'enabled' ? true : config.ownerId
    config[transition] = transition === 'enabled' ? false : '9876543210'
    runtime.syncTransport()
    config[transition] = original
    runtime.syncTransport()
    for (const timer of [...timers]) { timers.delete(timer); timer.fn() }
    await engine.flush()
    assert.equal(sent.length, 0)
  })
}
