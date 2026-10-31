window.__ModuleLoader__.load({
  id: 'dsh-proactive-chat',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-proactive-chat'
    const PLUGIN_ID = 'dsh-proactive-chat'

    const FIELDS = [
      {
        key: 'enabled',
        group: '连接',
        label: '启用主动续话',
        kind: 'switch',
        default: true,
        hint: '关闭后不连接 OneBot，也不会主动续话或回复。',
      },
      {
        key: 'ownerId',
        group: '连接',
        label: '主人 QQ',
        kind: 'text',
        default: '',
                placeholder: '例如 1234567890',
        inputMode: 'numeric',
        hint: '只接受这个 QQ 号的私聊消息。',
      },
      {
        key: 'onebotUrl',
        group: '连接',
        label: 'OneBot WebSocket',
        kind: 'text',
        default: 'ws://127.0.0.1:3002',
        placeholder: 'ws://127.0.0.1:3002',
        hint: 'NapCat 或兼容 OneBot 11 的 WebSocket 地址。',
      },
      {
        key: 'onebotToken',
        group: '连接',
        label: 'OneBot Token',
        kind: 'secret',
        default: '',
        placeholder: '留空保持当前 Token',
        hint: '只保存在本机 DSH 配置中；留空不会覆盖已有值。',
      },
      {
        key: 'replyDelayMs',
        group: '续话节奏',
        label: '收到消息后的延迟',
        kind: 'number',
        default: 300,
        min: 0,
        max: 5000,
        step: 100,
        unit: '毫秒',
        hint: '让回复不要像机器人一样瞬间出现。',
      },
      {
        key: 'chattyDelaySec',
        group: '续话节奏',
        label: '热聊续话间隔',
        kind: 'number',
        default: 10,
        min: 10,
        max: 600,
        step: 1,
        unit: '秒',
        hint: '两个人正在连续聊天时，主动续一句的间隔。',
      },
      {
        key: 'balancedDelaySec',
        group: '续话节奏',
        label: '普通续话间隔',
        kind: 'number',
        default: 120,
        min: 30,
        max: 3600,
        step: 1,
        unit: '秒',
        hint: '没有进入热聊状态时使用。',
      },
      {
        key: 'activeWindowMinutes',
        group: '续话节奏',
        label: '热聊判定窗口',
        kind: 'number',
        default: 120,
        min: 5,
        max: 1440,
        step: 1,
        unit: '分钟',
        hint: '在这个时间窗口内达到条数，才算热聊。',
      },
      {
        key: 'chattyMinMessages',
        group: '续话节奏',
        label: '进入热聊的消息数',
        kind: 'number',
        default: 2,
        min: 1,
        max: 20,
        step: 1,
        unit: '条',
        hint: '窗口内至少连续收到几条主人消息。',
      },
      {
        key: 'idleCheckInMinutes',
        group: '续话节奏',
        label: '停止续话等待时间',
        kind: 'number',
        default: 360,
        min: 15,
        max: 2880,
        step: 1,
        unit: '分钟',
        hint: '超过这么久没有互动，就停止自动续话。',
      },
      {
        key: 'dailyMax',
        group: '限额与冷却',
        label: '每日消息上限',
        kind: 'number',
        default: 160,
        min: 0,
        max: 1000,
        step: 1,
        unit: '条',
        hint: '设为 0 可停止主动发送。',
      },
      {
        key: 'dailyTokens',
        group: '限额与冷却',
        label: '每日 Token 上限',
        kind: 'number',
        default: 120000,
        min: 0,
        max: 2000000,
        step: 1000,
        unit: 'Token',
        hint: '达到上限后当天停止主动续话。',
      },
      {
        key: 'maxOutputTokens',
        group: '限额与冷却',
        label: '单次输出 Token',
        kind: 'number',
        default: 160,
        min: 40,
        max: 600,
        step: 1,
        unit: 'Token',
        hint: '限制模型每次生成的长度。',
      },
      {
        key: 'maxChars',
        group: '限额与冷却',
        label: '单条最大字符数',
        kind: 'number',
        default: 120,
        min: 20,
        max: 300,
        step: 1,
        unit: '字符',
        hint: '发送前会按这个上限截短。',
      },
      {
        key: 'historyLimit',
        group: '限额与冷却',
        label: '带入的聊天记录',
        kind: 'number',
        default: 16,
        min: 4,
        max: 50,
        step: 1,
        unit: '条',
        hint: '每次请求模型时携带的最近消息数。',
      },
      {
        key: 'maxUnanswered',
        group: '限额与冷却',
        label: '连续未回复上限',
        kind: 'number',
        default: 2,
        min: 1,
        max: 6,
        step: 1,
        unit: '次',
        hint: '连续主动发送几次都没回应后进入冷却。',
      },
      {
        key: 'quietMinutes',
        group: '限额与冷却',
        label: '未回复冷却时间',
        kind: 'number',
        default: 45,
        min: 5,
        max: 720,
        step: 1,
        unit: '分钟',
        hint: '冷却期间只回复你主动发来的消息。',
      },
      {
        key: 'requestTimeoutSec',
        group: '限额与冷却',
        label: '模型请求超时',
        kind: 'number',
        default: 45,
        min: 10,
        max: 180,
        step: 1,
        unit: '秒',
        hint: '模型长时间没有返回时结束本次请求。',
      },
      {
        key: 'quietHoursEnabled',
        group: '免打扰',
        label: '启用夜间免打扰',
        kind: 'switch',
        default: true,
        hint: '免打扰期间不会主动发消息；主人发来消息仍会回复，已经进入热聊时允许继续续话。',
      },
      {
        key: 'quietHoursStart',
        group: '免打扰',
        label: '开始小时',
        kind: 'number',
        default: 0,
        min: 0,
        max: 23,
        step: 1,
        unit: '点',
        hint: '使用本机时间，范围 0-23。',
      },
      {
        key: 'quietHoursEnd',
        group: '免打扰',
        label: '结束小时',
        kind: 'number',
        default: 7,
        min: 0,
        max: 23,
        step: 1,
        unit: '点',
        hint: '使用本机时间，范围 0-23。',
      },
      {
        key: 'llmProvider',
        group: '模型',
        label: 'Provider',
        kind: 'text',
        default: '',
        placeholder: '留空使用 DSH 默认模型',
        hint: '只有需要固定到别的 Provider 时才填写。',
      },
      {
        key: 'llmModel',
        group: '模型',
        label: 'Model',
        kind: 'text',
        default: '',
        placeholder: '留空使用 DSH 默认模型',
        hint: '只有需要固定到别的模型时才填写。',
      },
      {
        key: 'personaFile',
        group: '人格文件',
        label: '人格文件路径',
        kind: 'text',
        default: '',
        placeholder: 'C:/Users/you/persona.md',
        hint: '填写本机 UTF-8 文本或 Markdown 文件的绝对路径。每次回复和主动续话前都会检查文件，改完保存后下一条消息自动生效。',
      },
      {
        key: 'personaMaxChars',
        group: '人格文件',
        label: '人格读取上限',
        kind: 'number',
        default: 3000,
        min: 200,
        max: 12000,
        step: 100,
        unit: '字',
        hint: '超过上限的部分不会进入模型提示。默认 3000 字。',
      },
    ]

    const FIELD_BY_KEY = new Map(FIELDS.map((field) => [field.key, field]))
    const GROUPS = [...new Set(FIELDS.map((field) => field.group))]

    function makeDraft(value) {
      const source = value && typeof value === 'object' ? value : {}
      const draft = {}
      for (const field of FIELDS) {
        if (field.kind === 'secret') continue
        const current = Object.hasOwn(source, field.key) ? source[field.key] : field.default
        if (field.kind === 'switch') draft[field.key] = Boolean(current)
        else if (field.kind === 'number') {
          const number = Number(current)
          draft[field.key] = Number.isFinite(number) ? number : field.default
        } else draft[field.key] = String(current ?? '')
      }
      return draft
    }

    function buildOps(baseline, draft, token = '', clearToken = false) {
      const ops = []
      for (const field of FIELDS) {
        if (field.kind === 'secret') continue
        const before = baseline?.[field.key]
        const after = draft?.[field.key]
        if (!Object.is(before, after)) {
          ops.push({ op: 'set', path: [field.key], value: after })
        }
      }
      if (token.length > 0) {
        ops.push({ op: 'set', path: ['onebotToken'], value: token })
      } else if (clearToken) {
        ops.push({ op: 'unset', path: ['onebotToken'] })
      }
      return ops
    }

    function validateDraft(draft) {
      for (const field of FIELDS) {
        if (field.kind !== 'number') continue
        const value = draft[field.key]
        if (!Number.isInteger(value)) return `${field.label}必须是整数`
        if (value < field.min || value > field.max) {
          return `${field.label}必须在 ${field.min}-${field.max} 之间`
        }
      }
      const ownerId = String(draft.ownerId ?? '').trim()
      if (ownerId && !/^\d{5,20}$/.test(ownerId)) return '主人 QQ 只填写 5-20 位数字'
      const onebotUrl = String(draft.onebotUrl ?? '').trim()
      if (onebotUrl && !/^wss?:\/\//i.test(onebotUrl)) return 'OneBot WebSocket 必须以 ws:// 或 wss:// 开头'
      const personaFile = String(draft.personaFile ?? '').trim()
      if (personaFile.includes('\0')) return '人格文件路径包含无效字符'
      return ''
    }

    const CSS = `
      .pc-root{display:flex;flex-direction:column;gap:18px;max-width:760px;color:var(--dsw-alias-label-primary);}
      .pc-head{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;}
      .pc-titlebox{display:flex;flex-direction:column;gap:4px;min-width:220px;flex:1;}
      .pc-title{margin:0;font-size:16px;line-height:24px;font-weight:600;letter-spacing:0;}
      .pc-subtitle{margin:0;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:12px;line-height:18px;}
      .pc-actions{display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap;}
      .pc-button{height:32px;padding:0 12px;border-radius:7px;border:0.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.32));background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:30px;cursor:pointer;letter-spacing:0;}
      .pc-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.2));}
      .pc-button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#3b82f6);outline-offset:2px;}
      .pc-button[data-primary]{border-color:var(--dsw-alias-state-business-primary,#3b82f6);background:var(--dsw-alias-state-business-primary,#3b82f6);color:var(--dsw-static-neutral-00,#fff);}
      .pc-button:disabled{opacity:.48;cursor:default;}
      .pc-message{display:flex;align-items:center;min-height:28px;padding:0 10px;border-radius:7px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1));color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:12px;line-height:18px;}
      .pc-message[data-tone="good"]{color:var(--dsw-alias-state-success-primary,#16a34a);}
      .pc-message[data-tone="bad"]{color:var(--dsw-alias-state-error-primary,#dc2626);}
      .pc-groups{display:flex;flex-direction:column;gap:22px;}
      .pc-group{display:flex;flex-direction:column;gap:2px;}
      .pc-group-title{margin:0 0 5px;color:var(--dsw-alias-label-secondary,#5f6670);font-size:12px;line-height:18px;font-weight:600;letter-spacing:.04em;}
      .pc-row{display:grid;grid-template-columns:minmax(150px,220px) minmax(0,1fr);gap:18px;align-items:start;padding:12px 0;border-top:0.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2));}
      .pc-row:first-of-type{border-top:0;}
      .pc-labelbox{display:flex;flex-direction:column;gap:3px;min-width:0;padding-top:6px;}
      .pc-label{font-size:13px;line-height:19px;font-weight:500;color:var(--dsw-alias-label-primary);}
      .pc-hint{margin:0;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:11px;line-height:17px;}
      .pc-controlbox{display:flex;flex-direction:column;gap:7px;min-width:0;}
      .pc-controlline{display:flex;align-items:center;gap:8px;min-width:0;}
      .pc-input,.pc-textarea{width:100%;box-sizing:border-box;border:0.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.34));border-radius:7px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08));color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;}
      .pc-input{height:34px;padding:0 10px;}
      .pc-textarea{min-height:112px;padding:8px 10px;resize:vertical;}
      .pc-input:focus-visible,.pc-textarea:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary,#3b82f6);box-shadow:0 0 0 1px var(--dsw-alias-state-business-primary,#3b82f6);}
      .pc-input:disabled,.pc-textarea:disabled{opacity:.5;cursor:default;}
      .pc-number{max-width:150px;}
      .pc-unit{flex:none;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:11px;white-space:nowrap;}
      .pc-switch{position:relative;flex:none;width:40px;height:22px;padding:0;border:0;border-radius:11px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.3));cursor:pointer;transition:background .15s ease;}
      .pc-switch:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#3b82f6);outline-offset:2px;}
      .pc-switch[data-on]{background:var(--dsw-alias-state-business-primary,#3b82f6);}
      .pc-switch span{position:absolute;top:3px;left:3px;display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-static-neutral-00,#fff);transition:left .15s ease;}
      .pc-switch[data-on] span{left:21px;}
      .pc-inline-check{display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:11px;line-height:17px;cursor:pointer;}
      .pc-inline-check input{margin:0;accent-color:var(--dsw-alias-state-business-primary,#3b82f6);}
      .pc-loading{padding:16px 0;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:13px;}
      .pc-boundary{display:flex;flex-direction:column;gap:10px;padding:14px;border:0.5px solid var(--dsw-alias-state-error-primary,#dc2626);border-radius:8px;color:var(--dsw-alias-label-primary);font-size:13px;}
      @media (max-width:680px){
        .pc-row{grid-template-columns:1fr;gap:7px;padding:13px 0;}
        .pc-labelbox{padding-top:0;}
        .pc-actions{width:100%;margin-left:0;}
        .pc-actions .pc-button{flex:1;}
      }
    `

    function Control({ field, value, disabled, onChange }) {
      if (field.kind === 'switch') {
        return h('div', { className: 'pc-controlbox' },
          h('div', { className: 'pc-controlline' },
            h('button', {
              type: 'button',
              role: 'switch',
              className: 'pc-switch',
              'aria-checked': Boolean(value),
              'aria-label': field.label,
              'data-on': value ? '' : undefined,
              disabled,
              onClick: () => onChange(!value),
            }, h('span')),
            h('span', { className: 'pc-unit' }, value ? '已启用' : '已关闭')))
      }

      if (field.kind === 'textarea') {
        return h('div', { className: 'pc-controlbox' },
          h('textarea', {
            id: `pc-${field.key}`,
            className: 'pc-textarea',
            rows: field.rows || 4,
            value,
            disabled,
            onChange: (event) => onChange(event.target.value),
          }))
      }

      if (field.kind === 'secret') {
        return h('div', { className: 'pc-controlbox' },
          h('input', {
            id: `pc-${field.key}`,
            className: 'pc-input',
            type: 'password',
            value,
            placeholder: field.placeholder,
            autoComplete: 'new-password',
            spellCheck: false,
            disabled,
            onChange: (event) => onChange(event.target.value),
          }))
      }

      if (field.kind === 'number') {
        return h('div', { className: 'pc-controlbox' },
          h('div', { className: 'pc-controlline' },
            h('input', {
              id: `pc-${field.key}`,
              className: 'pc-input pc-number',
              type: 'number',
              value,
              min: field.min,
              max: field.max,
              step: field.step || 1,
              inputMode: 'numeric',
              disabled,
              onChange: (event) => {
                const next = event.target.value
                onChange(next === '' ? '' : Number(next))
              },
            }),
            field.unit ? h('span', { className: 'pc-unit' }, field.unit) : null))
      }

      return h('div', { className: 'pc-controlbox' },
        h('input', {
          id: `pc-${field.key}`,
          className: 'pc-input',
          type: 'text',
          value,
          placeholder: field.placeholder || '',
          inputMode: field.inputMode,
          spellCheck: false,
          disabled,
          onChange: (event) => onChange(event.target.value),
        }))
    }

    function SettingsPage({ form }) {
      const subscribe = React.useCallback((listener) => form.subscribe(listener), [form])
      const getSnapshot = React.useCallback(() => form.getSnapshot(), [form])
      const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
      const initial = React.useMemo(() => makeDraft(snapshot.value), [])
      const [baseline, setBaseline] = React.useState(initial)
      const [draft, setDraft] = React.useState(initial)
      const [token, setToken] = React.useState('')
      const [clearToken, setClearToken] = React.useState(false)
      const [saving, setSaving] = React.useState(false)
      const [message, setMessage] = React.useState({ tone: '', text: '' })
      const dirtyRef = React.useRef(false)

      const ops = React.useMemo(
        () => buildOps(baseline, draft, token, clearToken),
        [baseline, draft, token, clearToken],
      )
      const dirty = ops.length > 0
      dirtyRef.current = dirty

      React.useEffect(() => {
        if (snapshot.status !== 'ready' || !snapshot.value || dirtyRef.current) return
        const next = makeDraft(snapshot.value)
        setBaseline(next)
        setDraft(next)
      }, [snapshot.status, snapshot.revision])

      const update = (key, value) => {
        setDraft((current) => ({ ...current, [key]: value }))
        setMessage({ tone: '', text: '' })
      }

      const reset = () => {
        const latest = form.getSnapshot()
        const next = makeDraft(latest.value)
        setBaseline(next)
        setDraft(next)
        setToken('')
        setClearToken(false)
        setMessage({ tone: '', text: '' })
      }

      const save = async () => {
        const invalid = validateDraft(draft)
        if (invalid) {
          setMessage({ tone: 'bad', text: invalid })
          return
        }
        if (ops.length === 0) return
        setSaving(true)
        setMessage({ tone: '', text: '正在保存…' })
        try {
          const ok = await form.mutate(ops)
          if (!ok) {
            setMessage({ tone: 'bad', text: '保存失败，配置可能已被其他地方修改。请检查后重试。' })
            return
          }
          const latest = form.getSnapshot()
          if (latest.status === 'ready' && latest.value) {
            const next = makeDraft(latest.value)
            setBaseline(next)
            setDraft(next)
          } else {
            // A successful mutation may briefly precede the live snapshot update.
            // Keep the form immediately usable for another save in that window.
            const committed = { ...draft }
            setBaseline(committed)
            setDraft(committed)
          }
          setToken('')
          setClearToken(false)
          setMessage({ tone: 'good', text: '参数已保存，正在运行的连接和续话节奏会自动更新。' })
        } catch (error) {
          setMessage({
            tone: 'bad',
            text: `保存失败：${error && error.message ? error.message : String(error)}`,
          })
        } finally {
          setSaving(false)
        }
      }

      if (snapshot.status === 'loading') {
        return h('div', { className: 'pc-loading' }, '正在读取主动续话参数…')
      }
      if (snapshot.status === 'unavailable') {
        return h('div', { className: 'pc-boundary' }, '当前 DSH 没有提供这个插件的参数设置。')
      }

      const disabled = saving || snapshot.writable === false
      return h('div', { className: 'pc-root' },
        h('div', { className: 'pc-head' },
          h('div', { className: 'pc-titlebox' },
            h('h3', { className: 'pc-title' }, '更像人的聊天'),
            h('p', { className: 'pc-subtitle' }, '核心是主动续话：聊天热起来后顺着话题继续，没回应会自行收住，不等你每句催。')),
          h('div', { className: 'pc-actions' },
            h('button', {
              type: 'button',
              className: 'pc-button',
              disabled: disabled || !dirty,
              onClick: reset,
            }, '撤销修改'),
            h('button', {
              type: 'button',
              className: 'pc-button',
              'data-primary': '',
              disabled: disabled || !dirty,
              onClick: save,
            }, saving ? '保存中…' : '保存参数'))),
        message.text ? h('div', {
          className: 'pc-message',
          'data-tone': message.tone || undefined,
          role: 'status',
        }, message.text) : null,
        h('div', { className: 'pc-groups' },
          GROUPS.map((group) => h('section', { className: 'pc-group', key: group },
            h('h4', { className: 'pc-group-title' }, group),
            FIELDS.filter((field) => field.group === group).map((field) => {
              const secret = field.kind === 'secret'
              const value = secret ? token : draft[field.key]
              return h('div', { className: 'pc-row', key: field.key },
                h('div', { className: 'pc-labelbox' },
                  h('label', { className: 'pc-label', htmlFor: `pc-${field.key}` }, field.label),
                  h('p', { className: 'pc-hint' }, field.hint)),
                h('div', { className: 'pc-controlbox' },
                  h(Control, {
                    field,
                    value,
                    disabled,
                    onChange: secret
                      ? (next) => {
                          setToken(next)
                          if (next) setClearToken(false)
                          setMessage({ tone: '', text: '' })
                        }
                      : (next) => update(field.key, next),
                  }),
                  secret
                    ? h('label', { className: 'pc-inline-check' },
                        h('input', {
                          type: 'checkbox',
                          checked: clearToken,
                          disabled,
                          onChange: (event) => {
                            setClearToken(event.target.checked)
                            if (event.target.checked) setToken('')
                            setMessage({ tone: '', text: '' })
                          },
                        }),
                        '保存时清除已存 Token')
                    : null))
            })))))
    }

    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: '' }
      }

      static getDerivedStateFromError(error) {
        return { error: error && error.message ? error.message : String(error) }
      }

      render() {
        if (this.state.error) {
          return h('div', { className: 'pc-boundary' },
            h('strong', null, '设置页加载失败'),
            h('span', null, this.state.error),
            h('button', {
              type: 'button',
              className: 'pc-button',
              onClick: () => this.setState({ error: '' }),
            }, '重试'))
        }
        return this.props.children
      }
    }

    function PageBoundary(props) {
      return h(Boundary, null, h(SettingsPage, props))
    }

    return {
      name: PLUGIN_ID,
      inject: ['slots', 'configForms'],
      apply(ctx) {
        ctx.effect(() => {
          if (typeof document === 'undefined') return () => {}
          const tag = document.createElement('style')
          tag.dataset.plugin = PLUGIN_ID
          tag.dataset.pluginCss = `${PLUGIN_ID}/client.js`
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'dsh-proactive-chat: settings styles')

        ctx.effect(() => ctx.configForms.whileServed([NS], () => (
          ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: PLUGIN_ID,
            order: 34,
            label: '更像人的聊天',
            inject: () => ({ form: ctx.configForms.get(NS) }),
          }, PageBoundary))
        )), 'dsh-proactive-chat: settings section')
      },
      fields: FIELDS.map(({ key, kind }) => ({ key, kind })),
      test: { makeDraft, buildOps, validateDraft },
    }
  },
})
