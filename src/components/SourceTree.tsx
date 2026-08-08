import { useMemo, useState } from "react";
import { buildTree, filterTree, jsonType, previewValue, type JsonPath, type MetadataSource, type TreeNode } from "../metadata/model";

export interface Selection { sourceId: string; path: JsonPath; }
interface Props { sources: MetadataSource[]; query: string; selection: Selection | null; onSelect: (selection: Selection) => void; }

function NodeRow({ node, source, depth, openIds, setOpenIds, forceOpen, selection, onSelect }: {
  node: TreeNode; source: MetadataSource; depth: number; openIds: Set<string>; setOpenIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  forceOpen: boolean; selection: Selection | null; onSelect: (selection: Selection) => void;
}) {
  const expandable = node.children.length > 0; const open = expandable && (forceOpen || openIds.has(node.id));
  const selected = selection?.sourceId === source.id && JSON.stringify(selection.path) === JSON.stringify(node.path);
  const toggle = () => setOpenIds((previous) => { const next = new Set(previous); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; });
  return <li role="none">
    <div className={`tree-row ${selected ? "selected" : ""}`} style={{ "--depth": depth } as React.CSSProperties}>
      {expandable ? <button className="tree-toggle" aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`} aria-expanded={open} onClick={toggle}>{open ? "▾" : "▸"}</button> : <span className="tree-spacer" />}
      <button role="treeitem" aria-selected={selected} className="node-select" title={node.displayPath} onClick={() => onSelect({ sourceId: source.id, path: node.path })}
        onDoubleClick={() => expandable && toggle()}>
        <span className="node-name">{node.name}</span><span className="type-chip">{node.type}</span><span className="node-preview">{node.preview}</span>
      </button>
    </div>
    {open && <ul role="group">{node.children.map((child) => <NodeRow key={child.id} node={child} source={source} depth={depth + 1} openIds={openIds} setOpenIds={setOpenIds} forceOpen={forceOpen} selection={selection} onSelect={onSelect} />)}</ul>}
  </li>;
}

export function SourceTree({ sources, query, selection, onSelect }: Props) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set()); const forceOpen = query.trim().length > 0;
  const grouped = useMemo(() => {
    const map = new Map<string, MetadataSource[]>();
    for (const entry of sources) map.set(entry.group, [...(map.get(entry.group) ?? []), entry]);
    return [...map.entries()];
  }, [sources]);
  const allIds = useMemo(() => [...new Set(sources.map((entry) => `group:${entry.group}`)), ...sources.flatMap((entry) => {
    const collect = (nodes: TreeNode[]): string[] => nodes.flatMap((node) => [node.id, ...collect(node.children)]);
    return [`source:${entry.id}`, ...collect(buildTree(entry.value, entry.id))];
  })], [sources]);

  return <section className="tree-panel" aria-label="Metadata browser">
    <div className="tree-actions"><button className="text-button" onClick={() => setOpenIds(new Set(allIds))}>Expand all</button><button className="text-button" onClick={() => setOpenIds(new Set())}>Collapse all</button></div>
    <ul className="tree" role="tree" aria-label="Metadata sources">
      {grouped.map(([group, entries]) => {
        const groupId = `group:${group}`; const groupOpen = forceOpen || openIds.has(groupId);
        return <li role="none" key={group}>
          <div className="group-row"><button className="tree-toggle" aria-label={`${groupOpen ? "Collapse" : "Expand"} ${group}`} aria-expanded={groupOpen} onClick={() => setOpenIds((old) => { const next = new Set(old); if (next.has(groupId)) next.delete(groupId); else next.add(groupId); return next; })}>{groupOpen ? "▾" : "▸"}</button><strong>{group}</strong><span>{entries.length}</span></div>
          {groupOpen && <ul role="group">{entries.map((entry) => {
            const rootId = `source:${entry.id}`; const rootOpen = forceOpen || openIds.has(rootId);
            const rootSelected = selection?.sourceId === entry.id && selection.path.length === 0;
            const nodes = filterTree(buildTree(entry.value, entry.id), query);
            const sourceMatches = [entry.label, entry.description, entry.id].some((text) => text.toLowerCase().includes(query.trim().toLowerCase()));
            if (query.trim() && !sourceMatches && nodes.length === 0) return null;
            return <li role="none" key={entry.id}>
              <div className={`tree-row source-row ${rootSelected ? "selected" : ""}`} style={{ "--depth": 1 } as React.CSSProperties}>
                {nodes.length ? <button className="tree-toggle" aria-label={`${rootOpen ? "Collapse" : "Expand"} ${entry.label}`} aria-expanded={rootOpen} onClick={() => setOpenIds((old) => { const next = new Set(old); if (next.has(rootId)) next.delete(rootId); else next.add(rootId); return next; })}>{rootOpen ? "▾" : "▸"}</button> : <span className="tree-spacer" />}
                <button role="treeitem" aria-selected={rootSelected} disabled={!entry.available} className="node-select" onClick={() => onSelect({ sourceId: entry.id, path: [] })}>
                  <span className="node-name">{entry.label}</span><span className="type-chip">{jsonType(entry.value)}</span><span className="node-preview">{entry.available ? previewValue(entry.value) : entry.unavailableReason}</span>
                </button>
              </div>
              {rootOpen && <ul role="group">{nodes.map((node) => <NodeRow key={node.id} node={node} source={entry} depth={2} openIds={openIds} setOpenIds={setOpenIds} forceOpen={forceOpen} selection={selection} onSelect={onSelect} />)}{nodes.length === 0 && <li className="empty-node">No metadata keys</li>}</ul>}
            </li>;
          })}</ul>}
        </li>;
      })}
    </ul>
  </section>;
}
