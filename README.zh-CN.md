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
- 底部悬浮工具栏放撤销/重做、全部折叠、缩小 / 百分比 / 放大、适应窗口，以及格式按钮。
- 格式面板提供四种结构（向右、双向、向下、向左）和三种分支线（曲线、直线、折线）。这些只是查看偏好，不会写进文件。
- 顶部工具栏最右侧的 `EN` / `中` 按钮切换界面语言，默认中文。
- `⌘Z` / `⇧⌘Z` 撤销重做，空格折叠/展开，`Ctrl`/`⌘` + 滚轮以光标为中心缩放，滚轮平移，拖拽平移。
- `⌘S` 或工具栏按钮保存。`.xmind` 没有保存按钮，使用 **转为可编辑 .mm**（生成同级文件）或 **导出为 .mm**（下载）。

保存只覆盖**已存在**的可编辑文件；`.xmind` 的转换是唯一会新建文件的路径，且只在原文件旁边创建，覆盖前必须确认。

## Agent 工具

这个 bundle 还注册了两个 Host 工具，让我可以直接“读结构、改结构”，不需要把整份 XML 搬进对话：

- `mindmap_outline({ path, includeNotes?, maxDepth? })` 返回带稳定 id 的缩进大纲和文件版本：

  ```text
  [n1] DSH Mind Map
    [n2] 支持的格式
      [n3] XMind —— 只读预览
  ```

- `mindmap_apply({ path, baseVersion, ops })` 按节点 id 原子地应用修改。把 `mindmap_outline` 返回的版本传回来；文件已变化时不会写入，而是要求重新读取。

  ```json
  [
    { "action": "add", "parent": "n2", "text": "新主题" },
    { "action": "rename", "id": "n3", "text": "新标题" },
    { "action": "move", "id": "n5", "parent": "n2", "index": 0 },
    { "action": "remove", "id": "n11" }
  ]
  ```

两个工具都接受工作区相对路径或绝对路径，并执行与保存路由相同的工作区包含校验。`.xmind` 可读不可写，需要先转为 `.mm`。
查看器不会监听文件变化，agent 改完后关闭再打开 tab 即可看到结果。

## 实现

- 浏览器半区注册原生 `sidebar.right.pane.tab` 类型，匹配模式是比 `dsh-resource://file/**` 更长的扩展名 glob，
  优先级 `extension`，因此可以和 `dsh-better-sidebar` 的 `editor` 共存并优先接管这几种文件。
- 文件通过 `ctx.remote.workspaceFiles.readBytes` 读取。
- 渲染是手写 SVG，没有第三方渲染器，也没有打包步骤。
- 保存走 Host 路由 `POST /dsh-mindmap/save`：连接 fence、工作区包含校验、扩展名白名单、
  8 MiB 上限、乐观版本冲突检测（`409`）。路由不可达时退化为下载文件。
- 性能保护：XMind 只解压 `content.json` / `content.xml`（单条 24 MiB、总计 32 MiB）；文本超过 8 MiB、
  主题超过 20,000 个会被拒绝。拖拽只改 SVG transform、不重渲染；滚轮缩放按帧节流；节点使用 memo；
  文字测量有缓存；大图的撤销历史会自动缩短。

## 开发

```bash
# 把工作副本作为 link 安装到当前 DSH profile
plugin_manager install_bundle   # target 指向本目录
```

改完 `client.js` / `index.js` 后刷新窗口即可。`fixtures/` 里有五种格式的样例文件，可用于手动回归。

## 已知限制

- 不支持 `.mmap`、`.mindnode`、`.emmx`。
- 硬上限：文本 8 MiB、20,000 个主题、XMind 单条内容 24 MiB；超过时明确拒绝，而不是卡死。
- 超过 4,000 个主题的大图仍会一次性渲染为 SVG，交互优化后仍可能偏慢。
- XMind 只读；导出的 `.mm` 会丢失 XMind 的样式和富内容。
- 侧栏很窄时，“适应窗口”会把整张图缩得比较小，可滚轮放大后平移查看细节。

## License

MIT
