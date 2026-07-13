# Header Master

全局修改 HTTP 请求头的 Chrome MV3 扩展（覆盖 / 删除），被禁用的 ModHeader 请求头功能的轻量替代。

## 加载（开发）

1. 打开 `chrome://extensions`
2. 右上角开启「开发者模式」
3. 点「加载已解压的扩展程序」，选择本目录

## 使用

- 点工具栏图标打开弹窗
- 顶部标签页管理 Profile：点 tab 切换、`＋` 新建、tab 上 `×` 删除、双击 tab 名改名；同一时间只有当前 Profile 的规则生效
- 「＋ 添加请求头」新增规则：填 Header 名，选 Set（覆盖）/ Remove（删除），填值
- 右上角总开关暂停/恢复全部；每行勾选框停用单条
- 输入自动保存（~300ms）
- 升级说明：从 0.1.x 升级时，原有规则会自动迁移进「默认」Profile

## 验证生效

- 访问 `https://httpbin.org/headers`，看返回的 `headers` 是否含你设的头
- 或在任意页面打开 DevTools → Network，查看请求头

## 权限说明

`*://*/*` 主机权限是全局改请求头所必需的（与 ModHeader 一致），安装时 Chrome 会提示。

## 开发

```bash
npm install
npm test      # 纯函数单元测试（dnr / storage / constants）
```

## 架构

- `chrome.storage.local` 为单一权威源（总开关 + 规则）
- service worker 监听 `storage.onChanged`，把生效规则合并成一条 DNR 动态规则（`declarativeNetRequest`）
- popup 只读写 storage，不碰 DNR
