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
