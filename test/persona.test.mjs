import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PersonaFileLoader,
  normalizePersonaText,
  resolvePersonaPath,
} from '../lib/persona.js'

function withDirectory(run) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-persona-file-'))
  try {
    return run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('normalizes BOM and Windows line endings in persona text', () => {
  assert.equal(normalizePersonaText('\uFEFF第一行\r\n第二行\r第三行'), '第一行\n第二行\n第三行')
})

test('expands a home-relative persona path', () => {
  assert.equal(resolvePersonaPath('~/persona.md'), join(homedir(), 'persona.md'))
})

test('loads a persona once and reuses it until the file changes', () => {
  withDirectory((directory) => {
    const file = join(directory, 'persona.md')
    writeFileSync(file, '示例人格第一版', 'utf8')
    const loader = new PersonaFileLoader()

    const first = loader.load(file, 3000)
    assert.equal(first.ok, true)
    assert.equal(first.text, '示例人格第一版')
    assert.equal(first.changed, true)

    const cached = loader.load(file, 3000)
    assert.equal(cached.ok, true)
    assert.equal(cached.changed, false)

    writeFileSync(file, '示例人格第二版，内容更长。', 'utf8')
    const changed = loader.load(file, 3000)
    assert.equal(changed.ok, true)
    assert.equal(changed.changed, true)
    assert.equal(changed.text, '示例人格第二版，内容更长。')
  })
})

test('keeps the last good persona when the file is temporarily removed', () => {
  withDirectory((directory) => {
    const file = join(directory, 'persona.md')
    writeFileSync(file, '最后一次成功读取的人格', 'utf8')
    const loader = new PersonaFileLoader()
    assert.equal(loader.load(file, 3000).ok, true)

    unlinkSync(file)
    const stale = loader.load(file, 3000)
    assert.equal(stale.ok, true)
    assert.equal(stale.stale, true)
    assert.equal(stale.text, '最后一次成功读取的人格')
  })
})

test('does not fall back to another path when the selected file is invalid', () => {
  withDirectory((directory) => {
    const first = join(directory, 'first.md')
    const second = join(directory, 'second.md')
    writeFileSync(first, '第一份人格', 'utf8')
    writeFileSync(second, '', 'utf8')
    const loader = new PersonaFileLoader()
    assert.equal(loader.load(first, 3000).ok, true)

    const result = loader.load(second, 3000)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'persona-file-empty')
  })
})

test('does not keep using a persona after the selected file is emptied', () => {
  withDirectory((directory) => {
    const file = join(directory, 'persona.md')
    writeFileSync(file, '原本有效的人格', 'utf8')
    const loader = new PersonaFileLoader()
    assert.equal(loader.load(file, 3000).ok, true)

    writeFileSync(file, '', 'utf8')
    const result = loader.load(file, 3000)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'persona-file-empty')
  })
})

test('rejects persona files above the configured byte cap', () => {
  withDirectory((directory) => {
    const file = join(directory, 'persona.md')
    writeFileSync(file, '这段内容超过八个字节', 'utf8')
    const result = new PersonaFileLoader({ maxBytes: 8 }).load(file, 3000)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'persona-file-too-large')
  })
})

test('truncates a loaded persona to the configured character limit', () => {
  withDirectory((directory) => {
    const file = join(directory, 'persona.md')
    writeFileSync(file, '一二三四五六', 'utf8')
    const result = new PersonaFileLoader().load(file, 4)
    assert.equal(result.ok, true)
    assert.equal(result.text, '一二三四')
    assert.equal(result.truncated, true)
  })
})
