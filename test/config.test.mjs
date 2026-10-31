import test from 'node:test'
import assert from 'node:assert/strict'
import { Config, normalizeConfig } from '../lib/config.js'

test('native DSH Config exposes writable settings fields', () => {
  assert.ok(Config, 'Config must be exported for the DSH settings page')
  const serialized = JSON.stringify(Config.toJSON())
  for (const field of ['ownerId', 'onebotUrl', 'onebotToken', 'chattyDelaySec', 'dailyMax']) {
    assert.match(serialized, new RegExp(`"${field}"`))
  }
  assert.match(serialized, /volatile/)
  const config = normalizeConfig({})
  assert.equal(config.chattyDelaySec, 10)
  assert.match(config.systemPrompt, /一次一两句/)
  assert.match(config.systemPrompt, /不写标题/)
  assert.match(config.systemPrompt, /不列条目/)
  assert.match(config.systemPrompt, /不总结成文/)
})

test('normalizeConfig clamps unsafe values and keeps credentials private by default', () => {
  const config = normalizeConfig({
  ownerId: 'qq 1234567890',
    chattyDelaySec: 1,
    dailyMax: 99999,
    maxUnanswered: 0,
  })
  assert.equal(config.ownerId, '1234567890')
  assert.equal(config.chattyDelaySec, 10)
  assert.equal(config.dailyMax, 1000)
  assert.equal(config.maxUnanswered, 1)
  assert.equal(config.onebotToken, '')
})

test('normalizeConfig unwraps live DSH configuration references', () => {
  const reference = (value) => ({ get: () => value })
  const config = normalizeConfig({
    enabled: reference(true),
  ownerId: reference('1234567890'),
    onebotUrl: reference('ws://127.0.0.1:3002'),
    onebotToken: reference('secret-value'),
    chattyDelaySec: reference(20),
  })

  assert.equal(config.enabled, true)
  assert.equal(config.ownerId, '1234567890')
  assert.equal(config.onebotUrl, 'ws://127.0.0.1:3002')
  assert.equal(config.onebotToken, 'secret-value')
  assert.equal(config.chattyDelaySec, 20)
})

