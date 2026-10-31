import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'

export function ownerTag(ownerId = '') {
  return createHash('sha256').update(String(ownerId)).digest('hex').slice(0, 12)
}

export function dateKey(now = Date.now()) {
  const date = new Date(now)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function freshState(tag, now) {
  return {
    version: 1,
    ownerTag: tag,
    day: dateKey(now),
    sentToday: 0,
    tokensToday: 0,
    lastUserAt: 0,
    lastBotAt: 0,
    lastProactiveAt: 0,
    unanswered: 0,
    quietUntil: 0,
    recentUserAt: [],
    history: [],
    seenIds: [],
  }
}

export class StateStore {
  constructor(filePath, { now = Date.now } = {}) {
    this.filePath = filePath
    this.now = now
  }

  load(ownerId = '') {
    const tag = ownerTag(ownerId)
    let saved = null
    try {
      saved = JSON.parse(readFileSync(this.filePath, 'utf8'))
    } catch {
      saved = null
    }
    const state = saved && saved.ownerTag === tag
      ? { ...freshState(tag, this.now()), ...saved }
      : freshState(tag, this.now())
    if (!Array.isArray(state.recentUserAt)) state.recentUserAt = []
    if (!Array.isArray(state.history)) state.history = []
    if (!Array.isArray(state.seenIds)) state.seenIds = []
    this.rollDay(state)
    return state
  }

  save(state) {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.tmp-${process.pid}`
    writeFileSync(temporary, JSON.stringify(state, null, 2), 'utf8')
    renameSync(temporary, this.filePath)
  }

  rollDay(state) {
    const day = dateKey(this.now())
    if (state.day === day) return false
    state.day = day
    state.sentToday = 0
    state.tokensToday = 0
    return true
  }
}

export function writeRuntimeStatus(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}`
  writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8')
  renameSync(temporary, filePath)
}

