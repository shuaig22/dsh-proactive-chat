import test from 'node:test'
import assert from 'node:assert/strict'
import { OneBotClient, extractMessageText } from '../lib/onebot.js'

class FakeWebSocket {
  static instances = []

  constructor(url) {
    this.url = url
    this.sent = []
    FakeWebSocket.instances.push(this)
  }

  send(data) {
    this.sent.push(JSON.parse(data))
  }

  close() {
    this.onclose?.()
  }

  open() {
    this.onopen?.()
  }

  message(data) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

test('extracts plain text from OneBot message segments', () => {
  const text = extractMessageText({
    message: [
      { type: 'text', data: { text: '你好' } },
      { type: 'image', data: {} },
      { type: 'text', data: { text: '呀' } },
    ],
  })
  assert.equal(text, '你好[图片]呀')
})

test('sends private messages through OneBot API', async () => {
  const client = new OneBotClient({
    url: 'ws://fake',
    WebSocketImpl: FakeWebSocket,
    logger: { info() {} },
  })
  assert.equal(client.start(), true)
  const socket = FakeWebSocket.instances.at(-1)
  socket.open()
  const loginCall = socket.sent[0]
  socket.message({ echo: loginCall.echo, status: 'ok', data: { user_id: 10001 } })

  const pending = client.sendPrivate(1234567890, '测试消息')
  const sendCall = socket.sent.at(-1)
  assert.equal(sendCall.action, 'send_private_msg')
  assert.equal(sendCall.params.user_id, 1234567890)
  assert.equal(sendCall.params.message[0].data.text, '测试消息')
  socket.message({ echo: sendCall.echo, status: 'ok', data: { message_id: 77 } })
  assert.deepEqual(await pending, { message_id: 77 })
  client.stop()
})

