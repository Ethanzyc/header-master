import { describe, it, expect } from 'vitest';
import { stateToDnrRules } from '../src/lib/dnr.js';
import { MASTER_RULE_ID, ALL_RESOURCE_TYPES } from '../src/lib/constants.js';

describe('stateToDnrRules', () => {
  it('总开关关时返回空数组', () => {
    const state = {
      enabled: false,
      rules: [{ id: 'r1', header: 'X', op: 'set', value: '1', enabled: true }],
    };
    expect(stateToDnrRules(state)).toEqual([]);
  });

  it('无任何规则启用时返回空数组', () => {
    const state = {
      enabled: true,
      rules: [{ id: 'r1', header: 'X', op: 'set', value: '1', enabled: false }],
    };
    expect(stateToDnrRules(state)).toEqual([]);
  });

  it('规则列表为空时返回空数组', () => {
    expect(stateToDnrRules({ enabled: true, rules: [] })).toEqual([]);
  });

  it('单条 set 规则映射正确', () => {
    const state = {
      enabled: true,
      rules: [{ id: 'r1', header: 'Authorization', op: 'set', value: 'Bearer x', enabled: true }],
    };
    expect(stateToDnrRules(state)).toEqual([
      {
        id: MASTER_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'Authorization', operation: 'set', value: 'Bearer x' }],
        },
        condition: { resourceTypes: ALL_RESOURCE_TYPES },
      },
    ]);
  });

  it('remove 规则不带 value 字段', () => {
    const state = {
      enabled: true,
      rules: [{ id: 'r1', header: 'Cookie', op: 'remove', value: '应被忽略', enabled: true }],
    };
    const rules = stateToDnrRules(state);
    expect(rules[0].action.requestHeaders).toEqual([
      { header: 'Cookie', operation: 'remove' },
    ]);
  });

  it('多条生效规则合并进同一条 DNR 规则', () => {
    const state = {
      enabled: true,
      rules: [
        { id: 'r1', header: 'A', op: 'set', value: '1', enabled: true },
        { id: 'r2', header: 'B', op: 'remove', value: '', enabled: true },
        { id: 'r3', header: 'C', op: 'set', value: '2', enabled: false },
      ],
    };
    const rules = stateToDnrRules(state);
    expect(rules).toHaveLength(1);
    expect(rules[0].action.requestHeaders).toHaveLength(2);
    expect(rules[0].action.requestHeaders).toEqual([
      { header: 'A', operation: 'set', value: '1' },
      { header: 'B', operation: 'remove' },
    ]);
  });

  it('跳过头名称为空的规则', () => {
    const state = {
      enabled: true,
      rules: [
        { id: 'r1', header: '   ', op: 'set', value: '1', enabled: true },
        { id: 'r2', header: 'X', op: 'set', value: '2', enabled: true },
      ],
    };
    const rules = stateToDnrRules(state);
    expect(rules[0].action.requestHeaders).toEqual([
      { header: 'X', operation: 'set', value: '2' },
    ]);
  });

  it('set 规则缺省 value 时补空字符串', () => {
    const state = {
      enabled: true,
      rules: [{ id: 'r1', header: 'X', op: 'set', enabled: true }],
    };
    const rules = stateToDnrRules(state);
    expect(rules[0].action.requestHeaders).toEqual([
      { header: 'X', operation: 'set', value: '' },
    ]);
  });
});
