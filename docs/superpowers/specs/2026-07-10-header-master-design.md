# Header Master 设计文档

- 日期：2026-07-10
- 状态：已确认，待实现

## 1. 概述

Header Master 是一个 Chrome 浏览器扩展，用于**全局修改 HTTP 请求头**（仅请求头，不含响应头）。它是 ModHeader 请求头功能的轻量替代品——后者因 Chrome 下线 Manifest V2 而失效。

### 范围（含）

- 全局生效的请求头规则，对所有网站起作用
- 两种操作：**覆盖（set）** 和 **删除（remove）**
- 总开关 + 单条启用/停用
- 规则持久化，输入即保存
- 弹窗式 UI

### 非目标（YAGNI，明确不做）

- 按域名 / URL 过滤
- 多 Profile 配置切换
- 响应头修改
- 追加（append）操作
- 导入 / 导出
- 动态值（时间戳、引用其他头等）

## 2. 背景：为什么用 Manifest V3 + DNR

老版 ModHeader 基于 `chrome.webRequest` 阻塞式 API，该 API 在 Manifest V3 下已被限制（仅企业策略强装的扩展可用）。MV2 全面下线后这类扩展失效。

新扩展必须基于 **Manifest V3 + `declarativeNetRequest`（DNR）**。DNR 由浏览器原生处理拦截与改写，高效且是 Chrome 官方推荐的替代方案。

## 3. 架构

### 3.1 文件结构

```
header-master/
├── manifest.json
├── src/
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js          # UI 交互 + 读写 storage，不直接碰 DNR
│   ├── background.js     # service worker：监听 storage.onChanged → 同步 DNR
│   └── lib/
│       ├── storage.js    # storage.local 读写封装
│       ├── dnr.js        # 纯函数：state → DNR 规则
│       └── constants.js
├── icons/                # 16 / 48 / 128
└── test/
    └── dnr.test.js       # 纯函数单元测试
```

### 3.2 数据流（单向，职责清晰）

```
popup.js  ──写──▶  chrome.storage.local  ──onChanged──▶  background.js  ──▶  DNR
   ▲                                                                          │
   └─────────────────读──────────────────────────────────────────────────────┘
```

- **popup.js** 只负责 UI 与读写 storage，**不直接调用 DNR**。
- **background.js**（service worker）监听 `chrome.storage.onChanged`，任何状态变化都重建 DNR 规则。storage 事件会自动唤醒被回收的 service worker，保证可靠。
- **单一权威源**：`chrome.storage.local`。总开关、规则、启用位全部存于此。

### 3.3 模块职责

| 模块 | 职责 | 依赖 |
|------|------|------|
| `popup.js` | 渲染列表、捕获输入、读写 storage | `storage.js` |
| `background.js` | 监听 storage 变化，同步 DNR | `storage.js`、`dnr.js` |
| `lib/dnr.js` | 纯函数 `stateToDnrRule(state)`，把状态转成 DNR 规则数组 | 无（纯函数） |
| `lib/storage.js` | `get()` / `set(state)` 封装，含默认值合并 | `chrome.storage` |

每个模块单一职责、可独立测试；`dnr.js` 无副作用，是自动化测试的核心。

## 4. 数据模型与 DNR 映射

### 4.1 storage.local 结构

```js
{
  enabled: true,              // 总开关
  rules: [
    { id: "r_1", header: "Authorization", op: "set",    value: "Bearer xxx", enabled: true },
    { id: "r_2", header: "Cookie",        op: "remove", value: "",           enabled: true }
  ]
}
```

字段说明：

- `enabled`：总开关。`false` 时所有规则停发，但规则数据保留。
- `rules[].id`：稳定的字符串唯一 ID（形如 `r_<n>`），用于 React-like 列表渲染与删除定位。
- `rules[].op`：`"set"` 或 `"remove"`。
- `rules[].value`：`op === "remove"` 时忽略，UI 置灰。
- `rules[].enabled`：单条启停，`false` 时该条不进 DNR 但保留数据。

### 4.2 DNR 映射（合并成一条规则）

所有"当前生效"的规则合并进**一条** DNR 动态规则（固定 `id: 1`），而非每条 header 一条。ID 管理极简，更新即整条替换。

```js
{
  id: 1,
  priority: 1,
  action: {
    type: "modifyHeaders",
    requestHeaders: [
      { header: "Authorization", operation: "set",    value: "Bearer xxx" },
      { header: "Cookie",        operation: "remove" }
    ]
  },
  condition: { urlFilter: "*" }      // 全局生效
}
```

转换规则：

- 总开关关，或没有任何生效规则 → 返回空数组（删除该规则）。
- 否则 → 返回单元素数组，包含所有 `enabled && rules[].enabled` 的规则。
- `op: "set"` → DNR `operation: "set"`（存在则覆盖、不存在则添加，正好是"覆盖"语义）。
- `op: "remove"` → DNR `operation: "remove"`（删除该头的所有实例）。
- `op: "remove"` 时 `value` 字段省略。

### 4.3 DNR 同步流程（background.js）

```
onChanged 触发
  → 读取最新 state
  → const rules = stateToDnrRule(state)        // 纯函数
  → await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1],
        addRules: rules
      })
  → catch 错误 → 写 badge / 状态错误（不吞异常）
```

固定 `id: 1`，每次先移除再添加，幂等。

## 5. UI/UX

弹窗约 380px 宽、最大 500px 高，初版采用浅色主题。

```
┌─────────────────────────────────────────┐
│  Header Master                    [ ●  ] │  ← 总开关
│  3 条生效中                              │  ← 状态行（出错变红）
├─────────────────────────────────────────┤
│ [✓] Authorization  [Set ▾]  Bearer xxx [✕]│
│ [✓] Cookie         [Remove]  (禁用)    [✕]│  ← op=Remove 时 value 置灰
│ [ ] X-Debug-Flag   [Set ▾]  true       [✕]│  ← 取消勾选 = 停用不删
├─────────────────────────────────────────┤
│         ＋ 添加请求头                     │
└─────────────────────────────────────────┘
```

交互：

- 每行：启用勾选框 / 头名称输入 / Set·Remove 选择器 / 值输入（Remove 时置灰）/ 删除按钮。
- 总开关：关 = 暂停全部，规则保留。
- 单条勾选：停用单条而不删除。
- **输入即存**：debounce ~300ms 写 storage → SW 自动同步 DNR。
- 校验：仅校验头名称非空；其余不强制（开发工具，少设门槛）。
- 状态行：显示生效条数；DNR 写入失败时变红显示错误信息。

## 6. 权限与 manifest

```json
{
  "manifest_version": 3,
  "name": "Header Master",
  "version": "0.1.0",
  "description": "全局修改 HTTP 请求头（覆盖 / 删除）",
  "permissions": ["declarativeNetRequest", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "src/background.js", "type": "module" },
  "action": { "default_popup": "src/popup.html" },
  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" }
}
```

权限说明：

- `declarativeNetRequest`：调用 DNR API 改写请求头。
- `storage`：持久化规则。
- `host_permissions: ["<all_urls>"]`：DNR 的 `modifyHeaders` 要求对匹配的 URL 拥有主机权限；全局生效需所有站点权限。

⚠️ 安装时 Chrome 会提示"可读取和更改您在所有网站上的数据"——这是全局请求头工具无法避免的，与 ModHeader 一致。

## 7. 错误处理（fail fast，禁止吞异常）

- `updateDynamicRules` 的 Promise 必须 `await` + `catch`；失败时设置扩展 badge 为错误色，并把错误信息透传到 popup 状态行。
- `storage.js` 的读写全部 try/catch 并上抛，不在 SW 内静默吞掉。
- DNR 校验类错误（如非法 header 名被 Chrome 拒绝）→ 错误信息透传到 UI。
- SW 内异常写入 console，便于排查。

## 8. 测试策略

### 8.1 单元测试（自动化核心）

`lib/dnr.js` 的 `stateToDnrRule(state)` 是纯函数，用 vitest 覆盖：

- 总开关关 → 返回 `[]`
- 全部单条停用 → 返回 `[]`
- 单条 set 生效 → 正确映射 `operation: "set"` + `value`
- 单条 remove 生效 → 正确映射 `operation: "remove"`，无 `value`
- set + remove 混合 → 合并进同一条规则的 `requestHeaders`
- remove 规则的 `value` 被忽略
- 多条 enabled 部分停用 → 仅启用项进入

### 8.2 手动验收清单

1. `chrome://extensions` 开发者模式 → 加载未打包扩展。
2. 添加一条 `Authorization: Bearer test`（set）。
3. 访问 `https://httpbin.org/headers`，确认响应中 `headers` 含该头。
4. 添加一条 `Cookie`（remove），确认请求中该头被删除（用 DevTools Network 面板）。
5. 关闭总开关，确认头不再被改写。
6. 取消单条勾选，确认单条停用。
7. 关闭重开浏览器，确认规则持久化。

## 9. 关键技术假设（实现时需对照最新 DNR 文档确认）

- `urlFilter: "*"` 匹配所有 URL（实现时验证，必要时改 `regexFilter: ".*"`）。
- 单条 DNR 规则的 `requestHeaders` 可包含多个操作（实现时验证无数量上限问题）。
- `chrome.storage.onChanged` 会唤醒已休眠的 service worker（MV3 标准行为）。
- 动态规则固定 `id: 1`，`removeRuleIds` + `addRules` 幂等替换。
