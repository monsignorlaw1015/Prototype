---
name: high-fidelity-prototype
description: 基于已有 PRD Markdown 生成高保真、可评审的桌面端 HTML 原型，包含页面索引、逐页功能说明、流程图、可编辑文案和浏览器验收。仅在用户提供 PRD 文件时使用；不根据一句构思凭空定义需求。
---

# proto-gen — 高保真原型生成

本 skill 将已有 PRD 转译为统一风格的高保真 HTML 原型，适合 Web/桌面应用产品 MVP 阶段的方案演示与评审。它不负责凭空定义需求：**PRD Markdown 是必需输入和业务事实来源**。

## 设备系列

| 系列 | 状态 | 外壳容器 | 适用 reference |
|---|---|---|---|
| **PC · macOS** | ✅ 当前覆盖 | `macos-window` / `macos-titlebar` / `macos-body` + `app-sidebar` / `win-chrome-bar` / `app-main` | 现有 `references/*.md` 全部 |
| **Mobile** | 🚧 规划中 | 拟用 `mobile-frame` / `mobile-statusbar` / `mobile-tabbar`（待落地） | 后续以独立文件扩展（如 `references/html-structure-mobile.md`），不混入现有 |

> 当前所有原型骨架与组件描述均基于 PC · macOS 系列。引入 Mobile 系列时，**新增独立 reference 文件**而不是覆写现有，避免设备形态混淆。

## 三段结构契约

每个原型 HTML 文件由**三段固定结构**组成，任何 section 都必须遵守。骨架类名见 [`references/html-structure.md`](references/html-structure.md)。

```
.proto-layout (灰底桌面，flex 横排，gap 24)
┌──────────────┬──────────────────────────────┬──────────────────┐
│              │                              │                  │
│ toc-sidebar  │   原型图(macos-window)       │  功能概览        │
│ 280px sticky │   1460×910（macOS 桌面感）   │  prd-panel       │
│ 卡片         │                              │  360px sticky    │
│ (全文件共享) │   ←──── 一一对应 ────→       │  卡片            │
│              │                              │                  │
└──────────────┴──────────────────────────────┴──────────────────┘
   toc-sidebar     sections-col (纵向堆叠每个 .proto-stack)
                     │
                     └─ 每个 .proto-stack = section-label + .proto-with-prd
                                                          │
                                                          └─ macos-window + prd-panel
```

**布局规范**（实施于 `assets/shared.css`，原型 HTML 不应覆写）：

| 维度 | 值 | 说明 |
|---|---|---|
| body 背景 | `oklch(0.92 0.005 280)` | macOS 桌面浅灰，让白色窗口悬浮其上 |
| body padding | `32px 24px` | 整体外边距 |
| macos-window 尺寸 | **1460×910** | 对齐 PC macOS 应用常见窗口大小（参 `references/shadcn-tweakcn-theme.md`） |
| toc-sidebar 宽度 | **280px** | sticky top:32px，独立卡片样式 |
| prd-panel 宽度 | **360px** | sticky top:32px，与 macos-window 同高（910px） |
| 列间距 | `24px` | toc / 原型 / prd 三者之间 |

约束：

1. **toc-sidebar 全文件唯一**：所有 section 共用同一个左侧索引，每个 section 一条 toc-item
2. **原型图 ↔ 功能概览 一一对应**：每个 section 内一个 `.proto-with-prd` 包**恰好一个**外壳 + **恰好一个** `.prd-panel`
3. **不允许「一图多 PRD」**（一个外壳塞多个 prd-section 拆给多个状态）
4. **不允许「页面说明拆给多图」**（一个 prd-panel 描述跨多个外壳的内容）
5. 此契约**设备无关**——Mobile 系列引入后仍维持三段结构，只是外壳容器换成 `mobile-frame`

## 设计系统资产

本 skill 自带一套**主题可插拔**的设计系统：

- `assets/theme.css` — **主题 token 单一来源**（19 个 shadcn 核心 + 8 个 sidebar 子 token + 12 个状态色派生 + 字体 CDN）。默认 = tweakcn 724-1，可通过 `extract-theme.sh` 切换
- `assets/shared.css` — 组件类骨架（按钮 / 卡片 / 弹窗 / 表单 / PRD 面板等）；所有颜色 / 字体 / 圆角通过 `var()` 引用 `theme.css` 的 token
- `assets/components.html` — **人类可视组件清单**（核心交付物）：每个组件含 类名 / 常态 / hover / 禁用 / loading 四态横排 + 应用场景 + Token 速查；产品 / 测试 / AI 浏览器双击查阅
- `assets/extract-theme.sh` — 主题切换脚本：`./extract-theme.sh <tweakcn-url-or-id>` 一键覆盖 `theme.css`
- `assets/inject-assets.mjs` — **资产注入脚本**：把主题、组件、联动和文案编辑运行时注入原型 HTML，产出仍是自包含单文件
- `assets/prd-highlight.js` — PRD ↔ 原型 双向 hover 联动运行时
- `assets/prototype-editor.js` — 项目无关的文案编辑运行时：显式 key 优先 + 产品界面与右侧功能说明自动绑定、页面内编辑、自动暂存、恢复初稿、导出无编辑工具的评审版
- `scripts/validate-editor.mjs` — 文案编辑机械验收：启动隔离 Chrome，逐页检查覆盖率和误绑定，并实际修改普通页/弹窗/抽屉后刷新验证持久化
- `assets/example.html` — 最小可运行示例

> **想换主题**：跑 `./extract-theme.sh <new-tweakcn-url>` 覆盖 `theme.css`，再跑一次注入脚本刷新所有原型。
> **想查组件视觉规范**：浏览器打开 `components.html`，左侧 TOC 跳转，点类名复制。

## 自包含注入机制（默认交付方式）

原型 HTML 要求**自包含**（研发 / 评审拿到单文件直接双击打开），但 token 与通用组件样式**不手写副本**，只在本 skill 的 `assets/` 维护一份，通过脚本注入。

**标记格式**：`<head>` 内用一对 HTML 注释包住注入块，脚本只替换标记之间的内容：

```html
<!-- @proto-gen:theme:start -->
<style>/* 脚本注入 theme.css，勿手改 */</style>
<!-- @proto-gen:theme:end -->
<!-- @proto-gen:shared:start -->
<style>/* 脚本注入 shared.css，勿手改 */</style>
<!-- @proto-gen:shared:end -->
<!-- @proto-gen:highlight:start -->
<script>/* 脚本注入 prd-highlight.js，勿手改 */</script>
<!-- @proto-gen:highlight:end -->
<!-- @proto-gen:editor:start -->
<script>/* 脚本注入 prototype-editor.js，勿手改 */</script>
<!-- @proto-gen:editor:end -->
<style>/* 页面自有样式写在标记块之外，注入不会碰 */</style>
```

支持的块：`theme`、`shared`、`highlight`、`editor`。`theme` 与 `editor` 必备，其他按需；每个标记对全文件只允许出现一次。

**注入 / 批量刷新**（同一命令，参数可混填文件与目录，目录递归收集 `*.html`）：

先将本 `SKILL.md` 所在目录解析为绝对路径 `SKILL_DIR`，不要假设 Skill 安装在 `~/.claude`、`~/.codex` 或 `~/.myagents`。随后执行：

```bash
"$SKILL_DIR/assets/inject-assets.mjs" path/to/prototypes/
```

改完 `theme.css` / `shared.css` 后跑一次，所有带标记的原型统一换皮。脚本幂等，重复执行结果一致。

**存量原型一次性迁移**：把已有 `<style>` 中的 token 段（`:root { --background: ... }` 等）与通用组件样式删掉，原位放入上面的空标记块对（页面特有样式保留在标记块之外的独立 `<style>` 里），然后跑一次注入脚本回填。迁移后该文件即可参与批量刷新。

## References 总览

| 文件 | 内容 | 设备适用 |
|---|---|---|
| `references/html-structure.md` | 页面骨架 + 三种叠加态（modal / drawer / subpage） | PC · macOS 系列 |
| `references/css-components.md` | **类名 → 用途 → components.html 锚点** 索引表；不再含 hex / px 等具体值 | PC · macOS 系列 |
| `references/default-theme.md` | proto-gen 默认主题（724-1）说明 + 切换流程 + token 全表 + 切换后必须手工补的 3 项 | 设备无关 |
| `references/shadcn-tweakcn-theme.md` | **目标项目接入**：当原型要对齐业务项目自身主题时如何覆盖 `theme.css`（sidebar 子 token 陷阱 / 状态色派生 / 字体大小映射 / lucide 踩坑 / 自检清单） | 设备无关；项目接入场景 |
| `references/prd-rules.md` | PRD bullets 写法、元素描述模板、重复内容引用规则 | 设备无关 |
| `references/prototype-logic.md` | 从输入 PRD 提取页面逻辑、状态和流程图的规则 | 设备无关 |
| `references/prd-highlight.md` | PRD ↔ 原型 双向 hover 联动：`data-comp` / `data-target` 命名约定 / scope / 交付剥离须知 | 设备无关 |

## 工作目录

由用户在调用时指定，例如 `designs/prototype/` 或 `prototypes/`。生成的 HTML 自包含，目录内无需伴随 css / js 文件。

## 执行步骤

### 1. 理解输入

用户必须提供已有 PRD 的 `.md` 文件路径。没有 PRD 时，要求用户先提供；不要根据一句构思直接产出原型。

**分析出**：

- 页面/功能名称（用于文件名和标题）
- 包含哪些 section（每个 section = 一个原型状态，如主页 / 弹窗 / 抽屉）
- 每个 section 的页面类型（主页 / 详情页 / 弹窗叠加态 / 抽屉叠加态）
- 已定义的核心流程、判断分支和状态机；它们必须来自 PRD，不得补造业务规则

### 2. 规划 sections

每个页面 section 对应一个 `macos-window` + `prd-panel`，分配：

- `section-id`（kebab-case，如 `section-home`、`section-home-add`）
- `section-label`（如 `Home-01`、`Home-02`）
- `toc` 显示名（如 `Home-01`）

> 默认不拆分文件，所有 section 放在一个 HTML 中，垂直堆叠。若 PRD 有核心用户流程或状态机，在第一个页面前增加 `F-01 流程总览`：它是独立图表区，不套设备外壳；流程节点须链接到对应页面 section，流程中没有对应页面的系统步骤仅展示为只读节点。

### 3. 为每个 section 构建 UI

参考 `references/css-components.md` 选择合适的 CSS 组件，不要随意 inline 替代或自造未列出的类名。

**UI 构建原则**：

- 使用真实示例数据，不用 `Lorem ipsum` 或空占位
- `app-sidebar` 和 `win-chrome-bar` 是所有主页 section 的标配
- 弹窗叠加态：在主内容上 `position:absolute; inset:0; z-index` 加遮罩 + `.form-dialog` + `.modal-close-x`
- 抽屉叠加态：在主内容上加遮罩 + 右侧抽屉面板
- 详情页：左上角加 `← 返回 {上级页面}` 链接
- 需要跨页/跨状态同步的关键文案必须显式绑定唯一且稳定的 `data-proto-edit="<key>"`；同一文案在多处出现时复用同一个 key。其他未显式绑定的 `.macos-window` 内可见文案由编辑运行时自动生成稳定路径 key 兜底；不得因有自动兜底就省略跨页同步文案的显式 key
- 输入框占位、tooltip、`aria-label` 等属性文案同时添加 `data-proto-edit-attr="placeholder|title|aria-label"`。图标、纯装饰、PRD 逻辑说明和布局结构不绑定编辑键
- 自动绑定范围包含产品页面外壳与对应 `.prd-panel` 功能说明；流程图、原型 TOC / section label 和编辑器自身 UI 保持只读

### 4. 为每个 section 写功能概览

先读 `references/prototype-logic.md`，再遵循 `references/prd-rules.md`。功能概览必须同时保留「组件与交互」和「逻辑说明」：

- **组件与交互**：只写用户需要特别关注的组件、操作和页面跳转；不要复述可一眼看出的纯静态样式
- **逻辑说明**：写清触发条件、系统判断、状态变化、数据更新/副作用和结果反馈
- **边界处理**：PRD 中定义的空态、异常、权限、频率限制或不可操作分支必须单列
- **优先用类名引用替代具体值描述**：不要写「展示一个紫色 #6366F1 圆角 8px 主按钮」，而写「展示主按钮（应用 `.btn-primary` 风格）」。视觉规范由 `theme.css` 与 `components.html` 沉淀，PRD / 旁注只引用类名
- **重复内容处理**：第一个 section 完整描述；后续 section 对相同通用结构用引用，只描述差异；业务逻辑不能因外壳复用而省略
- **顺手绑定 highlight**：按 `references/prd-highlight.md` 给 bullet 加 `data-target="<key>"`、给原型组件加 `data-comp="<key>"`，开启 PRD ↔ 原型 双向 hover 联动

### 5. 组装 HTML

参考 `references/html-structure.md` 的页面骨架模板，按顺序填入各 section。

`<head>` 内**必须带注入标记块**（包含 `editor`），页面自有样式写在标记块之外。写入用户指定目录下的 `{filename}.html` 后，跑一次注入脚本回填资产：

```bash
"$SKILL_DIR/assets/inject-assets.mjs" {user-dir}/{filename}.html
```

注入完成后必须执行文案编辑验收；失败时不得交付：

```bash
"$SKILL_DIR/scripts/validate-editor.mjs" {user-dir}/{filename}.html
```

## 输出文件

- **HTML 原型**：`{user-dir}/{name}.html`（包含全部 sections，自包含单文件，token / 通用组件样式由注入脚本回填）

## 验证

生成后检查：

1. HTML 文件可在浏览器直接打开（自包含，无本地文件依赖）；所需 `@proto-gen` 标记块均已回填、无空块
2. 各 section 都有 `toc-sidebar` 对应入口
3. `prd-panel` 的关键操作、状态和边界与输入 PRD 一致；不编造 PRD 未定义的规则
4. 输入 PRD 有流程或状态机时，HTML 顶部有 `F-01 流程总览`，且关键页面节点可跳转到对应 section
5. 没有使用 `references/css-components.md` 中未列出的自造类名
6. 必须运行 `scripts/validate-editor.mjs`；它逐个 section 检查 `[data-proto-edit]` 覆盖，任何含 `.macos-window` 的页面为 0 即失败
7. 验收脚本必须真实执行普通页与页面中实际存在的弹窗/抽屉编辑：修改 → 触发 input 保存 → 刷新恢复；不能只检查虚线边框或静态属性
8. 验收脚本必须逐页检查 `.prd-panel` 存在可编辑绑定，并真实修改功能说明后验证刷新恢复；同时反向检查 `.toc-sidebar`、`.flow-overview` 内的 `[data-proto-edit-auto]` 均为 0
9. 导出的评审版保留修改结果，且不包含编辑工具和编辑态属性
