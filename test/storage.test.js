import { describe, it, expect } from 'vitest';
import { mergeDefaults } from '../src/lib/storage.js';
import { DEFAULT_STATE } from '../src/lib/constants.js';

describe('mergeDefaults', () => {
  it('null/undefined 返回默认状态', () => {
    expect(mergeDefaults(undefined)).toEqual(DEFAULT_STATE);
    expect(mergeDefaults(null)).toEqual(DEFAULT_STATE);
  });

  it('非对象返回默认状态', () => {
    expect(mergeDefaults('garbage')).toEqual(DEFAULT_STATE);
    expect(mergeDefaults(42)).toEqual(DEFAULT_STATE);
  });

  it('保留合法的 enabled 与 rules', () => {
    const s = {
      enabled: false,
      rules: [{ id: 'r1', header: 'X', op: 'set', value: '1', enabled: true }],
    };
    expect(mergeDefaults(s)).toEqual(s);
  });

  it('enabled 缺失或类型错时默认 true', () => {
    expect(mergeDefaults({ rules: [] }).enabled).toBe(true);
    expect(mergeDefaults({ enabled: 'yes', rules: [] }).enabled).toBe(true);
  });

  it('rules 缺失或类型错时默认空数组', () => {
    expect(mergeDefaults({ enabled: true }).rules).toEqual([]);
    expect(mergeDefaults({ enabled: true, rules: 'nope' }).rules).toEqual([]);
  });
});
