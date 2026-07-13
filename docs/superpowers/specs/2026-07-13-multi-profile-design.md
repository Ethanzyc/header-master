# Multi-Profile 设计文档（Header Master）

- 日期：2026-07-13
- 状态：已确认，待实现
- 关联：`docs/superpowers/specs/2026-07-10-header-master-design.md`（原 MVP 设计）

## 1. 概述

为 Header Master 增加**多 Profile 切换**：可建多套命名的请求头规则组（如"默认""开发""测试"），同一时间只有一套（active profile）生效，通过下拉框切换。

### 范围（含）

- 多个命名 Profile，单活切换（activeProfileId）
- Profile 增 / 改名 / 删 / 切换
- 旧 `{enabled, rules}` 数据无感迁移到新模型（保留现有规则）

### 非目标（YAGNI）

- 多 Profile 同时生效（合并）——明确不做，单活
- Profile 导入 / 导出
- 复制 Profile
- 模态框改名 UI（用 `window.prompt()`）

## 2. 数据模型

### 新 `state` 结构

```js
{
  enabled: true,                    // 总开关（全局）
  activeProfileId: "p_default",     // 当前生效的 profile
  profiles: [
    { id: "p_default", name: "默认", rules: [ { id, header, op, value, enabled }, ... ] },
    { id: "p_dev", name: "开发", rules: [...] }
  ]
}
```

- `Profile = { id: string, name: string, rules: Rule[] }`
- `Rule = { id, header, op: 'set'|'remove', value, enabled }`（不变）
- `enabled`：全局总开关。`false` 时暂停全部（active profile 也不生效）。
- `activeProfileId`：唯一生效的 profile。单活。

### 默认状态（constants.js DEFAULT_STATE）

```js
export const DEFAULT_STATE = {
  enabled: true,
  activeProfileId: 'p_default',
  profiles: [{ id: 'p_default', name: '默认', rules: [] }],
};
```

## 3. 迁移（mergeDefaults 内，读取时无感）

`mergeDefaults(stored)` 逻辑：

1. `stored` 非对象 → 返回 `DEFAULT_STATE` 深拷贝。
2. `enabled`：`boolean` 则取，否则 `true`。
3. **新格式**（`stored.profiles` 是非空数组）：
   - `profiles = stored.profiles.map(normalizeProfile).filter(Boolean)`；若过滤后为空 → 退回默认单个 profile。
   - `activeProfileId`：若存在于 profile id 集合中则取，否则回落 `profiles[0].id`。
   - 返回 `{ enabled, activeProfileId, profiles }`。
4. **旧格式迁移**（`stored.profiles` 不存在/非数组，但 `stored.rules` 是数组）：
   - 包装成 `{ id: 'p_default', name: '默认', rules: stored.rules }`，过 `normalizeProfile`。
   - 返回 `{ enabled, activeProfileId: 'p_default', profiles: [该 profile] }`。
5. 其他 → `DEFAULT_STATE` 深拷贝（保留 `enabled`）。

`normalizeProfile(p, i)`（纯函数，index 兜底）：

- `p` 非对象 → `null`。
- `id`：非空字符串则取，否则 `p_${i}`。
- `name`：非空字符串则取，否则 `Profile ${i + 1}`（迁移场景固定为"默认"）。
- `rules`：数组则取，否则 `[]`。

迁移设计要点：旧数据在下次读取（popup 打开 / background 同步）时自动升级，无需显式迁移步骤；现有规则全部保留进"默认" profile。

## 4. DNR 同步（dnr.js）

`stateToDnrRules(state)`：

```js
if (!state || !state.enabled) return [];
const active = (state.profiles || []).find(p => p.id === state.activeProfileId);
if (!active) return [];
const headers = (active.rules || [])
  .filter(r => r && r.enabled && typeof r.header === 'string' && r.header.trim() !== '')
  .map(toHeaderInfo);
if (headers.length === 0) return [];
return [{
  id: MASTER_RULE_ID, priority: 1,
  action: { type: 'modifyHeaders', requestHeaders: headers },
  condition: { resourceTypes: ALL_RESOURCE_TYPES },
}];
```

`toHeaderInfo` 不变（`op:'remove'` → `{header, operation:'remove'}`；否则 `{header, operation:'set', value: value ?? ''}`）。

**关键**：非 active profile 的规则完全不参与 DNR。`background.js` 无需改动（仍 `get()` → `stateToDnrRules` → `updateDynamicRules`），迁移对它透明。

## 5. UI（popup）

布局：

```
┌─────────────────────────────────────────┐
│ Header Master                    [ ●  ] │  总开关（全局）
│ [默认 ▾] [新建][改名][删除]   3 条生效中 │  Profile 行
├─────────────────────────────────────────┤
│ (active profile 的规则列表，行操作不变)   │
│ [✓] Authorization [Set] Bearer xxx  [✕] │
├─────────────────────────────────────────┤
│         ＋ 添加请求头                     │
└─────────────────────────────────────────┘
```

### Profile 行

- `<select id="profile">`：列出所有 profile，`value=profile.id`，显示 `name`。切换 → 设 `state.activeProfileId` → 重渲染规则列表 → 存盘。
- **新建**：`prompt('Profile 名称')`（空则 `Profile ${profiles.length+1}`）→ push `{id: 'p_'+uid, name, rules:[]}` → 切到新 profile → 存盘。
- **改名**：`prompt('新名称', activeProfile().name)` → 改 active profile 的 name → 重渲染 Profile 行 → 存盘。空名忽略。
- **删除**：删 active profile；`profiles.length <= 1` 时 `alert('至少保留一个 Profile')` 拒绝；否则移除、`activeProfileId = profiles[0].id`、重渲染、存盘。

### 规则行（行为不变，数据源改为 active profile）

- 所有行操作（增/删/改/勾选）改为读写 `activeProfile().rules`。
- `activeProfile()` = `state.profiles.find(p => p.id === state.activeProfileId)`。
- onRowChange / onDelete 通过 `dataset.id` 在 `activeProfile().rules` 中定位。

### 状态行

- 出错时红色（不变）。
- `!state.enabled` → "已暂停"。
- 否则：active profile 中 `enabled && header 非空` 的规则数 → "N 条生效中"。

### 改名/新建交互

用 `window.prompt()`（开发工具够用，避免造模态框）。

## 6. 模块改动清单

| 文件 | 改动 |
|------|------|
| `src/lib/constants.js` | `DEFAULT_STATE` 改为新结构（含 activeProfileId + profiles） |
| `src/lib/storage.js` | `mergeDefaults` 重写（新格式校验 + 旧格式迁移）；新增 `normalizeProfile` |
| `src/lib/dnr.js` | `stateToDnrRules` 改为取 active profile 规则 |
| `src/background.js` | 不变 |
| `src/popup.html` | 加 Profile 行（select + 新建/改名/删除按钮） |
| `src/popup.css` | Profile 行样式 |
| `src/popup.js` | Profile 选择器与管理；规则行数据源改为 activeProfile().rules |

## 7. 测试

### storage.test.js（新增迁移用例）

- 旧格式 `{enabled:false, rules:[r1]}` → 新格式，保留 `enabled:false`，rules 进"默认" profile，`activeProfileId='p_default'`
- 旧格式 `rules` 非数组 → 退回默认单个 profile
- 新格式正常保留
- `activeProfileId` 指向不存在的 profile → 回落到 `profiles[0].id`
- 畸形 profile（缺 id/name/rules）被 `normalizeProfile` 补全
- `normalizeProfile(null)` → `null`（被过滤）

### dnr.test.js（重写为新形状）

- 总开关关 → `[]`
- active profile 的 set 规则 → 正确映射
- active profile 的 remove 规则 → 不带 value
- **非 active profile 的 enabled 规则不出现在结果**（新关键用例）
- 多条生效规则合并进一条
- active profile 规则全空 / 无 active profile → `[]`
- set 缺省 value → 空字符串

### 手动验收（popup 行为）

- 现有规则出现在"默认" profile（迁移）
- 新建/改名/删除 profile
- 切换 profile，规则列表随之变化，DNR 实际生效的是 active profile
- 删到最后一个 profile 被拒绝
- 总开关、单条勾选仍正常
- 重启浏览器后 profile 与规则持久化

## 8. 关键约束

- 单一权威源仍是 `chrome.storage.local`，新结构。
- `background.js` 不改动，迁移透明。
- 纯函数（`mergeDefaults`、`normalizeProfile`、`stateToDnrRules`）全可单测；UI 手动验收。
- 迁移必须无感、保留现有数据（fail fast 但不丢数据）。
