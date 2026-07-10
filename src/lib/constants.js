// storage.local 中保存状态的键
export const STORAGE_KEY = 'hm_state';
// storage.local 中保存最近一次同步错误信息的键
export const ERROR_KEY = 'hm_error';
// 合并后唯一一条 DNR 动态规则的固定 id
export const MASTER_RULE_ID = 1;

// 全部 ResourceType 枚举值。DNR 中省略 resourceTypes 默认排除 main_frame，
// 改请求头工具必须显式列出全部类型，确保主框架导航请求也生效。
export const ALL_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
];

// 首次使用 / storage 为空时的默认状态
export const DEFAULT_STATE = { enabled: true, rules: [] };
