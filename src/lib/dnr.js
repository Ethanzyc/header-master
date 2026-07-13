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
