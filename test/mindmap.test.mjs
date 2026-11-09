import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  applyOps,
  countNodes,
  outlineTree,
  parseText,
  parseXmind,
  serialize,
} from '../lib/mindmap.js'

const fixture = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url))
const text = (name) => fixture(name).toString('utf8')

test('parses every fixture format', () => {
  const expected = { 'demo.mm': 12, 'demo.opml': 6, 'demo.km': 6, 'demo.vym': 5 }
  for (const [name, count] of Object.entries(expected)) {
    const doc = parseText(text(name), `.${name.split('.').pop()}`)
    assert.equal(countNodes(doc.sheets[0].root), count, name)
  }
  const xmind = parseXmind(fixture('demo.xmind'))
  assert.equal(countNodes(xmind.sheets[0].root), 6)
})

test('mm round-trip keeps text, notes and collapsed state', () => {
  const doc = parseText(text('demo.mm'), '.mm')
  const again = parseText(serialize({ format: 'mm', sheets: doc.sheets }), '.mm')
  assert.equal(countNodes(again.sheets[0].root), 12)
  assert.equal(outlineTree(again.sheets[0].root, { includeNotes: true }).text.includes('stored in the map'), true)
})

test('applyOps adds, renames, moves and removes by id', () => {
  const doc = parseText(text('demo.mm'), '.mm')
  const result = applyOps(doc.sheets[0].root, [
    { action: 'add', parent: 'n2', text: 'Added & <ok>' },
    { action: 'rename', id: 'n3', text: 'Renamed' },
    { action: 'move', id: 'n5', parent: 'n2', index: 0 },
    { action: 'remove', id: 'n11' },
  ])
  const again = parseText(serialize({ format: 'mm', sheets: [{ title: 'x', root: result.root }] }), '.mm')
  const outline = outlineTree(again.sheets[0].root)
  assert.match(outline.text, /Renamed/)
  assert.match(outline.text, /Added & <ok>/)
  assert.equal(outline.count, 12)
  assert.equal(result.created.length, 1)
})

test('applyOps rejects invalid edits', () => {
  const root = parseText(text('demo.mm'), '.mm').sheets[0].root
  assert.throws(() => applyOps(root, [{ action: 'remove', id: 'n1' }]), /cannot remove the root/)
  assert.throws(() => applyOps(root, [{ action: 'move', id: 'n2', parent: 'n3' }]), /own subtree/)
  assert.throws(() => applyOps(root, [{ action: 'rename', id: 'n99', text: 'x' }]), /not found/)
  assert.throws(() => applyOps(root, [{ action: 'add', parent: 'n1', text: '  ' }]), /text is required/)
  assert.throws(() => applyOps(root, [{ action: 'explode' }]), /unknown action/)
})
