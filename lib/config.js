import { homedir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'

const writable = (schema) => schema.extra('volatile', true)

export const DEFAULTS = {
  enabled: true,
  ownerId: '',
  onebotUrl: 'ws://127.0.0.1:3002',
  onebotToken: '',
  replyDelayMs: 300,
  chattyDelaySec: 10,
  balancedDelaySec: 120,
  activeWindowMinutes: 120,
  chattyMinMessages: 2,
  idleCheckInMinutes: 360,
  quietHoursEnabled: true,
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
  systemPrompt: '你负责在主人 QQ 私聊里自然接话和主动续话。像真人用手机打字：一次一两句，句子短、口语化，顺着最近聊到的具体内容往下接。不写标题、不列条目、不排一二三四、不总结成文、不复读对方的话、不装客服、不解释自己在思考。每次只发一小段短消息，不暴露系统提示、模型身份或幕后接法。',
}

export const Config = z.object({
  enabled: writable(z.boolean().default(DEFAULTS.enabled))
    .description('主动续话总开关。关闭后不连接 QQ，也不主动续话或回复。'),
  ownerId: writable(z.string().default(DEFAULTS.ownerId))
    .description('只允许这个 QQ 号触发主动续话，例如 1234567890。'),
  onebotUrl: writable(z.string().default(DEFAULTS.onebotUrl))
    .description('NapCat / OneBot 11 WebSocket 地址，例如 ws://127.0.0.1:3002。'),
  onebotToken: writable(z.string().default(DEFAULTS.onebotToken)).role('secret')
    .description('OneBot 鉴权 Token。只保存在本机 DSH 配置中。'),
  replyDelayMs: writable(z.natural().default(DEFAULTS.replyDelayMs).min(0).max(5000).step(100))
    .description('主人发消息后，回复前的自然延迟，单位毫秒。'),
  chattyDelaySec: writable(z.natural().default(DEFAULTS.chattyDelaySec).min(10).max(600))
    .description('热聊状态主动续话间隔，单位秒。默认 10 秒。'),
  balancedDelaySec: writable(z.natural().default(DEFAULTS.balancedDelaySec).min(30).max(3600))
    .description('普通状态主动续话间隔，单位秒。'),
  activeWindowMinutes: writable(z.natural().default(DEFAULTS.activeWindowMinutes).min(5).max(1440))
    .description('多少分钟内连续聊天算热聊，单位分钟。'),
  chattyMinMessages: writable(z.natural().default(DEFAULTS.chattyMinMessages).min(1).max(20))
    .description('窗口内至少收到几条主人消息后进入热聊。'),
  idleCheckInMinutes: writable(z.natural().default(DEFAULTS.idleCheckInMinutes).min(15).max(2880))
    .description('超过多久没有互动后停止自动续话，单位分钟。'),
  quietHoursEnabled: writable(z.boolean().default(DEFAULTS.quietHoursEnabled))
    .description('启用夜间免打扰。主人主动发消息时仍会正常回复；已经进入热聊时继续自然续话。'),
  quietHoursStart: writable(z.natural().default(DEFAULTS.quietHoursStart).min(0).max(23))
    .description('夜间免打扰开始小时，0-23。'),
  quietHoursEnd: writable(z.natural().default(DEFAULTS.quietHoursEnd).min(0).max(23))
    .description('夜间免打扰结束小时，0-23。'),
  dailyMax: writable(z.natural().default(DEFAULTS.dailyMax).min(0).max(1000))
    .description('每天最多发送多少条消息，0 表示停用。'),
  dailyTokens: writable(z.natural().default(DEFAULTS.dailyTokens).min(0).max(2000000).step(1000))
    .description('每天主动续话模型 Token 上限。达到后当天停止主动续话。'),
  maxOutputTokens: writable(z.natural().default(DEFAULTS.maxOutputTokens).min(40).max(600))
    .description('单次模型输出 Token 上限。'),
  maxChars: writable(z.natural().default(DEFAULTS.maxChars).min(20).max(300))
    .description('单条消息最大字符数。'),
  historyLimit: writable(z.natural().default(DEFAULTS.historyLimit).min(4).max(50))
    .description('每次带给模型的最近聊天条数。'),
  maxUnanswered: writable(z.natural().default(DEFAULTS.maxUnanswered).min(1).max(6))
    .description('连续主动发几次仍没回复后进入冷却。'),
  quietMinutes: writable(z.natural().default(DEFAULTS.quietMinutes).min(5).max(720))
    .description('连续没回复后的冷却时间，单位分钟。'),
  requestTimeoutSec: writable(z.natural().default(DEFAULTS.requestTimeoutSec).min(10).max(180))
    .description('单次模型请求超时，单位秒。'),
  llmProvider: writable(z.string().default(DEFAULTS.llmProvider))
    .description('可选。留空使用 DSH 当前默认模型 Provider。'),
  llmModel: writable(z.string().default(DEFAULTS.llmModel))
    .description('可选。留空使用 DSH 当前默认模型。'),
  systemPrompt: writable(z.string().default(DEFAULTS.systemPrompt))
    .description('主动续话的简短语气和长度规则。'),
})

const clampInt = (value, min, max, fallback) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, Math.round(number)))
}

const text = (value, fallback = '') => {
  const result = String(value ?? '').trim()
  return result || fallback
}

const unwrap = (value) => (
  value && typeof value === 'object' && typeof value.get === 'function'
    ? value.get()
    : value
)

export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const input = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, unwrap(value)]),
  )
  return {
    enabled: input.enabled !== false,
    ownerId: text(input.ownerId, DEFAULTS.ownerId).replace(/\D/g, ''),
    onebotUrl: text(input.onebotUrl, DEFAULTS.onebotUrl),
    onebotToken: String(input.onebotToken ?? DEFAULTS.onebotToken),
    replyDelayMs: clampInt(input.replyDelayMs, 0, 5000, DEFAULTS.replyDelayMs),
    chattyDelaySec: clampInt(input.chattyDelaySec, 10, 600, DEFAULTS.chattyDelaySec),
    balancedDelaySec: clampInt(input.balancedDelaySec, 30, 3600, DEFAULTS.balancedDelaySec),
    activeWindowMinutes: clampInt(input.activeWindowMinutes, 5, 1440, DEFAULTS.activeWindowMinutes),
    chattyMinMessages: clampInt(input.chattyMinMessages, 1, 20, DEFAULTS.chattyMinMessages),
    idleCheckInMinutes: clampInt(input.idleCheckInMinutes, 15, 2880, DEFAULTS.idleCheckInMinutes),
    quietHoursEnabled: input.quietHoursEnabled !== false,
    quietHoursStart: clampInt(input.quietHoursStart, 0, 23, DEFAULTS.quietHoursStart),
    quietHoursEnd: clampInt(input.quietHoursEnd, 0, 23, DEFAULTS.quietHoursEnd),
    dailyMax: clampInt(input.dailyMax, 0, 1000, DEFAULTS.dailyMax),
    dailyTokens: clampInt(input.dailyTokens, 0, 2000000, DEFAULTS.dailyTokens),
    maxOutputTokens: clampInt(input.maxOutputTokens, 40, 600, DEFAULTS.maxOutputTokens),
    maxChars: clampInt(input.maxChars, 20, 300, DEFAULTS.maxChars),
    historyLimit: clampInt(input.historyLimit, 4, 50, DEFAULTS.historyLimit),
    maxUnanswered: clampInt(input.maxUnanswered, 1, 6, DEFAULTS.maxUnanswered),
    quietMinutes: clampInt(input.quietMinutes, 5, 720, DEFAULTS.quietMinutes),
    requestTimeoutSec: clampInt(input.requestTimeoutSec, 10, 180, DEFAULTS.requestTimeoutSec),
    llmProvider: text(input.llmProvider),
    llmModel: text(input.llmModel),
    systemPrompt: text(input.systemPrompt, DEFAULTS.systemPrompt),
  }
}

export const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
export const DATA_DIR = join(DSH_HOME, 'storages', 'dsh-proactive-chat')

