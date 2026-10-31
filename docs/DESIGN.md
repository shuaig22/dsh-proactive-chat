# 更像人的聊天设计

## 边界

插件只负责 DSH 中主人 QQ 私聊的聊天闭环：

1. 直接连接 NapCat / OneBot 11。
2. 只处理配置中的 Owner QQ。
3. 主人发消息时正常回复。
4. 热聊状态按短间隔主动续话。
5. 连续没有回应时降温，达到上限后冷却。
6. 受每日消息数、Token 数和夜间免打扰限制。

插件不内置人格、长期记忆、群聊、语音、表情、工具权限或 ComfyUI 能力。用户通过一个 UTF-8 文本或 Markdown 文件提供人物设定；文件路径保存在本机 DSH 配置中。

为了安全共存，插件会只读检查同一 OneBot 通道是否已有其他组件接管：同通道已有回复方时不再重复回复，已有主动陪聊时让出主动发送权。

## 数据流

```text
QQ -> NapCat -> OneBot WebSocket -> ProactiveChatEngine -> DSH LLM
                                      |                    |
                                      +-> local state <----+
                                      |
                                      +-> NapCat send_private_msg -> QQ
```

## 配置

`index.js` 导出 schemastery `Config`，每个字段都标记为 `volatile`。`client.js` 通过 `ctx.configForms` 读取和写入同一命名空间，并注册到 `settings.section`，所以在 DSH 设置左侧的“更像人的聊天”里直接显示参数表单。认证信息只保存在本机 DSH profile，不写入仓库。

人格由 `personaFile` 指向的本机文件提供。`lib/persona.js` 在每次生成前 stat 文件；修改时间、创建时间或大小变化时重新读取，未变化时复用缓存。`personaMaxChars` 默认 3000，截断只影响送入模型的人格文本，不改写原文件。技术性的短消息约束固定在 `lib/engine.js`，不作为可编辑人格字段。

## 状态

状态存放在 `$DSH_HOME/storages/dsh-proactive-chat/state.json`。只保存 Owner 的哈希标签，不保存原始 QQ 号。状态包括最近聊天、今日发送数、Token、连续未回应次数和冷却截止时间。

## 失败策略

- 未选择人格文件或从未成功读取：不调用模型、不发送续话，并记录提示。
- 人格文件曾成功读取、之后暂时不可读：沿用最后一次成功读取的内容并记录提示。
- 模型不可用：在人格已经有效读取时使用本地短句，不阻塞 QQ 联系。
- OneBot 断开：指数退避重连。
- 发送失败：本轮不记账，不假装已经发送。
- 达到预算：停止主动消息，等待下一天或主人新消息。

