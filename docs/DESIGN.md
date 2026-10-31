# 更像人的聊天设计

## 边界

插件只负责 DSH 中主人 QQ 私聊的聊天闭环：

1. 直接连接 NapCat / OneBot 11。
2. 只处理配置中的 Owner QQ。
3. 主人发消息时正常回复。
4. 热聊状态按短间隔主动续话。
5. 连续没有回应时降温，达到上限后冷却。
6. 受每日消息数、Token 数和夜间免打扰限制。

插件不依赖 `dsh-identity`，不提供人格、长期记忆、群聊、语音、表情、工具权限或 ComfyUI 能力。为了安全共存，它会只读检查 `dsh-identity` 的 OneBot 配置：同一通道由身份插件接管时不再重复回复；身份插件的主动陪聊开启时，本插件让出主动发送权。

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

## 状态

状态存放在 `$DSH_HOME/storages/dsh-proactive-chat/state.json`。只保存 Owner 的哈希标签，不保存原始 QQ 号。状态包括最近聊天、今日发送数、Token、连续未回应次数和冷却截止时间。

## 失败策略

- 模型不可用：使用本地短句，不阻塞 QQ 联系。
- OneBot 断开：指数退避重连。
- 发送失败：本轮不记账，不假装已经发送。
- 达到预算：停止主动消息，等待下一天或主人新消息。

