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
