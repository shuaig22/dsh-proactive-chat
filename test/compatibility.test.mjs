import test from 'node:test'
import assert from 'node:assert/strict'
import {
  inspectIdentityCompatibility,
  normalizeOneBotEndpoint,
} from '../lib/compatibility.js'

const identity = {
  transport: {
    mode: 'onebot',
    onebot: { url: 'ws://127.0.0.1:3002/' },
  },
  companion: { enabled: false },
}

test('normalizes trailing slashes and case for OneBot endpoints', () => {
  assert.equal(
    normalizeOneBotEndpoint(' WS://127.0.0.1:3002/// '),
    'ws://127.0.0.1:3002',
  )
})

test('yields normal replies while identity handles the same OneBot transport', () => {
  const result = inspectIdentityCompatibility(identity, 'ws://127.0.0.1:3002')
  assert.equal(result.sameTransport, true)
  assert.equal(result.allowReply, false)
  assert.equal(result.allowProactive, true)
  assert.equal(result.reason, 'identity-replies')
})

test('yields proactive sends when identity companion is enabled', () => {
  const result = inspectIdentityCompatibility({
    ...identity,
    companion: { enabled: true },
  }, 'ws://127.0.0.1:3002')
  assert.equal(result.allowReply, false)
  assert.equal(result.allowProactive, false)
  assert.equal(result.reason, 'identity-companion')
})

test('stays fully standalone on a different transport', () => {
  const result = inspectIdentityCompatibility(identity, 'ws://127.0.0.1:4000')
  assert.equal(result.sameTransport, false)
  assert.equal(result.allowReply, true)
  assert.equal(result.allowProactive, true)
  assert.equal(result.reason, 'standalone')
})
