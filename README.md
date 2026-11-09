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

Because `.xmind` is read-only, the viewer offers **Convert to editable .mm**: it writes a sibling `.mm` file (asking before overwriting) and opens it for editing.

## Install

1. Clone this repository:

   ```bash
   git clone https://github.com/LoongYun/dsh-mindmap.git
   ```

2. In DSH, open **Plugins** → **Install bundle** and point it at the cloned directory. You can also ask an agent to call `plugin_manager install_bundle` with that path.
3. Reload the Harness window. If clicking a `.mm` file still opens the editor instead of this viewer, restart DSH once — the client injection list is read at startup. The save route and both agent tools live in the Host process, so restart DSH after installing or updating the bundle.

There is no build step: DSH loads `client.js` directly as a browser module.

## Usage

- Click a `.mm`, `.opml`, `.km`, `.vym` or `.xmind` file in the workspace file tree to open it in the right sidebar.
- Double-click a topic to rename it. `Tab` adds a child, `Enter` adds a sibling, `F2` renames, `Delete` deletes.
- Right-click a topic for a context menu: new child, new sibling, rename, collapse and delete.
- One floating bar at the bottom holds the controls: undo/redo, collapse-all, zoom out / percentage / zoom in, fit, format, save, convert and export.
- The format panel offers four structures (right, balanced, down, left) and three branch-line styles (curved, straight, elbow). These are view preferences, not written into the file.
- The lower-left corner starts with the small `EN` / `中` toggle, followed by the topic count, read-only note and unsaved state. The bar itself only holds the action buttons. It defaults to Chinese.
- `⌘Z` / `⇧⌘Z` undo and redo, `Space` collapses or expands, `Ctrl`/`⌘` + wheel zooms at the cursor, the wheel pans, drag to pan.
- `⌘S` or the save button in the bottom bar saves. `.xmind` has no save button; use **Convert to editable .mm** (writes a sibling file) or **Export to .mm** (download).

Saving overwrites editable files that already exist. The `.xmind` conversion is the one path that creates a new file, and only next to the original `.xmind`; it never overwrites without confirmation.

## Agent tools

The bundle also registers two host tools, so an agent can read and edit a map without moving raw XML through the conversation:

- `mindmap_outline({ path, includeNotes?, maxDepth? })` returns an indented outline with stable ids and the file version:

  ```text
  [n1] DSH Mind Map
    [n2] Formats
      [n3] XMind — read-only preview
  ```

- `mindmap_apply({ path, baseVersion, ops })` applies node-level changes atomically. Pass the version from `mindmap_outline`; if the file changed, nothing is written and the tool asks for a re-read.

  ```json
  [
    { "action": "add", "parent": "n2", "text": "New topic" },
    { "action": "rename", "id": "n3", "text": "Renamed" },
    { "action": "move", "id": "n5", "parent": "n2", "index": 0 },
    { "action": "remove", "id": "n11" }
  ]
  ```

Both tools accept workspace-relative or absolute paths. Writes are fenced by the session's sandbox policy: `workspace-write` confines them to the session workspace, full access does not. `.xmind` is readable but not writable; convert it to `.mm` first. The viewer does not watch the file, so close and reopen the tab to see an agent's edit.

## How it works

- The client half registers a native `sidebar.right.pane.tab` type with an extension-priority address glob that is longer than `dsh-resource://file/**`, so it outranks `dsh-better-sidebar`'s editor for these extensions while still coexisting with it.
- Files are read with `ctx.remote.workspaceFiles.readBytes`.
- Rendering is hand-written SVG: no third-party renderer and no bundling step.
- Saving goes through the host route `POST /dsh-mindmap/save`: connection fence, extension allow-list, 8 MiB body limit and an optimistic version check (`409` on conflict). The session's sandbox policy decides whether the target path is writable. When the route is unreachable, the viewer falls back to downloading the file.
- Performance guards: XMind archives only inflate `content.json` / `content.xml` (24 MiB per entry, 32 MiB total); text files over 8 MiB and maps over 20,000 topics are rejected. Panning moves the SVG transform without re-rendering, wheel zoom is frame-throttled, nodes are memoized, label measurements are cached, and undo history shrinks on large maps.

## Development

```bash
# install the working copy as a linked bundle in your DSH profile
plugin_manager install_bundle   # point the target at this directory
```

After editing `client.js` or `index.js`, reload the Harness window. `fixtures/` contains one sample of each format for manual regression checks.

## Limitations

- `.mmap`, `.mindnode` and `.emmx` are not supported.
- Hard limits: 8 MiB for text formats, 20,000 topics, 24 MiB per XMind content entry. Larger files are refused rather than frozen.
- Maps above 4,000 topics still render as one SVG; very large maps may feel slow even with the interaction optimizations.
- XMind is read-only; exporting to `.mm` drops XMind styling and rich content.
- In a very narrow sidebar, **Fit** shrinks the whole map considerably. Zoom in and pan for detail.

## License

MIT
