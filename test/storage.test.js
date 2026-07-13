import { describe, it, expect } from 'vitest';
import { mergeDefaults, normalizeProfile } from '../src/lib/storage.js';

const rule = { id: 'r1', header: 'X', op: 'set', value: '1', enabled: true };
const defaultProfile = { id: 'p_default', name: '默认', rules: [] };

describe('mergeDefaults', () => {
  it('null/undefined/非对象 → 默认单个 profile', () => {
    const expected = { enabled: true, activeProfileId: 'p_default', profiles: [defaultProfile] };
    expect(mergeDefaults(undefined)).toEqual(expected);
    expect(mergeDefaults(null)).toEqual(expected);
    expect(mergeDefaults('x')).toEqual(expected);
    expect(mergeDefaults(42)).toEqual(expected);
  });

  it('旧格式迁移：顶层 rules 包进"默认"profile，保留 enabled', () => {
    expect(mergeDefaults({ enabled: false, rules: [rule] })).toEqual({
      enabled: false,
      activeProfileId: 'p_default',
      profiles: [{ id: 'p_default', name: '默认', rules: [rule] }],
    });
  });

  it('旧格式 rules 非数组 → 退回默认 profile', () => {
    expect(mergeDefaults({ enabled: true, rules: 'nope' })).toEqual({
      enabled: true,
      activeProfileId: 'p_default',
      profiles: [defaultProfile],
    });
  });

  it('新格式正常保留', () => {
    const state = {
      enabled: false,
      activeProfileId: 'p_dev',
      profiles: [
        { id: 'p_default', name: '默认', rules: [] },
        { id: 'p_dev', name: '开发', rules: [rule] },
      ],
    };
    expect(mergeDefaults(state)).toEqual(state);
  });

  it('activeProfileId 指向不存在的 profile → 回落到 profiles[0]', () => {
    const out = mergeDefaults({
      enabled: true,
      activeProfileId: 'p_missing',
      profiles: [{ id: 'p_a', name: 'A', rules: [] }],
    });
    expect(out.activeProfileId).toBe('p_a');
  });

  it('profiles 全部畸形 → 退回默认 profile', () => {
    const out = mergeDefaults({ enabled: true, profiles: [null, 42, 'x'] });
    expect(out.profiles).toEqual([defaultProfile]);
    expect(out.activeProfileId).toBe('p_default');
  });

  it('enabled 缺失/类型错 → 默认 true', () => {
    const out = mergeDefaults({ profiles: [{ id: 'p_a', name: 'A', rules: [] }] });
    expect(out.enabled).toBe(true);
  });
});

describe('normalizeProfile', () => {
  it('非对象返回 null', () => {
    expect(normalizeProfile(null, 0)).toBeNull();
    expect(normalizeProfile(42, 0)).toBeNull();
    expect(normalizeProfile('x', 0)).toBeNull();
  });

  it('缺 id/name/rules 用 index 兜底', () => {
    expect(normalizeProfile({}, 2)).toEqual({ id: 'p_2', name: 'Profile 3', rules: [] });
  });

  it('保留合法 id/name/rules', () => {
    expect(normalizeProfile({ id: 'p_x', name: 'X', rules: [rule] }, 0)).toEqual({
      id: 'p_x',
      name: 'X',
      rules: [rule],
    });
  });
});
