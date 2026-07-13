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
