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
