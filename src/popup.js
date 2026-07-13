import { get, set } from './lib/storage.js';
import { ERROR_KEY } from './lib/constants.js';

const $ = (sel) => document.querySelector(sel);

const masterEl = $('#master');
const statusEl = $('#status');
const ul = $('#rules');
const addBtn = $('#add');
const rowTpl = $('#row-template');
const tabsEl = $('#tabs');

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
  renderTabs();
  renderRules();
  const data = await chrome.storage.local.get(ERROR_KEY);
  renderStatus(data[ERROR_KEY] || null);
}

// ---- Profile 标签页 ----

function renderTabs() {
  tabsEl.innerHTML = '';
  for (const p of state.profiles) {
    tabsEl.appendChild(buildTab(p));
  }
  // 末尾"+"新建
  const addTab = document.createElement('div');
  addTab.className = 'tab tab-add';
  addTab.textContent = '＋';
  addTab.title = '新建 Profile';
  addTab.addEventListener('click', newProfile);
  tabsEl.appendChild(addTab);
}

function buildTab(p) {
  const tab = document.createElement('div');
  tab.className = 'tab' + (p.id === state.activeProfileId ? ' tab-active' : '');
  tab.dataset.id = p.id;
  tab.title = '点击切换';
  tab.addEventListener('click', () => switchProfile(p.id));

  const name = document.createElement('span');
  name.className = 'tab-name';
  name.textContent = p.name;
  name.title = '双击重命名';
  name.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    renameProfile(p.id);
  });
  tab.appendChild(name);

  if (state.profiles.length > 1) {
    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '✕';
    close.title = '删除';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteProfile(p.id);
    });
    tab.appendChild(close);
  }
  return tab;
}

function switchProfile(id) {
  if (id === state.activeProfileId) return;
  state.activeProfileId = id;
  renderTabs();
  renderRules();
  renderStatus(null);
  scheduleSave();
}

function newProfile() {
  const name = (window.prompt('新建 Profile 名称：') || '').trim() || `Profile ${state.profiles.length + 1}`;
  const p = { id: uid('p_'), name, rules: [] };
  state.profiles.push(p);
  state.activeProfileId = p.id;
  renderTabs();
  renderRules();
  renderStatus(null);
  scheduleSave();
}

function renameProfile(id) {
  const p = state.profiles.find((x) => x.id === id);
  if (!p) return;
  const name = (window.prompt('重命名 Profile：', p.name) || '').trim();
  if (!name) return;
  p.name = name;
  renderTabs();
  scheduleSave();
}

function deleteProfile(id) {
  if (state.profiles.length <= 1) {
    window.alert('至少保留一个 Profile');
    return;
  }
  state.profiles = state.profiles.filter((p) => p.id !== id);
  if (state.activeProfileId === id) {
    state.activeProfileId = state.profiles[0].id;
  }
  renderTabs();
  renderRules();
  renderStatus(null);
  scheduleSave();
}

// ---- 规则行 ----

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

// ---- 总开关 ----

masterEl.addEventListener('change', () => {
  state.enabled = masterEl.checked;
  renderStatus(null);
  scheduleSave();
});

// debounce 300ms 写入 storage；background 监听变化自动同步 DNR。
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
