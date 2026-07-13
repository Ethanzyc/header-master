import { describe, it, expect } from 'vitest';
import { stateToDnrRules } from '../src/lib/dnr.js';
import { MASTER_RULE_ID, ALL_RESOURCE_TYPES } from '../src/lib/constants.js';

function makeState({ enabled = true, activeId = 'p_default', profiles = [] } = {}) {
  return { enabled, activeProfileId: activeId, profiles };
}
function profile(id, rules, name = id) {
  return { id, name, rules };
}
function rule(header, op = 'set', value = '1', enabled = true) {
  return { id: 'r_' + header, header, op, value, enabled };
}

describe('stateToDnrRules', () => {
  it('总开关关 → []', () => {
    expect(stateToDnrRules(makeState({ enabled: false, profiles: [profile('p', [rule('X')])] }))).toEqual([]);
  });

  it('无 active profile → []', () => {
    expect(
      stateToDnrRules(makeState({ activeId: 'p_missing', profiles: [profile('p', [rule('X')])] }))
    ).toEqual([]);
  });

  it('active profile 的 set 规则正确映射', () => {
    const out = stateToDnrRules(
      makeState({ profiles: [profile('p_default', [rule('Authorization', 'set', 'Bearer x')])] })
    );
    expect(out).toEqual([
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

  it('remove 规则不带 value', () => {
    const out = stateToDnrRules(
      makeState({ profiles: [profile('p_default', [rule('Cookie', 'remove', 'ignored')])] })
    );
    expect(out[0].action.requestHeaders).toEqual([{ header: 'Cookie', operation: 'remove' }]);
  });

  it('非 active profile 的规则不生效（关键用例）', () => {
    const out = stateToDnrRules(
      makeState({
        activeId: 'p_active',
        profiles: [
          profile('p_active', [rule('A', 'set', '1')]),
          profile('p_other', [rule('B', 'set', '2')]),
        ],
      })
    );
    expect(out[0].action.requestHeaders).toEqual([{ header: 'A', operation: 'set', value: '1' }]);
  });

  it('多条生效规则合并进一条', () => {
    const out = stateToDnrRules(
      makeState({
        profiles: [
          profile('p_default', [rule('A', 'set', '1'), rule('B', 'remove'), rule('C', 'set', '3', false)]),
        ],
      })
    );
    expect(out[0].action.requestHeaders).toEqual([
      { header: 'A', operation: 'set', value: '1' },
      { header: 'B', operation: 'remove' },
    ]);
  });

  it('跳过头名称为空的规则', () => {
    const out = stateToDnrRules(
      makeState({ profiles: [profile('p_default', [rule('   ', 'set', '1'), rule('X', 'set', '2')])] })
    );
    expect(out[0].action.requestHeaders).toEqual([{ header: 'X', operation: 'set', value: '2' }]);
  });

  it('active profile 无生效规则 → []', () => {
    expect(
      stateToDnrRules(makeState({ profiles: [profile('p_default', [rule('X', 'set', '1', false)])] }))
    ).toEqual([]);
    expect(stateToDnrRules(makeState({ profiles: [profile('p_default', [])] }))).toEqual([]);
  });
});
