# 更像人的聊天

一个独立、克制、只做 QQ 主人私聊主动聊天的 DSH 插件，项目显示名为“更像人的聊天”。

它不依赖其他插件，也不需要额外的人格或记忆系统。聊天节奏、冷却、每日限额和模型配置都由本插件独立完成，不包含群聊、语音、表情、工具权限和 ComfyUI 功能。

## 功能

- 直接连接 NapCat / OneBot 11
- 只处理设置里的 Owner QQ
- 主人发消息后正常回复
- 连续热聊时约 10 秒主动续一句
- 普通状态约 2 分钟续话，6 小时内没有互动才停止
- 一次一两句短句，不写标题、条目、总结或客服套话
- 连续没回复自动冷却
- 每日消息数和 Token 上限
- 夜间免打扰；已经聊热时会继续自然续话
- 使用 DSH 当前默认模型，也可单独指定 Provider / Model
- 在 DSH 设置的左侧导航「更像人的聊天」直接调整全部参数
- 模型不可用时使用本地短句兜底

## 安装

```powershell
dsh plugin --profile desktop add file:C:\path\to\dsh-proactive-chat
```

安装后确认 profile 的 `dsh.profile.bundles` 包含 `dsh-proactive-chat`，重启 DSH。

插件设置页需要填写：

- `ownerId`：主人 QQ
- `onebotUrl`：NapCat 的 WebSocket 地址，例如 `ws://127.0.0.1:3002`
- `onebotToken`：NapCat 鉴权 Token

设置页按“连接、聊天节奏、限额与冷却、免打扰、模型、聊天风格”分组。保存后配置会通过 DSH 的 live settings 直接应用；Token 留空时保持原值，不会被页面覆盖。

## 测试

```powershell
npm install
npm test
```

## 数据

- 状态：`$DSH_HOME/storages/dsh-proactive-chat/state.json`
- 状态只保存 Owner QQ 的哈希标签，不保存原始号码
- Token 只保存在本机 DSH 配置，不进入 Git 仓库

## License

MIT
