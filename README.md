<div align="center">

# Header Master

**轻量级 Chrome 扩展：全局修改 HTTP 请求头（覆盖 / 删除）**

*A lightweight, Manifest V3-native Chrome extension to modify HTTP request headers — a focused, open alternative to ModHeader.*

[License: MIT](./LICENSE) · Chrome MV3 · `declarativeNetRequest`

</div>

---

## ✨ 功能

- **全局修改请求头**：`Set`（覆盖 / 新增）与 `Remove`（删除）两种操作
- **多 Profile**：浏览器标签页风格切换——点 tab 切换、`＋` 新建、`×` 删除、双击改名
- **单条启停 + 总开关**：每条规则可单独勾选，右上角总开关一键暂停全部
- **输入即存**：~300ms 防抖自动保存，刷新 / 重启浏览器后规则仍在
- **MV3 原生**：基于 `declarativeNetRequest`，不依赖已被 Chrome 限制的 MV2 `webRequest`

## 🤔 为什么做这个

ModHeader 的请求头功能依赖阻塞式 `chrome.webRequest` API，该 API 在 Manifest V3 下已被 Chrome 限制，旧扩展随之失效。Header Master 是一个**极简、MV3 原生**的替代，只专注做请求头修改这一件事。

## 📦 安装

### 从源码加载（开发者）
1. 打开 `chrome://extensions`
2. 开启右上角「开发者模式」
3. 「加载已解压的扩展程序」→ 选择本仓库目录

### Chrome Web Store
（暂未上架，目前请从源码加载）

## 🚀 使用

```
┌─────────────────────────────────────┐
│ Header Master              [ ●  ]   │  总开关
│ ╭──────╮ ╭───────╮ ╭─╮              │
│ │默认● │ │开发  ✕│ │+│  ← 点 tab 切换│
│ ╰──────╯ ╰───────╯ ╰─╯              │
│ 3 条生效中                          │
├─────────────────────────────────────┤
│ [✓] Authorization [Set] Bearer [✕]  │
│ [✓] Cookie        [Remove]      [✕] │
├─────────────────────────────────────┤
│           ＋ 添加请求头              │
└─────────────────────────────────────┘
```

- 点 tab 切换 Profile（同一时间只有当前 Profile 生效）
- `＋` 新建 Profile、tab 上 `×` 删除（仅剩 1 个时隐藏）、双击 tab 名重命名
-「＋ 添加请求头」新增规则：填 Header 名、选 Set / Remove、填值
- 验证生效：访问 `https://httpbin.org/headers`，或用 DevTools → Network 查看请求头

## 🔧 工作原理

- `chrome.storage.local` 是**唯一权威源**（总开关 + 多 Profile + 规则）
- service worker 监听 `storage.onChanged`，把当前 Profile 的生效规则合并成**一条** DNR 动态规则
- popup 只读写 storage，不直接碰 DNR；存储 → DNR 单向同步

```
popup ──写──▶ chrome.storage.local ──onChanged──▶ service worker ──▶ declarativeNetRequest
```

## 🔒 权限与隐私

| 权限 | 用途 |
|------|------|
| `declarativeNetRequest` | 调用 DNR API 改写请求头 |
| `storage` | 本地持久化规则 |
| `*://*/*` | DNR 的 `modifyHeaders` 需要对目标 URL 拥有主机权限；全局生效需覆盖所有站点 |

- **所有数据都存在你本地浏览器**（`chrome.storage.local`），扩展不发起任何远程请求，无任何埋点 / 遥测。
- 安装时 Chrome 会提示「读取和更改所有网站数据」——这是全局改请求头工具无法避免的，与 ModHeader 一致。

## 🛠️ 开发

```bash
npm install
npm test        # 纯函数单元测试（dnr / storage / constants）
```

核心逻辑（`stateToDnrRules`、`mergeDefaults`）为纯函数并配单元测试；UI 层手动验收。无构建步骤，源码即 ES Modules。

## 🤝 贡献

欢迎提 Issue / PR。提交前请确保 `npm test` 通过。

## 📄 许可证

[MIT](./LICENSE) © Ethanzhu
