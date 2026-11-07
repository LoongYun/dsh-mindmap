# dsh-mindmap

[English](README.md) | 简体中文

在 [DeepSeek Harness](https://github.com/deepseek-ai) 右侧栏直接打开、编辑和导出思维导图文件。

## 支持的格式

| 格式 | 打开 | 编辑并保存 | 导出 `.mm` |
| --- | --- | --- | --- |
| `.xmind`（XMind 8 / Zen） | ✅ | 只读 | ✅ |
| `.mm`（FreeMind） | ✅ | ✅ | ✅ |
| `.opml` | ✅ | ✅ | ✅ |
| `.km`（KityMinder） | ✅ | ✅ | ✅ |
| `.vym`（VYM） | ✅ | ✅ | ✅ |

`.xmind` 会读取 `content.json`（XMind Zen / XMind 8）或 `content.xml`，保留主题层级、备注和折叠状态。
XMind 的主题样式、关系线、附件等高级内容不会渲染，导出 `.mm` 时也只保留结构。

因为 `.xmind` 只读，工具栏提供 **转为可编辑 .mm**：在源文件旁生成一个 `.mm`（覆盖前会确认），然后直接打开编辑。

## 安装

1. 克隆本仓库：

   ```bash
   git clone https://github.com/LoongYun/dsh-mindmap.git
   ```

2. 在 DSH 中打开 **插件（Plugins）** → **安装 bundle（Install bundle）**，指向克隆下来的目录。
   也可以让 agent 用这个路径调用 `plugin_manager install_bundle`。
3. 刷新 Harness 窗口。若点击 `.mm` 仍进入编辑器而不是本查看器，重启一次 DSH —— client 注入列表在启动时读取。

无需构建：`client.js` 由 DSH 直接作为浏览器模块加载。

## 使用

- 在工作区文件树中点击 `.mm`、`.opml`、`.km`、`.vym` 或 `.xmind`，即可在右侧栏打开。
- 双击主题重命名；`Tab` 新建子主题，`Enter` 新建同级主题，`F2` 重命名，`Delete` 删除。
- 右键主题可打开菜单：新建子主题、新建同级主题、重命名、折叠、删除。
- 工具栏最右侧的 `EN` / `中` 按钮切换界面语言，默认中文。
- `⌘Z` / `⇧⌘Z` 撤销重做，空格折叠/展开，`Ctrl`/`⌘` + 滚轮以光标为中心缩放，滚轮平移，拖拽平移。
- `⌘S` 或工具栏按钮保存。`.xmind` 没有保存按钮，使用 **转为可编辑 .mm**（生成同级文件）或 **导出为 .mm**（下载）。

保存只覆盖**已存在**的可编辑文件；`.xmind` 的转换是唯一会新建文件的路径，且只在原文件旁边创建，覆盖前必须确认。

## 实现

- 浏览器半区注册原生 `sidebar.right.pane.tab` 类型，匹配模式是比 `dsh-resource://file/**` 更长的扩展名 glob，
  优先级 `extension`，因此可以和 `dsh-better-sidebar` 的 `editor` 共存并优先接管这几种文件。
- 文件通过 `ctx.remote.workspaceFiles.readBytes` 读取。
- 渲染是手写 SVG，没有第三方渲染器，也没有打包步骤。
- 保存走 Host 路由 `POST /dsh-mindmap/save`：连接 fence、工作区包含校验、扩展名白名单、
  8 MiB 上限、乐观版本冲突检测（`409`）。路由不可达时退化为下载文件。

## 开发

```bash
# 把工作副本作为 link 安装到当前 DSH profile
plugin_manager install_bundle   # target 指向本目录
```

改完 `client.js` / `index.js` 后刷新窗口即可。`fixtures/` 里有五种格式的样例文件，可用于手动回归。

## 已知限制

- 不支持 `.mmap`、`.mindnode`、`.emmx`。
- XMind 只读；导出的 `.mm` 会丢失 XMind 的样式和富内容。
- 侧栏很窄时，“适应窗口”会把整张图缩得比较小，可滚轮放大后平移查看细节。

## License

MIT
