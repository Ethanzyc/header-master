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
