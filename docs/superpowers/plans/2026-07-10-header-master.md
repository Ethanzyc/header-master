# Header Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Chrome MV3 扩展，全局修改 HTTP 请求头（覆盖 / 删除），作为被禁用的 ModHeader 的请求头功能替代品。

**Architecture:** Manifest V3 + `declarativeNetRequest`（DNR）。`chrome.storage.local` 为单一权威源（保存总开关与规则），service worker 监听 `storage.onChanged` 并把"当前生效"的规则合并成**一条** DNR 动态规则（固定 id=1）。popup 只读写 storage，不碰 DNR。所有"当前生效"规则合并进一条规则的 `requestHeaders` 数组，`condition` 省略 `urlFilter`（匹配所有 URL）但显式列出全部 `resourceTypes`。

**Tech Stack:** Chrome Extension Manifest V3、原生 ES Modules（无构建步骤）、vitest（纯函数单元测试）。无框架，popup 用原生 DOM。

## Global Constraints

- **Manifest V3**（Chrome 强制）；service worker 用 `"type": "module"`。
- **无构建步骤**：所有源码是浏览器/Node 可直接加载的 ES Module。
- **代码用英文，UI 文案与注释用中文**（遵循用户全局规范）。
- **fail fast，禁止吞异常**：所有 `chrome.*` Promise 必须 `await` + `catch`，错误透传到 popup 状态行与 badge。
- **禁止硬编码配置**：storage key、规则 ID、resourceTypes 列表、默认状态全部集中在 `src/lib/constants.js`。
- **DRY / YAGNI**：不做响应头、按域名过滤、多 Profile、append、导入导出。
- **TDD**：纯函数（`dnr.js` 的 `stateToDnrRules`、`storage.js` 的 `mergeDefaults`、`constants.js`）先写测试再实现；Chrome 集成层（`background.js`、`popup.*`）用手动验收。

---

## File Structure

| 文件 | 职责 | 测试方式 |
|------|------|----------|
| `package.json` / `vitest.config.js` | 依赖与测试配置 | `npm test` 可运行 |
| `.gitignore` | 忽略 `node_modules/` | — |
| `src/lib/constants.js` | 常量：storage key、规则 ID、resourceTypes、默认状态 | 单元测试 |
| `src/lib/dnr.js` | 纯函数 `stateToDnrRules(state)`：状态 → DNR 规则数组 | 单元测试（核心） |
| `src/lib/storage.js` | `get/set/mergeDefaults`：storage.local 读写 + 默认值合并 | 单元测试 mergeDefaults |
| `src/background.js` | service worker：`storage.onChanged` → `updateDynamicRules` 同步 | 手动验收 |
| `src/popup.html` / `popup.css` | 弹窗结构 + 浅色样式 | 手动验收 |
| `src/popup.js` | UI 交互 + 读写 storage（debounce 自动保存） | 手动验收 |
| `manifest.json` | MV3 配置、权限声明 | 加载未打包扩展 |
| `test/constants.test.js` | 常量与工具链冒烟 | vitest |
| `test/dnr.test.js` | `stateToDnrRules` 全用例 | vitest |
| `test/storage.test.js` | `mergeDefaults` 全用例 | vitest |

---

## Task 1: 项目脚手架与常量

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `.gitignore`
- Create: `src/lib/constants.js`
- Test: `test/constants.test.js`

**Interfaces:**
- Produces: `STORAGE_KEY`、`ERROR_KEY`、`MASTER_RULE_ID`、`ALL_RESOURCE_TYPES`、`DEFAULT_STATE`（后续任务从 `./constants.js` 导入）。

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "header-master",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "全局修改 HTTP 请求头的 Chrome MV3 扩展",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: 创建 `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
  },
});
```

- [ ] **Step 3: 创建 `.gitignore`**

```
node_modules/
```

- [ ] **Step 4: 先写失败测试 `test/constants.test.js`**

```js
import { describe, it, expect } from 'vitest';
import {
  STORAGE_KEY,
  ERROR_KEY,
  MASTER_RULE_ID,
  ALL_RESOURCE_TYPES,
  DEFAULT_STATE,
} from '../src/lib/constants.js';

describe('constants', () => {
  it('STORAGE_KEY 是非空字符串', () => {
    expect(typeof STORAGE_KEY).toBe('string');
    expect(STORAGE_KEY.length).toBeGreaterThan(0);
  });

  it('ERROR_KEY 是非空字符串且与 STORAGE_KEY 不同', () => {
    expect(typeof ERROR_KEY).toBe('string');
    expect(ERROR_KEY.length).toBeGreaterThan(0);
    expect(ERROR_KEY).not.toBe(STORAGE_KEY);
  });

  it('MASTER_RULE_ID 是正整数', () => {
    expect(Number.isInteger(MASTER_RULE_ID)).toBe(true);
    expect(MASTER_RULE_ID).toBeGreaterThanOrEqual(1);
  });

  it('ALL_RESOURCE_TYPES 含全部类型且包含 main_frame', () => {
    expect(ALL_RESOURCE_TYPES).toContain('main_frame');
    expect(ALL_RESOURCE_TYPES).toContain('xmlhttprequest');
    expect(ALL_RESOURCE_TYPES).toContain('other');
    expect(ALL_RESOURCE_TYPES.length).toBeGreaterThanOrEqual(10);
  });

  it('DEFAULT_STATE 默认总开关开、规则为空', () => {
    expect(DEFAULT_STATE).toEqual({ enabled: true, rules: [] });
  });
});
```

- [ ] **Step 5: 运行测试，确认失败（模块不存在）**

Run: `npm install && npm test`
Expected: FAIL，报 `Cannot find module '../src/lib/constants.js'`

- [ ] **Step 6: 实现 `src/lib/constants.js`**

```js
// storage.local 中保存状态的键
export const STORAGE_KEY = 'hm_state';
// storage.local 中保存最近一次同步错误信息的键
export const ERROR_KEY = 'hm_error';
// 合并后唯一一条 DNR 动态规则的固定 id
export const MASTER_RULE_ID = 1;

// 全部 ResourceType 枚举值。DNR 中省略 resourceTypes 默认排除 main_frame，
// 改请求头工具必须显式列出全部类型，确保主框架导航请求也生效。
export const ALL_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
];

// 首次使用 / storage 为空时的默认状态
export const DEFAULT_STATE = { enabled: true, rules: [] };
```

- [ ] **Step 7: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，5 个用例全绿。

- [ ] **Step 8: 提交**

```bash
git add package.json vitest.config.js .gitignore src/lib/constants.js test/constants.test.js
git commit -m "chore: 初始化脚手架与常量模块"
```

---

## Task 2: 纯函数 stateToDnrRules（核心逻辑，TDD）

**Files:**
- Create: `src/lib/dnr.js`
- Test: `test/dnr.test.js`

**Interfaces:**
- Consumes: `MASTER_RULE_ID`、`ALL_RESOURCE_TYPES`（from Task 1）
- Produces: `stateToDnrRules(state) -> Rule[]`，被 `background.js`（Task 4）消费。
  - 入参 `state = { enabled: boolean, rules: Array<{ id, header, op: 'set'|'remove', value, enabled }> }`
  - 返回：生效规则合并成的单元素 DNR 规则数组；无生效规则时返回 `[]`。

- [ ] **Step 1: 先写失败测试 `test/dnr.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { stateToDnrRules } from '../src/lib/dnr.js';
import { MASTER_RULE_ID, ALL_RESOURCE_TYPES } from '../src/lib/constants.js';

describe('stateToDnrRules', () => {
  it('总开关关时返回空数组', () => {
    const state = {
      enabled: false,
      rules: [{ id: 'r1', header: 'X', op: 'set', value: '1', enabled: true }],
    };
    expect(stateToDnrRules(state)).toEqual([]);
  });

  it('无任何规则启用时返回空数组', () => {
    const state = {
      enabled: true,
      rules: [{ id: 'r1', header: 'X', op: 'set', value: '1', enabled: false }],
    };
    expect(stateToDnrRules(state)).toEqual([]);
  });

  it('规则列表为空时返回空数组', () => {
    expect(stateToDnrRules({ enabled: true, rules: [] })).toEqual([]);
  });

  it('单条 set 规则映射正确', () => {
    const state = {
      enabled: true,
      rules: [{ id: 'r1', header: 'Authorization', op: 'set', value: 'Bearer x', enabled: true }],
    };
    expect(stateToDnrRules(state)).toEqual([
      {
        id: MASTER_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'Authorization', operation: 'set', value: 'Bearer x' }],
        },
        condition: { resourceTypes: ALL_RESOURCE_TYPES },
      },
    ]);
  });

  it('remove 规则不带 value 字段', () => {
    const state = {
      enabled: true,
      rules: [{ id: 'r1', header: 'Cookie', op: 'remove', value: '应被忽略', enabled: true }],
    };
    const rules = stateToDnrRules(state);
    expect(rules[0].action.requestHeaders).toEqual([
      { header: 'Cookie', operation: 'remove' },
    ]);
  });

  it('多条生效规则合并进同一条 DNR 规则', () => {
    const state = {
      enabled: true,
      rules: [
        { id: 'r1', header: 'A', op: 'set', value: '1', enabled: true },
        { id: 'r2', header: 'B', op: 'remove', value: '', enabled: true },
        { id: 'r3', header: 'C', op: 'set', value: '2', enabled: false },
      ],
    };
    const rules = stateToDnrRules(state);
    expect(rules).toHaveLength(1);
    expect(rules[0].action.requestHeaders).toHaveLength(2);
    expect(rules[0].action.requestHeaders).toEqual([
      { header: 'A', operation: 'set', value: '1' },
      { header: 'B', operation: 'remove' },
    ]);
  });

  it('跳过头名称为空的规则', () => {
    const state = {
      enabled: true,
      rules: [
        { id: 'r1', header: '   ', op: 'set', value: '1', enabled: true },
        { id: 'r2', header: 'X', op: 'set', value: '2', enabled: true },
      ],
    };
    const rules = stateToDnrRules(state);
    expect(rules[0].action.requestHeaders).toEqual([
      { header: 'X', operation: 'set', value: '2' },
    ]);
  });

  it('set 规则缺省 value 时补空字符串', () => {
    const state = {
      enabled: true,
      rules: [{ id: 'r1', header: 'X', op: 'set', enabled: true }],
    };
    const rules = stateToDnrRules(state);
    expect(rules[0].action.requestHeaders).toEqual([
      { header: 'X', operation: 'set', value: '' },
    ]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，`stateToDnrRules is not a function` 或模块找不到。

- [ ] **Step 3: 实现 `src/lib/dnr.js`**

```js
import { MASTER_RULE_ID, ALL_RESOURCE_TYPES } from './constants.js';

// 把应用状态转换成 DNR 动态规则数组。
// 所有"生效"规则合并进同一条规则（固定 id），无生效规则时返回空数组。
// @param {{ enabled: boolean, rules: Array }} state
// @returns {Array} DNR Rule[]
export function stateToDnrRules(state) {
  if (!state || !state.enabled) return [];

  const active = (state.rules || [])
    .filter((r) => r && r.enabled && typeof r.header === 'string' && r.header.trim() !== '')
    .map(toHeaderInfo);

  if (active.length === 0) return [];

  return [
    {
      id: MASTER_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: active,
      },
      condition: { resourceTypes: ALL_RESOURCE_TYPES },
    },
  ];
}

function toHeaderInfo(rule) {
  if (rule.op === 'remove') {
    // remove 不允许带 value
    return { header: rule.header, operation: 'remove' };
  }
  // set 必须带 value（缺省补空字符串以满足 DNR 要求）
  return { header: rule.header, operation: 'set', value: rule.value ?? '' };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，dnr + constants 全部用例通过。

- [ ] **Step 5: 提交**

```bash
git add src/lib/dnr.js test/dnr.test.js
git commit -m "feat(dnr): 实现 stateToDnrRules 状态转 DNR 规则"
```

---

## Task 3: storage 读写与默认值合并（TDD）

**Files:**
- Create: `src/lib/storage.js`
- Test: `test/storage.test.js`

**Interfaces:**
- Consumes: `STORAGE_KEY`、`DEFAULT_STATE`（from Task 1）
- Produces:
  - `mergeDefaults(stored) -> state`（纯函数，可测）
  - `get() -> Promise<state>`（读 storage.local + mergeDefaults，被 popup/background 消费）
  - `set(state) -> Promise<void>`（写 storage.local，被 popup 消费）

- [ ] **Step 1: 先写失败测试 `test/storage.test.js`（只测纯函数 mergeDefaults）**

```js
import { describe, it, expect } from 'vitest';
import { mergeDefaults } from '../src/lib/storage.js';
import { DEFAULT_STATE } from '../src/lib/constants.js';

describe('mergeDefaults', () => {
  it('null/undefined 返回默认状态', () => {
    expect(mergeDefaults(undefined)).toEqual(DEFAULT_STATE);
    expect(mergeDefaults(null)).toEqual(DEFAULT_STATE);
  });

  it('非对象返回默认状态', () => {
    expect(mergeDefaults('garbage')).toEqual(DEFAULT_STATE);
    expect(mergeDefaults(42)).toEqual(DEFAULT_STATE);
  });

  it('保留合法的 enabled 与 rules', () => {
    const s = {
      enabled: false,
      rules: [{ id: 'r1', header: 'X', op: 'set', value: '1', enabled: true }],
    };
    expect(mergeDefaults(s)).toEqual(s);
  });

  it('enabled 缺失或类型错时默认 true', () => {
    expect(mergeDefaults({ rules: [] }).enabled).toBe(true);
    expect(mergeDefaults({ enabled: 'yes', rules: [] }).enabled).toBe(true);
  });

  it('rules 缺失或类型错时默认空数组', () => {
    expect(mergeDefaults({ enabled: true }).rules).toEqual([]);
    expect(mergeDefaults({ enabled: true, rules: 'nope' }).rules).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`
Expected: FAIL，模块找不到。

- [ ] **Step 3: 实现 `src/lib/storage.js`**

```js
import { STORAGE_KEY, DEFAULT_STATE } from './constants.js';

// 把 storage 中读出的原始值合并为合法状态（纯函数，便于单测）。
export function mergeDefaults(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return { enabled: DEFAULT_STATE.enabled, rules: [] };
  }
  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULT_STATE.enabled,
    rules: Array.isArray(stored.rules) ? stored.rules : [],
  };
}

// 读取并合并状态。失败时上抛（fail fast），由调用方处理。
export async function get() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return mergeDefaults(data[STORAGE_KEY]);
}

// 写入完整状态。失败时上抛。
export async function set(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: PASS，storage + dnr + constants 全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/lib/storage.js test/storage.test.js
git commit -m "feat(storage): 实现 get/set 与默认值合并"
```

---

## Task 4: background service worker —— DNR 同步

**Files:**
- Create: `src/background.js`

**Interfaces:**
- Consumes: `get`（from Task 3）、`stateToDnrRules`（from Task 2）、`MASTER_RULE_ID`、`STORAGE_KEY`、`ERROR_KEY`（from Task 1）
- Produces: 一个注册了 `storage.onChanged` / `runtime.onInstalled` / `runtime.onStartup` 监听的 service worker，自动把状态同步成 DNR 动态规则；同步成功清错误，失败写 `ERROR_KEY` 并设 badge `!`。

**说明：** 这一层是 Chrome 集成，无单元测试，靠 Task 8 手动验收。

- [ ] **Step 1: 实现 `src/background.js`**

```js
import { get } from './lib/storage.js';
import { stateToDnrRules } from './lib/dnr.js';
import { MASTER_RULE_ID, STORAGE_KEY, ERROR_KEY } from './lib/constants.js';

const DNR = chrome.declarativeNetRequest;

// 把最新状态同步成 DNR 动态规则。fail fast：失败写 ERROR_KEY + badge，不吞异常。
async function sync() {
  try {
    const state = await get();
    const rules = stateToDnrRules(state);
    await DNR.updateDynamicRules({
      removeRuleIds: [MASTER_RULE_ID],
      addRules: rules,
    });
    await chrome.storage.local.set({ [ERROR_KEY]: null });
    await chrome.action.setBadgeText({ text: '' });
  } catch (err) {
    console.error('[Header Master] DNR 同步失败：', err);
    await chrome.storage.local.set({ [ERROR_KEY]: String(err && err.message ? err.message : err) });
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
  }
}

// 只在应用状态键变化时同步（避免 ERROR_KEY 自身写入触发循环）。
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
    sync();
  }
});

// 安装 / 浏览器启动时做一次初始同步，确保规则与存储一致。
chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);
```

- [ ] **Step 2: 静态自检（确认模块语法正确）**

Run: `node --check src/background.js`
Expected: 无输出（语法正确）。注意：`chrome.*` 在 Node 下不存在，`--check` 只做语法解析不执行，所以不会报引用错误。

- [ ] **Step 3: 提交**

```bash
git add src/background.js
git commit -m "feat(background): 实现 storage.onChanged → DNR 同步"
```

---

## Task 5: manifest 与扩展可加载骨架

**Files:**
- Create: `manifest.json`

**Interfaces:**
- Produces: 一个可被 `chrome://extensions` 加载的 MV3 扩展骨架（此时 popup 文件尚未实现，加载后点击图标会报 popup 缺失，属正常；Task 6/7 补齐）。

- [ ] **Step 1: 创建 `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Header Master",
  "version": "0.1.0",
  "description": "全局修改 HTTP 请求头（覆盖 / 删除）",
  "permissions": ["declarativeNetRequest", "storage"],
  "host_permissions": ["*://*/*"],
  "background": {
    "service_worker": "src/background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "src/popup.html",
    "default_title": "Header Master"
  }
}
```

> 说明：暂不引入 `icons`，未打包开发阶段 Chrome 用默认拼图图标，避免在计划里依赖二进制资源。如需图标，后续可单独添加 16/48/128 PNG 并补 `"icons"`、`"action.default_icon"`。

- [ ] **Step 2: 校验 JSON 合法**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest OK')"`
Expected: 输出 `manifest OK`

- [ ] **Step 3: 提交**

```bash
git add manifest.json
git commit -m "feat(manifest): MV3 配置与权限声明"
```

---

## Task 6: popup 结构与样式

**Files:**
- Create: `src/popup.html`
- Create: `src/popup.css`

**Interfaces:**
- Produces: 弹窗 DOM 结构（总开关、状态行、规则列表容器、添加按钮、行模板）与浅色样式。`popup.js`（Task 7）按这些 id/class 挂接。

关键 id/class 契约（Task 7 依赖）：
- `#master`（总开关 checkbox）、`#status`（状态行）、`#rules`（规则 `<ul>`）、`#add`（添加按钮）
- 模板 `#row-template` 内：`.rule`（li，运行时设 `dataset.id`）、`.rule-enabled`、`.rule-header`、`.rule-op`、`.rule-value`、`.rule-delete`

- [ ] **Step 1: 创建 `src/popup.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="popup.css" />
  <title>Header Master</title>
</head>
<body>
  <header class="topbar">
    <span class="title">Header Master</span>
    <label class="switch" title="总开关">
      <input type="checkbox" id="master" />
      <span class="slider"></span>
    </label>
  </header>

  <div id="status" class="status">读取中…</div>

  <ul id="rules" class="rules"></ul>

  <button id="add" class="add" type="button">＋ 添加请求头</button>

  <template id="row-template">
    <li class="rule">
      <input type="checkbox" class="rule-enabled" title="启用/停用此条" />
      <input type="text" class="rule-header" placeholder="Header-Name" spellcheck="false" />
      <select class="rule-op">
        <option value="set">Set</option>
        <option value="remove">Remove</option>
      </select>
      <input type="text" class="rule-value" placeholder="value" spellcheck="false" />
      <button class="rule-delete" type="button" title="删除">✕</button>
    </li>
  </template>

  <script type="module" src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 `src/popup.css`**

```css
:root {
  --bg: #ffffff;
  --fg: #202124;
  --muted: #5f6368;
  --border: #dadce0;
  --accent: #1a73e8;
  --error: #d93025;
  --row-bg: #f8f9fa;
  width: 380px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.title { font-weight: 600; font-size: 14px; }

/* iOS 风格开关 */
.switch { position: relative; display: inline-block; width: 40px; height: 22px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute; inset: 0; cursor: pointer;
  background: #bdbdbd; border-radius: 22px; transition: background .2s;
}
.slider::before {
  content: ""; position: absolute; height: 16px; width: 16px;
  left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: transform .2s;
}
.switch input:checked + .slider { background: var(--accent); }
.switch input:checked + .slider::before { transform: translateX(18px); }

.status {
  padding: 6px 14px;
  color: var(--muted);
  font-size: 12px;
}
.status.error { color: var(--error); }

.rules {
  list-style: none;
  margin: 0; padding: 4px 8px;
  max-height: 360px;
  overflow-y: auto;
}

.rule {
  display: grid;
  grid-template-columns: auto 1fr auto 1.4fr auto;
  gap: 6px;
  align-items: center;
  padding: 6px;
  border-radius: 6px;
}
.rule + .rule { margin-top: 2px; }
.rule:hover { background: var(--row-bg); }

.rule input[type="text"],
.rule select {
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
  background: #fff;
  color: var(--fg);
  min-width: 0;
}
.rule input[type="text"].disabled,
.rule input[type="text"]:disabled {
  background: #f1f3f4;
  color: #9aa0a6;
}
.rule-delete {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
}
.rule-delete:hover { color: var(--error); }

.add {
  display: block;
  width: calc(100% - 24px);
  margin: 8px 12px 14px;
  padding: 8px;
  border: 1px dashed var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 13px;
}
.add:hover { background: #f1f6fe; }
```

- [ ] **Step 3: 提交**

```bash
git add src/popup.html src/popup.css
git commit -m "feat(popup): 弹窗结构与浅色样式"
```

---

## Task 7: popup 交互逻辑（自动保存）

**Files:**
- Create: `src/popup.js`

**Interfaces:**
- Consumes: `get`、`set`（from Task 3）、`ERROR_KEY`（from Task 1）、Task 6 的 DOM 契约。
- Produces: 打开即渲染状态；输入即 debounce(300ms) 保存到 storage（→ background 自动同步 DNR）；支持总开关、单条启停、增删、Set/Remove 切换、错误展示。

**说明：** Chrome 集成层，无单元测试，靠 Task 8 验收。设计取舍：popup 只在打开时渲染一次、不订阅 `storage.onChanged`，避免后台同步触发的重渲染覆盖用户正在输入的内容。

- [ ] **Step 1: 实现 `src/popup.js`**

```js
import { get, set } from './lib/storage.js';
import { ERROR_KEY } from './lib/constants.js';

const $ = (sel) => document.querySelector(sel);

const masterEl = $('#master');
const statusEl = $('#status');
const ul = $('#rules');
const addBtn = $('#add');
const rowTpl = $('#row-template');

let state = { enabled: true, rules: [] };
let saveTimer = null;

// 生成稳定唯一 id（popup 上下文可用 Date/random）
function uid() {
  return 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function init() {
  state = await get();
  masterEl.checked = !!state.enabled;
  render();
  const data = await chrome.storage.local.get(ERROR_KEY);
  renderStatus(data[ERROR_KEY] || null);
}

function render() {
  ul.innerHTML = '';
  for (const rule of state.rules) {
    ul.appendChild(buildRow(rule));
  }
}

function buildRow(rule) {
  const frag = rowTpl.content.cloneNode(true);
  const li = frag.querySelector('.rule');
  li.dataset.id = rule.id;

  const enabledEl = li.querySelector('.rule-enabled');
  const headerEl = li.querySelector('.rule-header');
  const opEl = li.querySelector('.rule-op');
  const valueEl = li.querySelector('.rule-value');

  enabledEl.checked = !!rule.enabled;
  headerEl.value = rule.header || '';
  opEl.value = rule.op || 'set';
  valueEl.value = rule.value || '';
  toggleValue(opEl, valueEl);

  enabledEl.addEventListener('change', onRowChange);
  headerEl.addEventListener('input', onRowChange);
  opEl.addEventListener('change', onRowChange);
  valueEl.addEventListener('input', onRowChange);
  li.querySelector('.rule-delete').addEventListener('click', onDelete);

  return frag;
}

function toggleValue(opEl, valueEl) {
  valueEl.disabled = opEl.value === 'remove';
  valueEl.classList.toggle('disabled', valueEl.disabled);
}

function onRowChange(e) {
  const li = e.target.closest('.rule');
  const rid = li.dataset.id;
  const rule = state.rules.find((r) => r.id === rid);
  if (!rule) return;

  const enabledEl = li.querySelector('.rule-enabled');
  const headerEl = li.querySelector('.rule-header');
  const opEl = li.querySelector('.rule-op');
  const valueEl = li.querySelector('.rule-value');

  rule.enabled = enabledEl.checked;
  rule.header = headerEl.value.trim();
  rule.op = opEl.value;
  rule.value = valueEl.value;
  toggleValue(opEl, valueEl);
  scheduleSave();
}

function onDelete(e) {
  const li = e.target.closest('.rule');
  const rid = li.dataset.id;
  state.rules = state.rules.filter((r) => r.id !== rid);
  render();
  scheduleSave();
}

addBtn.addEventListener('click', () => {
  state.rules.push({ id: uid(), header: '', op: 'set', value: '', enabled: true });
  render();
  const last = ul.lastElementChild;
  if (last) last.querySelector('.rule-header').focus();
  scheduleSave();
});

masterEl.addEventListener('change', () => {
  state.enabled = masterEl.checked;
  renderStatus(null);
  scheduleSave();
});

// debounce 300ms 写入 storage；background 监听变化自动同步 DNR。
// 保存后回读 ERROR_KEY，把同步错误展示到状态行。
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await set(state);
      const data = await chrome.storage.local.get(ERROR_KEY);
      renderStatus(data[ERROR_KEY] || null);
    } catch (err) {
      renderStatus('保存失败：' + (err && err.message ? err.message : err));
    }
  }, 300);
}

function renderStatus(error) {
  statusEl.classList.remove('error');
  if (error) {
    statusEl.textContent = '⚠ ' + error;
    statusEl.classList.add('error');
    return;
  }
  if (!state.enabled) {
    statusEl.textContent = '已暂停';
    return;
  }
  const active = state.rules.filter((r) => r.enabled && r.header && r.header.trim()).length;
  statusEl.textContent = `${active} 条生效中`;
}

init();
```

- [ ] **Step 2: 静态自检**

Run: `node --check src/popup.js`
Expected: 无输出（语法正确）。

- [ ] **Step 3: 提交**

```bash
git add src/popup.js
git commit -m "feat(popup): 渲染与 debounce 自动保存"
```

---

## Task 8: 手动验收与 README

**Files:**
- Create: `README.md`

**说明：** Chrome 扩展的端到端行为无法自动化测试，按 spec 第 8.2 节清单手动验收。

- [ ] **Step 1: 创建 `README.md`**

````markdown
# Header Master

全局修改 HTTP 请求头的 Chrome MV3 扩展（覆盖 / 删除），被禁用的 ModHeader 请求头功能的轻量替代。

## 加载（开发）

1. 打开 `chrome://extensions`
2. 右上角开启「开发者模式」
3. 点「加载已解压的扩展程序」，选择本目录

## 使用

- 点工具栏图标打开弹窗
- 「＋ 添加请求头」新增规则：填 Header 名，选 Set（覆盖）/ Remove（删除），填值
- 右上角总开关暂停/恢复全部；每行勾选框停用单条
- 输入自动保存（~300ms）

## 验证生效

- 访问 `https://httpbin.org/headers`，看返回的 `headers` 是否含你设的头
- 或在任意页面打开 DevTools → Network，查看请求头

## 权限说明

`*://*/*` 主机权限是全局改请求头所必需的（与 ModHeader 一致），安装时 Chrome 会提示。

## 开发

```bash
npm install
npm test      # 纯函数单元测试（dnr / storage / constants）
```
````

- [ ] **Step 2: 加载并执行验收清单**

加载未打包扩展后，逐项确认（任一项失败即停下来修）：

1. 安装后无错误；service worker 在 `chrome://extensions` 显示活跃
2. 添加 `Authorization` = `Bearer test`（Set）→ 访问 `https://httpbin.org/headers`，响应 `headers` 含 `Authorization: Bearer test`
3. 添加 `User-Agent` = `MyAgent/1.0`（Set）→ 用 DevTools Network 确认请求头被覆盖
4. 添加 `Cookie`（Remove）→ DevTools Network 确认该头被删除
5. 关总开关 → 重新请求，头不再被改写；状态行显示「已暂停」
6. 取消某条勾选 → 该条停用，其余仍生效
7. 关闭并重开浏览器 → 规则仍在（持久化）
8. 故意填一个非法头名（如含空格的特殊串触发 DNR 拒绝）→ 状态行变红显示错误，badge 显示 `!`（fail fast 生效）

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit -m "docs: 添加 README 与验收说明"
```

---

## Self-Review 结果

- **Spec 覆盖**：spec 全部章节均有任务落地——架构/数据流（Task 1/4/7）、数据模型与 DNR 映射（Task 2）、UI（Task 6/7）、权限与 manifest（Task 5）、错误处理（Task 4/7 的 ERROR_KEY + badge）、测试（Task 1/2/3 单测 + Task 8 手动）。
- **占位符扫描**：无 TBD/TODO；所有代码步骤含完整代码。
- **类型/命名一致**：`stateToDnrRules`、`mergeDefaults`、`get/set`、`STORAGE_KEY/ERROR_KEY/MASTER_RULE_ID/ALL_RESOURCE_TYPES/DEFAULT_STATE` 在各任务间一致；DOM id/class 在 Task 6 与 Task 7 严格对应（`#master`/`#status`/`#rules`/`#add`/`#row-template` 及 `.rule*`）。
