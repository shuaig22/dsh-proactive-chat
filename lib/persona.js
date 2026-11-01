import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const DEFAULT_MAX_BYTES = 1024 * 1024

export function resolvePersonaPath(value) {
  const input = String(value ?? '').trim()
  if (!input) return ''
  if (input === '~') return homedir()
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return resolve(homedir(), input.slice(2))
  }
  return resolve(input)
}

export function normalizePersonaText(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
}

function messageOf(error) {
  return String(error?.message || error || '未知错误')
}

export class PersonaFileLoader {
  constructor({
    readFile = readFileSync,
    statFile = statSync,
    maxBytes = DEFAULT_MAX_BYTES,
  } = {}) {
    this.readFile = readFile
    this.statFile = statFile
    this.maxBytes = maxBytes
    this.cache = null
  }

  failure(code, message, path) {
    return {
      ok: false,
      code,
      error: message,
      path,
    }
  }

  cachedResult(maxChars, extra = {}) {
    const cached = this.cache
    const limit = Math.max(1, Math.round(Number(maxChars) || 3000))
    return {
      ok: true,
      path: cached.path,
      text: cached.content.slice(0, limit),
      changed: false,
      stale: false,
      truncated: cached.content.length > limit,
      bytes: cached.bytes,
      ...extra,
    }
  }

  staleResult(code, error, path, maxChars) {
    const cached = this.cache
    if (!cached || cached.path !== path) return null
    return this.cachedResult(maxChars, {
      stale: true,
      code,
      error,
    })
  }

  load(filePath, maxChars = 3000) {
    const path = resolvePersonaPath(filePath)
    if (!path) {
      return this.failure('persona-file-missing', '还没有选择人格文件', path)
    }

    let stats
    try {
      stats = this.statFile(path)
    } catch (error) {
      const message = `无法读取人格文件：${messageOf(error)}`
      return this.staleResult('persona-file-unreadable', message, path, maxChars)
        ?? this.failure('persona-file-unreadable', message, path)
    }

    if (!stats?.isFile?.()) {
      const message = '人格文件路径不是普通文件'
      return this.failure('persona-file-not-file', message, path)
    }
    if (Number(stats.size) > this.maxBytes) {
      const message = `人格文件超过 ${this.maxBytes} 字节上限`
      return this.failure('persona-file-too-large', message, path)
    }

    const signature = [
      Number(stats.mtimeMs) || 0,
      Number(stats.ctimeMs) || 0,
      Number(stats.size) || 0,
    ].join(':')
    if (this.cache?.path === path && this.cache.signature === signature) {
      return this.cachedResult(maxChars)
    }

    let raw
    try {
      raw = this.readFile(path, 'utf8')
    } catch (error) {
      const message = `读取人格文件失败：${messageOf(error)}`
      return this.staleResult('persona-file-read-failed', message, path, maxChars)
        ?? this.failure('persona-file-read-failed', message, path)
    }

    const content = normalizePersonaText(raw)
    if (!content) {
      const message = '人格文件是空的'
      return this.failure('persona-file-empty', message, path)
    }

    const bytes = Number(stats.size) || Buffer.byteLength(content, 'utf8')
    this.cache = { path, signature, content, bytes }
    return this.cachedResult(maxChars, { changed: true })
  }
}
