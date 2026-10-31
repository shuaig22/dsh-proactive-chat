function messageTextFromSegment(segment) {
  if (typeof segment === 'string') return segment
  if (!segment || typeof segment !== 'object') return ''
  const type = segment.type
  const data = segment.data || {}
  if (type === 'text') return String(data.text ?? '')
  if (type === 'face') return '[表情]'
  if (type === 'image') return '[图片]'
  if (type === 'record') return '[语音]'
  if (type === 'file') return `[文件${data.name ? `: ${data.name}` : ''}]`
  return ''
}

export function extractMessageText(event) {
  const message = event?.message
  if (Array.isArray(message)) return message.map(messageTextFromSegment).join('').trim()
  if (message && typeof message === 'object') return messageTextFromSegment(message).trim()
  return String(event?.raw_message ?? message ?? '').trim()
}

function eventText(data) {
  if (typeof data === 'string') return data
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) return data.toString('utf8')
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data))
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data)
  return ''
}

export class OneBotClient {
  constructor({
    url = '',
    token = '',
    logger = console,
    WebSocketImpl = globalThis.WebSocket,
    reconnectMin = 2000,
    reconnectMax = 60000,
    callTimeout = 10000,
  } = {}) {
    this.url = url
    this.token = token
    this.logger = logger
    this.WebSocketImpl = WebSocketImpl
    this.reconnectMin = reconnectMin
    this.reconnectMax = reconnectMax
    this.callTimeout = callTimeout
    this.ws = null
    this.connected = false
    this.stopped = true
    this.self = null
    this.lastError = ''
    this.lastEventAt = 0
    this.reconnects = 0
    this.retryDelay = reconnectMin
    this.retryTimer = null
    this.pending = new Map()
    this.handlers = new Set()
    this.sequence = 0
  }

  onEvent(handler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  start() {
    if (!this.url || !this.WebSocketImpl) {
      this.lastError = !this.url ? '未配置 OneBot 地址' : '当前运行环境不支持 WebSocket'
      return false
    }
    this.stopped = false
    try {
      const headers = this.token ? { Authorization: `Bearer ${this.token}` } : undefined
      this.ws = headers
        ? new this.WebSocketImpl(this.url, { headers })
        : new this.WebSocketImpl(this.url)
      this.ws.onopen = () => {
        this.connected = true
        this.retryDelay = this.reconnectMin
        this.lastError = ''
        this.logger?.info?.(`[dsh-proactive-chat] OneBot 已连接 ${this.url}`)
        this.call('get_login_info').then((data) => {
          this.self = { userId: data?.user_id ?? null, nickname: data?.nickname ?? '' }
        }).catch(() => {})
      }
      this.ws.onmessage = (event) => this.handleMessage(event)
      this.ws.onerror = (event) => {
        this.lastError = String(event?.message || 'WebSocket 错误').slice(0, 160)
      }
      this.ws.onclose = () => {
        this.connected = false
        this.ws = null
        for (const pending of this.pending.values()) pending.reject(new Error('OneBot 连接已断开'))
        this.pending.clear()
        if (!this.stopped) this.scheduleReconnect()
      }
      return true
    } catch (error) {
      this.lastError = String(error?.message || error).slice(0, 160)
      return false
    }
  }

  scheduleReconnect() {
    this.reconnects += 1
    const delay = this.retryDelay
    this.retryDelay = Math.min(this.reconnectMax, Math.round(this.retryDelay * 1.6))
    clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => this.start(), delay)
    this.retryTimer.unref?.()
  }

  stop() {
    this.stopped = true
    clearTimeout(this.retryTimer)
    try {
      this.ws?.close()
    } catch {
      // The socket may already be closed.
    }
    this.ws = null
    this.connected = false
  }

  handleMessage(event) {
    let data = null
    try {
      data = JSON.parse(eventText(event?.data))
    } catch {
      return
    }
    if (!data || typeof data !== 'object') return
    if (data.echo != null && this.pending.has(data.echo)) {
      const pending = this.pending.get(data.echo)
      this.pending.delete(data.echo)
      if (data.status === 'failed' || data.retcode) {
        pending.reject(new Error(data.message || data.wording || 'OneBot API 失败'))
      } else {
        pending.resolve(data.data)
      }
      return
    }
    if (!data.post_type) return
    this.lastEventAt = Date.now()
    for (const handler of this.handlers) {
      try {
        handler(data)
      } catch {
        // One bad listener must not stop the transport.
      }
    }
  }

  call(action, params = {}, timeoutMs = this.callTimeout) {
    if (!this.connected || !this.ws) return Promise.reject(new Error('OneBot 尚未连接'))
    const echo = `r${++this.sequence}`
    const payload = JSON.stringify({ action, params, echo })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(echo)
        reject(new Error(`OneBot API 超时: ${action}`))
      }, timeoutMs)
      timer.unref?.()
      this.pending.set(echo, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      try {
        this.ws.send(payload)
      } catch (error) {
        this.pending.delete(echo)
        clearTimeout(timer)
        reject(error)
      }
    })
  }

  async sendPrivate(userId, text) {
    return this.call('send_private_msg', {
      user_id: Number(userId),
      message: [{ type: 'text', data: { text: String(text) } }],
    })
  }

  async getLoginInfo() {
    return this.call('get_login_info')
  }

  describe() {
    return {
      connected: this.connected,
      endpoint: this.url,
      account: this.self,
      reconnects: this.reconnects,
      lastEventAt: this.lastEventAt,
      lastError: this.lastError,
    }
  }
}

