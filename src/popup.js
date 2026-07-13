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
