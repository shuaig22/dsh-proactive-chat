import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function loadClient() {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  let record
  const styleTags = []
  const document = {
    createElement() {
      return {
        dataset: {},
        textContent: '',
        remove() {},
      }
    },
    head: {
      appendChild(tag) {
        styleTags.push(tag)
      },
    },
  }
  const context = {
    document,
    console,
    window: {
      __ModuleLoader__: {
        load(next) {
          record = next
        },
      },
    },
  }
  vm.runInNewContext(source, context, { filename: 'client.js' })
  assert.ok(record, 'client module must register with the DSH module loader')

  class Component {
    constructor(props) {
      this.props = props
    }
  }
  const React = {
    Component,
    createElement() {
      return null
    },
    useCallback(fn) {
      return fn
    },
    useEffect() {},
    useMemo(fn) {
      return fn()
    },
    useRef(value) {
      return { current: value }
    },
    useState(value) {
      return [value, () => {}]
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot()
    },
  }
  const plugin = record.factory((id) => {
    assert.equal(id, 'react')
    return React
  })
  return { plugin, styleTags }
}

test('client registers its form in the settings sidebar', () => {
  const { plugin, styleTags } = loadClient()
  let registration
  let watchedNamespace
  const ctx = {
    effect(run) {
      run()
    },
    configForms: {
      whileServed(namespaces, register) {
        watchedNamespace = namespaces
        return register()
      },
      get(namespace) {
        assert.equal(namespace, 'dsh-proactive-chat')
        return { getSnapshot() {} }
      },
    },
    slots: {
      inject(name, register) {
        assert.equal(name, 'settings.section')
        return register()
      },
      register(options, component) {
        registration = { options, component }
        return () => {}
      },
    },
  }

  plugin.apply(ctx)
  assert.equal(watchedNamespace[0], 'dsh-proactive-chat')
  assert.equal(registration.options.name, 'settings.section')
  assert.equal(registration.options.id, 'dsh-proactive-chat')
  assert.equal(registration.options.label, '更像人的聊天')
  assert.equal(registration.options.order, 34)
  assert.equal(typeof registration.options.inject, 'function')
  assert.equal(typeof registration.options.inject().form.getSnapshot, 'function')
  assert.equal(styleTags.length, 1)
})

test('client exposes every operator field and preserves a blank secret', () => {
  const { plugin } = loadClient()
  const baseline = plugin.test.makeDraft({ enabled: true, ownerId: '1234567890' })
  const draft = { ...baseline, chattyDelaySec: 30 }

  assert.equal(plugin.test.buildOps(baseline, draft, '', false).length, 1)
  assert.equal(
    JSON.stringify(plugin.test.buildOps(baseline, draft, '', false)),
    JSON.stringify([{ op: 'set', path: ['chattyDelaySec'], value: 30 }]),
  )
  assert.equal(
    JSON.stringify(plugin.test.buildOps(baseline, baseline, '', true)),
    JSON.stringify([{ op: 'unset', path: ['onebotToken'] }]),
  )
  assert.equal(
    JSON.stringify(plugin.test.buildOps(baseline, baseline, 'new-secret', false)),
    JSON.stringify([{ op: 'set', path: ['onebotToken'], value: 'new-secret' }]),
  )
  assert.equal(plugin.fields.find((field) => field.key === 'onebotToken')?.kind, 'secret')
  assert.equal(plugin.fields.find((field) => field.key === 'personaFile')?.kind, 'text')
  assert.ok(plugin.fields.some((field) => field.key === 'personaMaxChars'))
  assert.equal(plugin.fields.some((field) => field.key === 'systemPrompt'), false)
  assert.ok(plugin.fields.some((field) => field.key === 'chattyDelaySec'))
  assert.ok(plugin.fields.some((field) => field.key === 'quietHoursEnabled'))
  assert.ok(plugin.fields.some((field) => field.key === 'dailyTokens'))
})

test('typing controls can be edited and submitted through the settings form', () => {
  const { plugin } = loadClient()
  const baseline = plugin.test.makeDraft({})
  const draft = { ...baseline, typingDelayEnabled: false, typingMsPerChar: 200, typingMaxDelayMs: 8000 }
  assert.equal(plugin.test.validateDraft(draft), '')
  const ops = plugin.test.buildOps(baseline, draft)
  assert.deepEqual(JSON.parse(JSON.stringify(ops)), [
    { op: 'set', path: ['typingDelayEnabled'], value: false },
    { op: 'set', path: ['typingMsPerChar'], value: 200 },
    { op: 'set', path: ['typingMaxDelayMs'], value: 8000 },
  ])
})
