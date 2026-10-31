import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { Config, DATA_DIR, DSH_HOME, normalizeConfig } from './lib/config.js'
import { inspectIdentityCompatibility } from './lib/compatibility.js'
import { OneBotClient } from './lib/onebot.js'
import { ProactiveChatEngine } from './lib/engine.js'
import { StateStore, writeRuntimeStatus } from './lib/store.js'

export { Config }

export const name = 'dsh-proactive-chat'
export const inject = ['settings']
export const optional = ['llm', 'agentDefaultModel']

const IDENTITY_SETTINGS = join(DSH_HOME, 'storages', 'dsh-qqbot-refine', 'settings.json')

function getService(ctx, name) {
  try {
    return ctx.get?.(name) ?? null
  } catch {
    return null
  }
}

function resolveRoute(ctx, config) {
  if (config.llmProvider && config.llmModel) {
    return { provider: config.llmProvider, model: config.llmModel }
  }
  try {
    const selected = getService(ctx, 'agentDefaultModel')?.currentSelection?.()
    if (selected?.provider && selected?.model) {
      return { provider: String(selected.provider), model: String(selected.model) }
    }
  } catch {
    // The host model service may not be mounted yet.
  }
  return { provider: config.llmProvider, model: config.llmModel }
}

function readIdentityCompatibility(config) {
  try {
    const identityConfig = JSON.parse(readFileSync(IDENTITY_SETTINGS, 'utf8'))
    return inspectIdentityCompatibility(identityConfig, config.onebotUrl)
  } catch {
    return inspectIdentityCompatibility({}, config.onebotUrl)
  }
}

export function apply(ctx, pluginConfig = {}) {
  const logger = ctx.logger ?? console
  const getConfig = () => normalizeConfig(pluginConfig)
  const store = new StateStore(join(DATA_DIR, 'state.json'))
  let client = null
  let transportSignature = ''
  let stopped = false
  const runtimeFile = join(DATA_DIR, 'runtime.json')

  const engine = new ProactiveChatEngine({
    getConfig,
    getLlm: () => getService(ctx, 'llm'),
    getRoute: (config) => resolveRoute(ctx, config),
    store,
    getCompatibility: () => readIdentityCompatibility(getConfig()),
    sendPrivate: async (ownerId, text) => {
      if (!client?.connected) throw new Error('OneBot 尚未连接，无法发送消息')
      return client.sendPrivate(ownerId, text)
    },
    logger,
  })
  engine.start()

  const writeRuntime = (config) => {
    const compatibility = readIdentityCompatibility(config)
    writeRuntimeStatus(runtimeFile, {
      plugin: name,
      version: '0.2.0',
      pid: process.pid,
      updatedAt: new Date().toISOString(),
      enabled: config.enabled,
      ownerConfigured: !!config.ownerId,
      settings: {
        chattyDelaySec: config.chattyDelaySec,
        balancedDelaySec: config.balancedDelaySec,
        dailyMax: config.dailyMax,
        dailyTokens: config.dailyTokens,
      },
      transport: client?.describe?.() ?? null,
      compatibility,
    })
  }

  const syncTransport = () => {
    if (stopped) return
    const config = getConfig()
    const signature = JSON.stringify([config.enabled, config.onebotUrl, config.onebotToken])
    if (signature === transportSignature) {
      writeRuntime(config)
      return
    }
    transportSignature = signature
    client?.stop()
    client = null
    if (!config.enabled || !config.onebotUrl) {
      writeRuntime(config)
      return
    }
    client = new OneBotClient({
      url: config.onebotUrl,
      token: config.onebotToken,
      logger,
    })
    client.onEvent((event) => engine.onEvent(event))
    if (!client.start()) logger.warn?.(`[dsh-proactive-chat] OneBot 启动失败: ${client.lastError}`)
    if (!config.ownerId) logger.warn?.('[dsh-proactive-chat] 还没有配置 Owner QQ，收到消息也不会处理')
    writeRuntime(config)
  }

  syncTransport()
  const configTimer = setInterval(syncTransport, 2000)
  configTimer.unref?.()

  const cleanup = () => {
    stopped = true
    clearInterval(configTimer)
    engine.stop()
    client?.stop()
    client = null
  }
  ctx.effect?.(() => cleanup, 'dsh-proactive-chat: runtime')

  logger.info?.(`[dsh-proactive-chat] 已启动；设置命名空间：${name}`)
  return { engine, client: () => client, syncTransport, cleanup }
}

export default { name, inject, optional, Config, apply }

