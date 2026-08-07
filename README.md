<p align="center">
  <img src="docs/assets/logo.webp" alt="Chara Desk 徽标" width="132">
</p>

<h1 align="center">Chara Desk</h1>

<p align="center">
  <sub>
    🌐&nbsp;
    <b>简体中文</b>
    &nbsp;·&nbsp; <a href="README.en.md">English</a>
  </sub>
</p>

<p align="center">
  <em>Claude Code 的桌宠与本地工作台。</em>
</p>

<p align="center">
  <sub>实时桌宠 · 用量看板 · 供应商切换 · Skills / Plugins / MCP 管理 — Windows</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-4c566a?style=flat-square" alt="许可证：MIT">
  &nbsp;
  <img src="https://img.shields.io/badge/Windows-10%2F11%20x64-4c8492?style=flat-square&logo=windows&logoColor=white" alt="Windows 10/11 x64">
  &nbsp;
  <a href="https://github.com/Renakoni/minatoaqua-code-pet/releases/latest"><img src="https://img.shields.io/github/v/release/Renakoni/minatoaqua-code-pet?style=flat-square&color=c98a4b&label=release&include_prereleases" alt="最新发布版本"></a>
</p>

<p align="center">
  <a href="#功能">功能</a> ·
  <a href="#安装">安装</a> ·
  <a href="#从源码构建">从源码构建</a> ·
  <a href="#许可证与署名">许可证</a>
</p>

> [!NOTE]
> **非官方粉丝作品** —— 默认桌宠形象为凑阿库娅（Minato Aqua）相关二次创作，角色版权归 COVER Corp. 所有；本项目与 COVER、Anthropic 均无关联，详见[许可证与署名](#许可证与署名)。

---

## 简介

Chara Desk 是一个面向 Claude Code 的 Windows 桌面应用，由桌宠和本地工作台两部分组成。

桌宠接收 Claude Code hooks 的会话开始、工具调用、任务完成、报错和权限请求等事件，并用动画实时响应。主题包兼容 [codex-pet](https://codex-pet.org) 格式。

本地工作台整合了 Token 用量、会话历史、供应商切换，以及 Skills / Plugins / MCP 管理和配置档案。所有统计与配置管理均在本地完成。

---

## 功能

### 桌宠

- 一键安装 Claude Code hooks，并提供连接诊断与修复。
- 会话开始、工具调用、任务完成、报错等事件会实时触发动画，也可以为每类事件自定义动作。
- Claude Code 请求权限时，桌面会弹出操作卡片，可直接允许或拒绝，无需切回终端。
- 可按事件类型分别设置通知规则。

<p align="center">
  <img src="docs/screenshots/permission.webp" alt="权限请求卡片" width="320">
</p>

### 宠物主题 · 兼容 codex-pet

- 兼容 [codex-pet](https://codex-pet.org) 主题包，支持本地导入和在线图库安装，完美适配宠物拖拽动作。
- 内置凑阿库娅默认主题。

<p align="center">
  <img src="docs/screenshots/themes.webp" alt="从图库一键安装 codex-pet 宠物包" width="720">
</p>

### 供应商切换 · 兼容 cc-switch

- 完整兼容 [cc-switch](https://github.com/farion1231/cc-switch)，本机供应商配置自动同步，编辑与切换体验保持一致。
- 切换前自动备份 Claude 设置，写入失败不会破坏原有配置。

<p align="center">
  <img src="docs/screenshots/providers.webp" alt="供应商切换" width="720">
</p>

### Skills / Plugins / MCP 工作台

- 集中管理个人 Skills、用户级 Plugins 和全局 MCP 服务器，无需逐个编辑配置文件。
- 配置档案：将一套 Skills + Plugins + MCP 保存为模板，一键整体切换。自动备份，随时回退。

<p align="center">
  <img src="docs/screenshots/profiles.webp" alt="配置档案与模板切换" width="720">
</p>

### 用量看板

- 通过 Token 热力图、模型排行和项目排行查看用量与成本估算，数据直接来自本地 `~/.claude`。
- 查看工具调用次数、会话数和活跃时段等运行统计。
- 浏览历史会话，也可一键恢复。

<p align="center">
  <img src="docs/screenshots/data.webp" alt="用量看板" width="720">
</p>

### 隐私

- 所有统计均在本地计算；hook 转发器只传递事件元数据，不上传会话内容或密钥。
- 可一键遮罩界面中的敏感路径与内容。

---

## 安装

需要 **Windows 10 / 11 x64**、本机已安装 [Claude Code](https://claude.com/claude-code)，以及 `PATH` 上的 [Node.js](https://nodejs.org/)（hook 转发依赖系统 Node）。

1. 从 [Releases](https://github.com/Renakoni/minatoaqua-code-pet/releases/latest) 下载 `CharaDesk-Setup-*.exe` 并安装。
2. alpha 版本尚未签名，SmartScreen 提示时选择「更多信息 → 仍要运行」。
3. 启动后在「总览」里一键安装 hooks，重新开一个 Claude Code 会话即可。

---

## 从源码构建

```powershell
npm install
npm run dev:electron   # 开发模式（Vite 热更新）
npm run dist:win       # 构建 Windows 安装包，输出到 release/
```

提交改动前：`npm test`、`npm run typecheck`。其余脚本见 `package.json`。

---

## 许可证与署名

代码基于 [MIT 许可证](LICENSE) 发布。

这是一个**非官方**粉丝项目：

- **凑阿库娅（Minato Aqua）** —— 默认主题中的形象素材为二次创作，角色版权归 COVER Corp. 及原绘制者所有，仅限非商业使用，并遵循 [hololive 二次创作指南](https://hololivepro.com/terms/)。
- **Clawd Companion** —— 本项目的部分界面与事件链路演化自 [Clawd Companion](https://github.com/Doulor/Clawd-Companion)（MIT © Doulor）。

## 致谢

特别感谢 [Clawd Companion](https://github.com/Doulor/Clawd-Companion) 带来的早期启发，Chara Desk 的桌宠界面与事件链路由此起步。

[Claude Code](https://claude.com/claude-code) 提供的 hooks 与权限交互能力，是桌宠实时响应和权限卡片得以实现的基础。

供应商兼容离不开 [cc-switch](https://github.com/farion1231/cc-switch)，宠物主题生态则来自 [codex-pet](https://codex-pet.org) 的开放格式与在线图库。

Chara Desk 使用 [Electron](https://www.electronjs.org/)、[React](https://react.dev/) 与 [Vite](https://vite.dev/) 构建，并使用 [LiteLLM](https://github.com/BerriAI/litellm) 的模型价格数据进行本地成本估算。感谢这些项目及其开发者。

---

<p align="center"><sub><em>Claude Code 的桌宠与本地工作台。</em></sub></p>
