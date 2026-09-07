# Mobile 页面骨架

适用于移动端 App/H5 原型。V1 使用 390 × 844 基准画布，不模拟特定手机品牌；小程序、iOS 原生和 Android Material 的平台专属规范不在当前范围。

## 页面结构

每个页面或可独立评审的状态仍是一个 `section`，保持“页面索引 → 原型 → 功能说明”一一对应。产品视口必须同时使用统一类名和设备标识：

```html
<div id="section-mobile-home" class="proto-stack">
  <div class="section-label">移动首页-01</div>
  <div class="proto-with-prd">
    <div class="prototype-viewport mobile-frame" data-device="mobile">
      <div class="mobile-screen">
        <div class="mobile-statusbar">
          <span>9:41</span><span class="mobile-status-icons">● ◒ ▰</span>
        </div>
        <header class="mobile-navbar">
          <button class="mobile-nav-action" aria-label="返回">←</button>
          <h1 class="mobile-navbar__title">页面标题</h1>
          <button class="mobile-nav-action">操作</button>
        </header>
        <main class="mobile-content"><!-- 页面内容 --></main>
        <nav class="mobile-tabbar"><!-- 2–5 个一级入口 --></nav>
      </div>
    </div>
    <aside class="prd-panel"><!-- 对应功能说明 --></aside>
  </div>
</div>
```

HTML 的 `<head>` 除通用注入块外必须增加：

```html
<!-- @proto-gen:mobile:start -->
<!-- inject-assets.mjs 注入 mobile.css -->
<!-- @proto-gen:mobile:end -->
```

## 状态映射

- 普通页面：`mobile-navbar + mobile-content`，一级页面按 PRD决定是否展示 `mobile-tabbar`。
- 二级页面：顶部返回，不展示无关 Tabbar。
- 选择、筛选、快捷编辑：优先 `mobile-overlay + mobile-sheet`。
- 复杂表单或沉浸流程：独立全屏页面，不塞进 Bottom Sheet。
- 单一主操作：使用 `mobile-bottom-action`，内容底部必须预留操作区高度。
- 短反馈：使用 `mobile-toast`；不得用 Toast 承载需要用户决策的信息。

## 移动端约束

- 禁止照搬桌面 sidebar、宽表格、hover 才出现的操作和多列密集布局。
- 主要触控目标不小于 44 × 44；同层主操作只保留一个。
- 底部固定区域必须包含 `env(safe-area-inset-bottom)`，不得遮挡内容。
- 长内容只在 `.mobile-content` 内滚动，手机外壳本身不滚动。
- 表格数据改成卡片、分组列表或横向摘要；若 PRD 强制要求表格，在功能说明标明移动端阅读限制。
- 页面状态必须来自 PRD；设备适配不能成为补造业务规则的理由。
