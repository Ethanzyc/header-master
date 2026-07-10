import { describe, it, expect } from 'vitest';
import {
  STORAGE_KEY,
  ERROR_KEY,
  MASTER_RULE_ID,
  ALL_RESOURCE_TYPES,
  DEFAULT_STATE,
} from '../src/lib/constants.js';

describe('constants', () => {
  it('STORAGE_KEY 是非空字符串', () => {
    expect(typeof STORAGE_KEY).toBe('string');
    expect(STORAGE_KEY.length).toBeGreaterThan(0);
  });

  it('ERROR_KEY 是非空字符串且与 STORAGE_KEY 不同', () => {
    expect(typeof ERROR_KEY).toBe('string');
    expect(ERROR_KEY.length).toBeGreaterThan(0);
    expect(ERROR_KEY).not.toBe(STORAGE_KEY);
  });

  it('MASTER_RULE_ID 是正整数', () => {
    expect(Number.isInteger(MASTER_RULE_ID)).toBe(true);
    expect(MASTER_RULE_ID).toBeGreaterThanOrEqual(1);
  });

  it('ALL_RESOURCE_TYPES 含全部类型且包含 main_frame', () => {
    expect(ALL_RESOURCE_TYPES).toContain('main_frame');
    expect(ALL_RESOURCE_TYPES).toContain('xmlhttprequest');
    expect(ALL_RESOURCE_TYPES).toContain('other');
    expect(ALL_RESOURCE_TYPES.length).toBeGreaterThanOrEqual(10);
  });

  it('DEFAULT_STATE 默认总开关开、规则为空', () => {
    expect(DEFAULT_STATE).toEqual({ enabled: true, rules: [] });
  });
});
