# Mobile 组件索引

生成移动端页面时读取本文件和 `html-structure-mobile.md`，不要读取桌面外壳模板来拼移动页面。

| 场景 | 类名 |
|---|---|
| 手机外壳 | `.prototype-viewport.mobile-frame[data-device="mobile"]` |
| 状态栏 | `.mobile-statusbar` / `.mobile-status-icons` |
| 顶部导航 | `.mobile-navbar` / `.mobile-navbar__title` / `.mobile-nav-action` |
| 内容滚动区 | `.mobile-content` |
| 底部一级导航 | `.mobile-tabbar` / `.mobile-tab` / `.active` |
| 内容卡片 | `.mobile-card` |
| 列表 | `.mobile-list-row` / `.mobile-list-main` / `.mobile-list-title` / `.mobile-list-meta` |
| 搜索 | `.mobile-search` |
| 固定主操作 | `.mobile-bottom-action` |
| 遮罩与底部面板 | `.mobile-overlay` / `.mobile-sheet` / `.mobile-sheet__handle` |
| 短反馈 | `.mobile-toast` |
| 空状态 | `.mobile-empty` / `.mobile-empty__title` / `.mobile-empty__desc` |

按钮、Badge、输入框、开关等基础原语继续复用 `shared.css`。移动端需要不同尺寸时，用移动端容器后代选择器扩展，不复制颜色 token 或另造主题。
