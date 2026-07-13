# Multi-Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Header Master 增加多 Profile 单活切换：多套命名的请求头规则组，同一时间只有 active profile 生效，下拉框切换，旧数据无感迁移。

**Architecture:** `state` 形状从 `{enabled, rules}` 改为 `{enabled, activeProfileId, profiles:[{id,name,rules}]}`。数据层（constants/storage/dnr）原子改造（共享 state 形状，拆开会产生中间不可运行状态），`mergeDefaults` 内做旧格式无感迁移，`stateToDnrRules` 改取 active profile 规则，`background.js` 不动。popup 加 Profile 选择器与管理按钮，规则行数据源改为 `activeProfile().rules`。

**Tech Stack:** Chrome Extension MV3、原生 ES Modules（无构建）、vitest（纯函数单测）、原生 DOM。

## Global Constraints

- **Manifest V3**；service worker `"type": "module"`；**无构建步骤**。
- **代码英文，注释与 UI 文案中文。**
- **单一权威源** `chrome.storage.local`，新结构；`background.js` 不改动，迁移对它透明。
- **迁移必须无感、不丢数据**（现有规则保留进"默认"profile）。
- **禁止硬编码配置**：常量集中在 `constants.js`。
- **fail fast，禁止吞异常。**
- **TDD**：纯函数（`mergeDefaults`、`normalizeProfile`、`stateToDnrRules`）先写测试；UI 手动验收。
- **单活**：只有 `activeProfileId` 指向的 profile 生效；明确不做多 profile 合并。

---

## File Structure

| 文件 | 改动 | 测试 |
|------|------|------|
| `src/lib/constants.js` | `DEFAULT_STATE` 改新结构 | 改单测断言 |
| `src/lib/storage.js` | 重写 `mergeDefaults` + 新增 `normalizeProfile`（+内部 helper） | 重写单测（迁移用例） |
| `src/lib/dnr.js` | `stateToDnrRules` 取 active profile 规则 | 重写单测（新形状） |
| `src/background.js` | 不变 | — |
| `src/popup.html` | 加 Profile 行（select + 3 按钮） | 手动 |
| `src/popup.css` | Profile 行样式 | 手动 |
| `src/popup.js` | Profile 选择器与管理；规则数据源改 `activeProfile().rules` | 手动 |

DOM 契约（Task 2/3 共享）：新增 `#profile`、`#profile-new`、`#profile-rename`、`#profile-delete`；既有 `#master`/`#status`/`#rules`/`#add`/`#row-template` 及 `.rule*` 不变。

---

## Task 1: 数据层迁移（constants + storage + dnr，TDD）

**Files:**
- Modify: `src/lib/constants.js`
- Modify: `src/lib/storage.js`
- Modify: `src/lib/dnr.js`
- Modify: `test/constants.test.js`
- Modify: `test/storage.test.js`
- Modify: `test/dnr.test.js`

**Interfaces:**
- Consumes: `STORAGE_KEY`、`MASTER_RULE_ID`、`ALL_RESOURCE_TYPES`（不变）
- Produces:
  - `DEFAULT_STATE = { enabled: true, activeProfileId: 'p_default', profiles: [{id:'p_default', name:'默认', rules:[]}] }`
  - `mergeDefaults(stored) -> { enabled, activeProfileId, profiles }`（旧 `{enabled,rules}` 自动迁移）
  - `normalizeProfile(p, i) -> { id, name, rules } | null`（导出，可单测）
  - `stateToDnrRules(state) -> Rule[]`（state 新形状，取 active profile）

- [ ] **Step 1: 改 `src/lib/constants.js` 的 `DEFAULT_STATE`**

把末尾的：
```js
// 首次使用 / storage 为空时的默认状态
export const DEFAULT_STATE = { enabled: true, rules: [] };
```
改为：
```js
// 首次使用 / storage 为空时的默认状态：单个"默认"profile，总开关开
export const DEFAULT_STATE = {
  enabled: true,
  activeProfileId: 'p_default',
  profiles: [{ id: 'p_default', name: '默认', rules: [] }],
};
```

- [ ] **Step 2: 改 `test/constants.test.js` 的 DEFAULT_STATE 断言**

把：
```js
  it('DEFAULT_STATE 默认总开关开、规则为空', () => {
    expect(DEFAULT_STATE).toEqual({ enabled: true, rules: [] });
  });
```
改为：
```js
  it('DEFAULT_STATE 含默认 profile 且总开关开', () => {
    expect(DEFAULT_STATE).toEqual({
      enabled: true,
      activeProfileId: 'p_default',
      profiles: [{ id: 'p_default', name: '默认', rules: [] }],
    });
  });
```

- [ ] **Step 3: 跑测试，确认此时全绿（constants 已改，storage/dnr 仍是旧实现，旧测试仍过）**

Run: `npm test`
Expected: PASS 18/18（constants 新断言过；storage/dnr 旧实现 + 旧测试仍一致）。

- [ ] **Step 4: 重写 `test/storage.test.js`（新迁移用例 + normalizeProfile）**

整个文件替换为：
```js
import { describe, it, expect } from 'vitest';
import { mergeDefaults, normalizeProfile } from '../src/lib/storage.js';

const rule = { id: 'r1', header: 'X', op: 'set', value: '1', enabled: true };
const defaultProfile = { id: 'p_default', name: '默认', rules: [] };

describe('mergeDefaults', () => {
  it('null/undefined/非对象 → 默认单个 profile', () => {
    const expected = { enabled: true, activeProfileId: 'p_default', profiles: [defaultProfile] };
    expect(mergeDefaults(undefined)).toEqual(expected);
    expect(mergeDefaults(null)).toEqual(expected);
    expect(mergeDefaults('x')).toEqual(expected);
    expect(mergeDefaults(42)).toEqual(expected);
  });

  it('旧格式迁移：顶层 rules 包进"默认"profile，保留 enabled', () => {
    expect(mergeDefaults({ enabled: false, rules: [rule] })).toEqual({
      enabled: false,
      activeProfileId: 'p_default',
      profiles: [{ id: 'p_default', name: '默认', rules: [rule] }],
    });
  });

  it('旧格式 rules 非数组 → 退回默认 profile', () => {
    expect(mergeDefaults({ enabled: true, rules: 'nope' })).toEqual({
      enabled: true,
      activeProfileId: 'p_default',
      profiles: [defaultProfile],
    });
  });

  it('新格式正常保留', () => {
    const state = {
      enabled: false,
      activeProfileId: 'p_dev',
      profiles: [
        { id: 'p_default', name: '默认', rules: [] },
        { id: 'p_dev', name: '开发', rules: [rule] },
      ],
    };
    expect(mergeDefaults(state)).toEqual(state);
  });

  it('activeProfileId 指向不存在的 profile → 回落到 profiles[0]', () => {
    const out = mergeDefaults({
      enabled: true,
      activeProfileId: 'p_missing',
      profiles: [{ id: 'p_a', name: 'A', rules: [] }],
    });
    expect(out.activeProfileId).toBe('p_a');
  });

  it('profiles 全部畸形 → 退回默认 profile', () => {
    const out = mergeDefaults({ enabled: true, profiles: [null, 42, 'x'] });
    expect(out.profiles).toEqual([defaultProfile]);
    expect(out.activeProfileId).toBe('p_default');
  });

  it('enabled 缺失/类型错 → 默认 true', () => {
    const out = mergeDefaults({ profiles: [{ id: 'p_a', name: 'A', rules: [] }] });
    expect(out.enabled).toBe(true);
  });
});

describe('normalizeProfile', () => {
  it('非对象返回 null', () => {
    expect(normalizeProfile(null, 0)).toBeNull();
    expect(normalizeProfile(42, 0)).toBeNull();
    expect(normalizeProfile('x', 0)).toBeNull();
  });

  it('缺 id/name/rules 用 index 兜底', () => {
    expect(normalizeProfile({}, 2)).toEqual({ id: 'p_2', name: 'Profile 3', rules: [] });
  });

  it('保留合法 id/name/rules', () => {
    expect(normalizeProfile({ id: 'p_x', name: 'X', rules: [rule] }, 0)).toEqual({
      id: 'p_x',
      name: 'X',
      rules: [rule],
    });
  });
});
```

- [ ] **Step 5: 跑测试，确认 storage 用例 RED**

Run: `npm test`
Expected: storage.test.js FAIL（旧 `mergeDefaults` 仍返回 `{enabled, rules}`，新用例期望 profiles）。

- [ ] **Step 6: 重写 `src/lib/storage.js`（mergeDefaults + normalizeProfile + helpers）**

整个文件替换为：
```js
import { STORAGE_KEY, DEFAULT_STATE } from './constants.js';

const DEFAULT_PROFILE = { id: 'p_default', name: '默认', rules: [] };

// 把 storage 中读出的原始值合并为合法状态（纯函数，便于单测）。
// 新格式直接校验；旧格式 {enabled, rules} 自动迁移为含单个"默认"profile 的新结构。
export function mergeDefaults(stored) {
  const valid = stored && typeof stored === 'object' && !Array.isArray(stored);
  const enabled = valid && typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULT_STATE.enabled;
  const profiles = readProfiles(stored, valid);
  const activeProfileId = pickActive(stored, profiles);
  return { enabled, activeProfileId, profiles };
}

function readProfiles(stored, valid) {
  // 新格式：含非空 profiles
  if (valid && Array.isArray(stored.profiles) && stored.profiles.length > 0) {
    const normalized = stored.profiles.map((p, i) => normalizeProfile(p, i)).filter((p) => p !== null);
    if (normalized.length > 0) return normalized;
  }
  // 旧格式迁移：顶层 rules 包进"默认"profile
  if (valid && Array.isArray(stored.rules)) {
    return [normalizeProfile({ id: DEFAULT_PROFILE.id, name: DEFAULT_PROFILE.name, rules: stored.rules }, 0)];
  }
  // 默认
  return [normalizeProfile({ ...DEFAULT_PROFILE }, 0)];
}

function pickActive(stored, profiles) {
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    if (profiles.some((p) => p.id === stored.activeProfileId)) {
      return stored.activeProfileId;
    }
  }
  return profiles[0].id;
}

// 规范化单个 profile（纯函数，index 兜底生成 id/name）。
export function normalizeProfile(p, i) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const id = typeof p.id === 'string' && p.id.trim() !== '' ? p.id : `p_${i}`;
  const name = typeof p.name === 'string' && p.name.trim() !== '' ? p.name : `Profile ${i + 1}`;
  const rules = Array.isArray(p.rules) ? p.rules : [];
  return { id, name, rules };
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

- [ ] **Step 7: 跑测试，确认 storage 绿**

Run: `npm test`
Expected: storage.test.js PASS；整体仍可能有 dnr.test.js 失败（下一步处理）。

- [ ] **Step 8: 重写 `test/dnr.test.js`（新形状）**

整个文件替换为：
```js
import { describe, it, expect } from 'vitest';
import { stateToDnrRules } from '../src/lib/dnr.js';
import { MASTER_RULE_ID, ALL_RESOURCE_TYPES } from '../src/lib/constants.js';

function makeState({ enabled = true, activeId = 'p_default', profiles = [] } = {}) {
  return { enabled, activeProfileId: activeId, profiles };
}
function profile(id, rules, name = id) {
  return { id, name, rules };
}
function rule(header, op = 'set', value = '1', enabled = true) {
  return { id: 'r_' + header, header, op, value, enabled };
}

describe('stateToDnrRules', () => {
  it('总开关关 → []', () => {
    expect(stateToDnrRules(makeState({ enabled: false, profiles: [profile('p', [rule('X')])] }))).toEqual([]);
  });

  it('无 active profile → []', () => {
    expect(
      stateToDnrRules(makeState({ activeId: 'p_missing', profiles: [profile('p', [rule('X')])] }))
    ).toEqual([]);
  });

  it('active profile 的 set 规则正确映射', () => {
    const out = stateToDnrRules(
      makeState({ profiles: [profile('p_default', [rule('Authorization', 'set', 'Bearer x')])] })
    );
    expect(out).toEqual([
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

  it('remove 规则不带 value', () => {
    const out = stateToDnrRules(
      makeState({ profiles: [profile('p_default', [rule('Cookie', 'remove', 'ignored')])] })
    );
    expect(out[0].action.requestHeaders).toEqual([{ header: 'Cookie', operation: 'remove' }]);
  });

  it('非 active profile 的规则不生效（关键用例）', () => {
    const out = stateToDnrRules(
      makeState({
        activeId: 'p_active',
        profiles: [
          profile('p_active', [rule('A', 'set', '1')]),
          profile('p_other', [rule('B', 'set', '2')]),
        ],
      })
    );
    expect(out[0].action.requestHeaders).toEqual([{ header: 'A', operation: 'set', value: '1' }]);
  });

  it('多条生效规则合并进一条', () => {
    const out = stateToDnrRules(
      makeState({
        profiles: [
          profile('p_default', [rule('A', 'set', '1'), rule('B', 'remove'), rule('C', 'set', '3', false)]),
        ],
      })
    );
    expect(out[0].action.requestHeaders).toEqual([
      { header: 'A', operation: 'set', value: '1' },
      { header: 'B', operation: 'remove' },
    ]);
  });

  it('跳过头名称为空的规则', () => {
    const out = stateToDnrRules(
      makeState({ profiles: [profile('p_default', [rule('   ', 'set', '1'), rule('X', 'set', '2')])] })
    );
    expect(out[0].action.requestHeaders).toEqual([{ header: 'X', operation: 'set', value: '2' }]);
  });

  it('active profile 无生效规则 → []', () => {
    expect(
      stateToDnrRules(makeState({ profiles: [profile('p_default', [rule('X', 'set', '1', false)])] }))
    ).toEqual([]);
    expect(stateToDnrRules(makeState({ profiles: [profile('p_default', [])] }))).toEqual([]);
  });
});
```

- [ ] **Step 9: 跑测试，确认 dnr 用例 RED**

Run: `npm test`
Expected: dnr.test.js FAIL（旧 `stateToDnrRules` 读 `state.rules`，新用例给的是 profiles）。

- [ ] **Step 10: 重写 `src/lib/dnr.js` 的 `stateToDnrRules`**

整个文件替换为：
```js
import { MASTER_RULE_ID, ALL_RESOURCE_TYPES } from './constants.js';

// 把应用状态转换成 DNR 动态规则数组。
// 取 active profile 的生效规则，合并进同一条规则（固定 id）；无生效规则返回空数组。
// @param {{ enabled: boolean, activeProfileId: string, profiles: Array }} state
// @returns {Array} DNR Rule[]
export function stateToDnrRules(state) {
  if (!state || !state.enabled) return [];

  const profiles = Array.isArray(state.profiles) ? state.profiles : [];
  const active = profiles.find((p) => p && p.id === state.activeProfileId);
  if (!active) return [];

  const headers = (Array.isArray(active.rules) ? active.rules : [])
    .filter((r) => r && r.enabled && typeof r.header === 'string' && r.header.trim() !== '')
    .map(toHeaderInfo);

  if (headers.length === 0) return [];

  return [
    {
      id: MASTER_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: headers,
      },
      condition: { resourceTypes: ALL_RESOURCE_TYPES },
    },
  ];
}

function toHeaderInfo(rule) {
  if (rule.op === 'remove') {
    return { header: rule.header, operation: 'remove' };
  }
  return { header: rule.header, operation: 'set', value: rule.value ?? '' };
}
```

- [ ] **Step 11: 跑全套测试，确认全绿**

Run: `npm test`
Expected: PASS — constants 5 + storage 10 + dnr 8 = 23/23，输出干净。

- [ ] **Step 12: 提交 Task 1**

```bash
git add src/lib/constants.js src/lib/storage.js src/lib/dnr.js test/constants.test.js test/storage.test.js test/dnr.test.js
git commit -m "refactor(data): state 迁移为多 Profile 模型 + mergeDefaults 无感迁移"
```

---

## Task 2: popup 结构与样式（Profile 行）

**Files:**
- Modify: `src/popup.html`
- Modify: `src/popup.css`

**Interfaces:**
- Produces: 新增 DOM 节点 `#profile`（select）、`#profile-new`、`#profile-rename`、`#profile-delete`（Task 3 挂接）。

- [ ] **Step 1: 在 `src/popup.html` 的 topbar 与 status 之间插入 Profile 行**

在 `</header>` 之后、`<div id="status" ...>` 之前插入：
```html
  <div class="profile-bar">
    <select id="profile" class="profile-select" title="切换 Profile"></select>
    <button id="profile-new" class="profile-btn" type="button" title="新建 Profile">新建</button>
    <button id="profile-rename" class="profile-btn" type="button" title="重命名当前 Profile">改名</button>
    <button id="profile-delete" class="profile-btn" type="button" title="删除当前 Profile">删除</button>
  </div>
```

- [ ] **Step 2: 在 `src/popup.css` 末尾追加 Profile 行样式**

```css
.profile-bar {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
}
.profile-select {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #fff;
  color: var(--fg);
  font-size: 13px;
}
.profile-btn {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #fff;
  color: var(--fg);
  cursor: pointer;
  font-size: 12px;
}
.profile-btn:hover { background: var(--row-bg); }
.profile-btn:active { background: #e8eaed; }
```

- [ ] **Step 3: 提交 Task 2**

```bash
git add src/popup.html src/popup.css
git commit -m "feat(popup): Profile 选择器与管理按钮的结构与样式"
```

---

## Task 3: popup 交互（Profile 管理 + activeProfile 规则源）

**Files:**
- Modify: `src/popup.js`

**Interfaces:**
- Consumes: `get`/`set`（Task 1，新形状）、`ERROR_KEY`；Task 2 的 DOM 契约。
- Produces: Profile 切换/新建/改名/删除；规则行数据源统一走 `activeProfile().rules`。

**说明：** Chrome 集成层，无单元测试，靠 Task 4 手动验收。完整重写 `popup.js`。

- [ ] **Step 1: 整个 `src/popup.js` 替换为：**

```js
import { get, set } from './lib/storage.js';
import { ERROR_KEY } from './lib/constants.js';

const $ = (sel) => document.querySelector(sel);

const masterEl = $('#master');
const statusEl = $('#status');
const ul = $('#rules');
const addBtn = $('#add');
const rowTpl = $('#row-template');
const profileSel = $('#profile');
const newBtn = $('#profile-new');
const renameBtn = $('#profile-rename');
const deleteBtn = $('#profile-delete');

let state = { enabled: true, activeProfileId: 'p_default', profiles: [] };
let saveTimer = null;

// 生成稳定唯一 id（popup 上下文可用 Date/random）
function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 当前生效的 profile（单活）
function activeProfile() {
  return state.profiles.find((p) => p.id === state.activeProfileId) || null;
}

async function init() {
  state = await get();
  masterEl.checked = !!state.enabled;
  renderProfiles();
  renderRules();
  const data = await chrome.storage.local.get(ERROR_KEY);
  renderStatus(data[ERROR_KEY] || null);
}

function renderProfiles() {
  profileSel.innerHTML = '';
  for (const p of state.profiles) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    profileSel.appendChild(opt);
  }
  profileSel.value = state.activeProfileId;
}

function renderRules() {
  ul.innerHTML = '';
  const ap = activeProfile();
  for (const rule of (ap ? ap.rules : [])) {
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
  const ap = activeProfile();
  if (!ap) return;
  const li = e.target.closest('.rule');
  const rule = ap.rules.find((r) => r.id === li.dataset.id);
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
  const ap = activeProfile();
  if (!ap) return;
  const rid = e.target.closest('.rule').dataset.id;
  ap.rules = ap.rules.filter((r) => r.id !== rid);
  renderRules();
  scheduleSave();
}

addBtn.addEventListener('click', () => {
  const ap = activeProfile();
  if (!ap) return;
  ap.rules.push({ id: uid('r_'), header: '', op: 'set', value: '', enabled: true });
  renderRules();
  const last = ul.lastElementChild;
  if (last) last.querySelector('.rule-header').focus();
  scheduleSave();
});

// ---- Profile 管理 ----

profileSel.addEventListener('change', () => {
  state.activeProfileId = profileSel.value;
  renderRules();
  renderStatus(null);
  scheduleSave();
});

newBtn.addEventListener('click', () => {
  const name = (window.prompt('新建 Profile 名称：') || '').trim() || `Profile ${state.profiles.length + 1}`;
  const p = { id: uid('p_'), name, rules: [] };
  state.profiles.push(p);
  state.activeProfileId = p.id;
  renderProfiles();
  renderRules();
  renderStatus(null);
  scheduleSave();
});

renameBtn.addEventListener('click', () => {
  const ap = activeProfile();
  if (!ap) return;
  const name = (window.prompt('重命名 Profile：', ap.name) || '').trim();
  if (!name) return;
  ap.name = name;
  renderProfiles();
  scheduleSave();
});

deleteBtn.addEventListener('click', () => {
  if (state.profiles.length <= 1) {
    window.alert('至少保留一个 Profile');
    return;
  }
  const ap = activeProfile();
  if (!ap) return;
  state.profiles = state.profiles.filter((p) => p.id !== ap.id);
  state.activeProfileId = state.profiles[0].id;
  renderProfiles();
  renderRules();
  renderStatus(null);
  scheduleSave();
});

// ---- 总开关 ----

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
  const ap = activeProfile();
  const active = ap ? ap.rules.filter((r) => r.enabled && r.header && r.header.trim()).length : 0;
  statusEl.textContent = `${active} 条生效中`;
}

init();
```

- [ ] **Step 2: 静态自检**

Run: `node --check src/popup.js`
Expected: 无输出（语法正确）。

- [ ] **Step 3: 提交 Task 3**

```bash
git add src/popup.js
git commit -m "feat(popup): Profile 切换/新建/改名/删除 + 规则源改 activeProfile"
```

---

## Task 4: 验收、README 与版本号

**Files:**
- Modify: `README.md`
- Modify: `manifest.json`

**说明：** 端到端行为手动验收；顺带更新 README 与版本号。

- [ ] **Step 1: `manifest.json` 版本号 0.1.0 → 0.2.0**

把：
```json
  "version": "0.1.0",
```
改为：
```json
  "version": "0.2.0",
```

- [ ] **Step 2: 更新 `README.md` 的「使用」章节**

把：
```markdown
## 使用

- 点工具栏图标打开弹窗
- 「＋ 添加请求头」新增规则：填 Header 名，选 Set（覆盖）/ Remove（删除），填值
- 右上角总开关暂停/恢复全部；每行勾选框停用单条
- 输入自动保存（~300ms）
```
改为：
```markdown
## 使用

- 点工具栏图标打开弹窗
- 顶部下拉框切换 / 新建 / 改名 / 删除 Profile；同一时间只有当前 Profile 的规则生效
- 「＋ 添加请求头」新增规则：填 Header 名，选 Set（覆盖）/ Remove（删除），填值
- 右上角总开关暂停/恢复全部；每行勾选框停用单条
- 输入自动保存（~300ms）
- 升级说明：从 0.1.x 升级时，原有规则会自动迁移进「默认」Profile
```

- [ ] **Step 3: 加载扩展并执行验收清单**

`chrome://extensions` → 该扩展卡片点「刷新」。逐项确认（任一失败即停下来修）：

1. 刷新后无报错；service worker 活跃
2. **迁移**：原有规则出现在「默认」Profile 里，且仍生效
3. 「新建」→ 输入"开发"→ 出现空规则的新 Profile 并切到它
4. 在"开发"加 `Authorization: Bearer dev` → httpbin 验证生效
5. 切回「默认」→ httpbin 验证"开发"的头**不再**生效（单活）
6. 「改名」改当前 Profile 名 → 下拉框更新
7. 「删除」删到只剩 1 个时 → 弹窗提示"至少保留一个 Profile"
8. 总开关、单条勾选、Set/Remove 切换仍正常
9. 关闭重开浏览器 → Profile 与规则都在（持久化）

- [ ] **Step 4: 提交 Task 4**

```bash
git add manifest.json README.md
git commit -m "docs: README 增 Profile 用法 + 版本号 0.2.0"
```

---

## Self-Review 结果

- **Spec 覆盖**：数据模型（Task 1 constants/dnr）、迁移（Task 1 storage mergeDefaults + normalizeProfile + 用例）、DNR 单活（Task 1 dnr "非 active 不生效"用例）、UI Profile 行（Task 2）、Profile 管理 + activeProfile 规则源（Task 3）、验收清单覆盖 spec §7 全部手动项（Task 4）。`background.js` 按 spec 不改动 ✓。
- **占位符扫描**：无 TBD/TODO；所有代码步骤含完整代码。
- **类型/命名一致**：`activeProfileId`、`profiles[].{id,name,rules}`、`normalizeProfile(p,i)`、`stateToDnrRules`、DOM `#profile`/`#profile-new`/`#profile-rename`/`#profile-delete` 在各任务间一致；popup.js `uid(prefix)` 与 dnr/storage 无耦合；Task 2 DOM id 与 Task 3 `$('#...')` 严格对应。
- **测试计数**：constants 5 + storage 10（7 mergeDefaults + 3 normalizeProfile）+ dnr 8 = 23，Task 1 Step 11 期望值已据此写明。
