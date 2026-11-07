# dsh-mindmap

English | [简体中文](README.zh-CN.md)

Open, edit and export mind maps in the [DeepSeek Harness](https://github.com/deepseek-ai) right sidebar.

## Formats

| Format | Open | Edit & save | Export `.mm` |
| --- | --- | --- | --- |
| `.xmind` (XMind 8 / Zen) | ✅ | read-only | ✅ |
| `.mm` (FreeMind) | ✅ | ✅ | ✅ |
| `.opml` | ✅ | ✅ | ✅ |
| `.km` (KityMinder) | ✅ | ✅ | ✅ |
| `.vym` (VYM) | ✅ | ✅ | ✅ |

For `.xmind`, the viewer reads either `content.json` (XMind Zen / XMind 8) or `content.xml` and keeps the topic hierarchy, notes and collapse state. XMind themes, relationship lines, attachments and other advanced content are not rendered, and exporting to `.mm` keeps only the structure.

Because `.xmind` is read-only, the toolbar offers **Convert to editable .mm**: it writes a sibling `.mm` file (asking before overwriting) and opens it for editing.

## Install

1. Clone this repository:

   ```bash
   git clone https://github.com/LoongYun/dsh-mindmap.git
   ```

2. In DSH, open **Plugins** → **Install bundle** and point it at the cloned directory. You can also ask an agent to call `plugin_manager install_bundle` with that path.
3. Reload the Harness window. If clicking a `.mm` file still opens the editor instead of this viewer, restart DSH once — the client injection list is read at startup.

There is no build step: DSH loads `client.js` directly as a browser module.

## Usage

- Click a `.mm`, `.opml`, `.km`, `.vym` or `.xmind` file in the workspace file tree to open it in the right sidebar.
- Double-click a topic to rename it. `Tab` adds a child, `Enter` adds a sibling, `F2` renames, `Delete` deletes.
- Right-click a topic for a context menu: new child, new sibling, rename, collapse and delete.
- The `EN` / `中` button at the right edge of the toolbar switches the interface language. It defaults to Chinese.
- `⌘Z` / `⇧⌘Z` undo and redo, `Space` collapses or expands, `Ctrl`/`⌘` + wheel zooms at the cursor, the wheel pans, drag to pan.
- `⌘S` or the toolbar button saves. `.xmind` has no save button; use **Convert to editable .mm** (writes a sibling file) or **Export to .mm** (download).

Saving overwrites editable files that already exist. The `.xmind` conversion is the one path that creates a new file, and only next to the original `.xmind`; it never overwrites without confirmation.

## How it works

- The client half registers a native `sidebar.right.pane.tab` type with an extension-priority address glob that is longer than `dsh-resource://file/**`, so it outranks `dsh-better-sidebar`'s editor for these extensions while still coexisting with it.
- Files are read with `ctx.remote.workspaceFiles.readBytes`.
- Rendering is hand-written SVG: no third-party renderer and no bundling step.
- Saving goes through the host route `POST /dsh-mindmap/save`: connection fence, workspace containment, extension allow-list, 8 MiB body limit and an optimistic version check (`409` on conflict). When the route is unreachable, the viewer falls back to downloading the file.

## Development

```bash
# install the working copy as a linked bundle in your DSH profile
plugin_manager install_bundle   # point the target at this directory
```

After editing `client.js` or `index.js`, reload the Harness window. `fixtures/` contains one sample of each format for manual regression checks.

## Limitations

- `.mmap`, `.mindnode` and `.emmx` are not supported.
- XMind is read-only; exporting to `.mm` drops XMind styling and rich content.
- In a very narrow sidebar, **Fit** shrinks the whole map considerably. Zoom in and pan for detail.

## License

MIT
