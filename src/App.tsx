import { useMemo, useState } from "react";
import { SourceTree, type Selection } from "./components/SourceTree";
import { StatusPanel } from "./components/StatusPanel";
import { MetadataConflictError, useMetadataSources } from "./hooks/useMetadataSources";
import { formatJson, parseJson } from "./metadata/json";
import { addChild, deepEqual, deleteAtPath, formatPath, getAtPath, jsonType, replaceAtPath, type JsonValue } from "./metadata/model";

interface EditState { selection: Selection; baselineRoot: JsonValue; expectedRoot: JsonValue; draft: string; }
interface PendingConflict { sourceId: string; expected: JsonValue; next: JsonValue; }

export default function App() {
  const { status, sources, error, refreshing, refresh, save } = useMetadataSources();
  const [query, setQuery] = useState(""); const [edit, setEdit] = useState<EditState | null>(null);
  const [validation, setValidation] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false); const [conflict, setConflict] = useState<PendingConflict | null>(null);
  const selectedSource = useMemo(() => sources.find((entry) => entry.id === edit?.selection.sourceId), [sources, edit?.selection.sourceId]);
  const parsedDraft = useMemo(() => { try { return edit ? parseJson(edit.draft) : undefined; } catch { return undefined; } }, [edit]);
  const candidateRoot = useMemo(() => {
    if (!edit || parsedDraft === undefined) return undefined;
    try { return replaceAtPath(edit.baselineRoot, edit.selection.path, parsedDraft); } catch { return undefined; }
  }, [edit, parsedDraft]);
  const dirty = Boolean(edit && candidateRoot && !deepEqual(candidateRoot, edit.expectedRoot));

  const choose = (selection: Selection) => {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    const source = sources.find((entry) => entry.id === selection.sourceId); if (!source) return;
    setEdit({ selection, baselineRoot: source.value, expectedRoot: source.value, draft: formatJson(getAtPath(source.value, selection.path)) }); setValidation(null); setNotice(null); setConflict(null);
  };

  const changeDraft = (text: string) => {
    setEdit((current) => current ? { ...current, draft: text } : current);
    try { parseJson(text); setValidation(null); } catch (cause) { setValidation(cause instanceof Error ? cause.message : "Invalid JSON."); }
  };

  const commit = async (force = false, pending?: PendingConflict) => {
    if (!edit || !selectedSource) return; let value: JsonValue; let nextSelection = edit.selection;
    try {
      if (pending) {
        try { value = getAtPath(pending.next, edit.selection.path); }
        catch { value = pending.next; nextSelection = { sourceId: edit.selection.sourceId, path: [] }; }
      } else value = parseJson(edit.draft);
      setValidation(null);
    }
    catch (cause) { setValidation(cause instanceof Error ? cause.message : "Invalid JSON."); return; }
    const nextRoot = pending?.next ?? replaceAtPath(edit.baselineRoot, edit.selection.path, value);
    if (edit.selection.path.length === 0 && !window.confirm("Replace this entire metadata object? Keys missing from the editor will be deleted.")) return;
    setSaving(true); setNotice(null);
    try {
      await save(selectedSource.id, pending?.expected ?? edit.expectedRoot, nextRoot, force);
      setEdit({ selection: nextSelection, baselineRoot: nextRoot, expectedRoot: nextRoot, draft: formatJson(value) }); setConflict(null); setNotice("Saved.");
    } catch (cause) {
      if (cause instanceof MetadataConflictError) setConflict({ sourceId: selectedSource.id, expected: edit.expectedRoot, next: nextRoot });
      else setNotice(cause instanceof Error ? cause.message : "Save failed.");
    } finally { setSaving(false); }
  };

  const revert = () => {
    if (!edit) return;
    try { setEdit({ ...edit, baselineRoot: edit.expectedRoot, draft: formatJson(getAtPath(edit.expectedRoot, edit.selection.path)) }); }
    catch { const parent = edit.selection.path.slice(0, -1); setEdit({ selection: { ...edit.selection, path: parent }, baselineRoot: edit.expectedRoot, expectedRoot: edit.expectedRoot, draft: formatJson(getAtPath(edit.expectedRoot, parent)) }); }
    setValidation(null); setNotice(null);
  };
  const add = () => {
    if (!edit) return; const target = getAtPath(edit.baselineRoot, edit.selection.path);
    const key = Array.isArray(target) ? undefined : window.prompt("Property name"); if (!Array.isArray(target) && key === null) return;
    try {
      const result = addChild(edit.baselineRoot, edit.selection.path, key ?? undefined);
      const storage = selectedSource?.kind === "local-storage" || selectedSource?.kind === "session-storage";
      const baselineRoot = storage ? replaceAtPath(result.root, result.childPath, "") : result.root;
      setEdit({ selection: { sourceId: edit.selection.sourceId, path: result.childPath }, baselineRoot, expectedRoot: edit.expectedRoot, draft: storage ? '""' : "null" });
      setNotice("New child added to the draft. Save to apply it.");
    }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Unable to add child."); }
  };
  const remove = async () => {
    if (!edit || !selectedSource || !window.confirm(edit.selection.path.length ? "Delete this metadata value and all of its children?" : "Delete every key in this metadata source?")) return;
    const next = deleteAtPath(edit.baselineRoot, edit.selection.path); setSaving(true);
    try { await save(selectedSource.id, edit.expectedRoot, next); setEdit(null); setNotice("Deleted."); }
    catch (cause) { if (cause instanceof MetadataConflictError) setConflict({ sourceId: selectedSource.id, expected: edit.expectedRoot, next }); else setNotice(cause instanceof Error ? cause.message : "Delete failed."); }
    finally { setSaving(false); }
  };

  if (status === "connecting") return <StatusPanel title="Connecting to Owlbear Rodeo" message="Waiting for the room SDK to become ready…" />;
  if (status === "restricted") return <StatusPanel title="GM access required" message="Only the room GM can inspect or modify metadata." onRetry={() => void refresh()} />;
  if (status === "error") return <StatusPanel title="Metadata unavailable" message={error ?? "Unable to initialize the inspector."} onRetry={() => void refresh()} />;

  const selectedValue = edit ? getAtPath(edit.baselineRoot, edit.selection.path) : null;
  const canAdd = selectedSource?.editable && selectedValue !== null && typeof selectedValue === "object";
  return <main className="app-shell">
    <header className="app-header"><div><span className="eyebrow">Owlbear Rodeo</span><h1>Metadata Inspector</h1></div><button className="secondary-button" disabled={refreshing || saving} onClick={() => void refresh()}>{refreshing ? "Refreshing…" : "Refresh"}</button></header>
    <div className="search-row"><label className="search-control"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, paths, types, values" aria-label="Search metadata" /></label></div>
    {notice && <div className="notice" role="status">{notice}</div>}
    <SourceTree sources={sources} query={query} selection={edit?.selection ?? null} onSelect={choose} />
    <section className="editor-panel" aria-label="Value editor">
      {edit && selectedSource ? <>
        <div className="editor-heading"><div><span className="eyebrow">{selectedSource.group}</span><h2>{edit.selection.path.length ? String(edit.selection.path.at(-1)) : selectedSource.label}</h2></div><span className="type-chip">{jsonType(selectedValue!)}</span></div>
        <div className="selected-path" title={formatPath(selectedSource.id, edit.selection.path)}>{formatPath(selectedSource.id, edit.selection.path)}</div>
        <p className="source-description">{selectedSource.description}{!selectedSource.editable && " · Read-only"}</p>
        <textarea aria-label="JSON value" spellCheck={false} readOnly={!selectedSource.editable} value={edit.draft} onChange={(event) => changeDraft(event.target.value)} />
        {validation && <div className="validation" role="alert">{validation}</div>}
        {conflict && <div className="conflict" role="alert"><strong>External change detected</strong><span>Reload the current value or overwrite it with your draft.</span><div><button onClick={() => { const current = sources.find((entry) => entry.id === conflict.sourceId); if (!current) return; try { setEdit({ selection: edit.selection, baselineRoot: current.value, expectedRoot: current.value, draft: formatJson(getAtPath(current.value, edit.selection.path)) }); } catch { setEdit({ selection: { sourceId: current.id, path: [] }, baselineRoot: current.value, expectedRoot: current.value, draft: formatJson(current.value) }); } setConflict(null); }}>Reload current</button><button className="danger-button" onClick={() => void commit(true, conflict)}>Force save</button></div></div>}
        <div className="editor-actions"><button className="secondary-button" disabled={!dirty || saving} onClick={revert}>Revert</button><button className="secondary-button" disabled={!canAdd || saving} onClick={add}>Add child</button><button className="danger-button" disabled={!selectedSource.editable || saving} onClick={() => void remove()}>Delete</button><button disabled={!selectedSource.editable || !dirty || Boolean(validation) || saving} onClick={() => void commit()}>{saving ? "Saving…" : "Save"}</button></div>
      </> : <div className="editor-empty"><span aria-hidden="true">⌘</span><strong>Select a metadata source or value</strong><small>Its complete JSON value will appear here.</small></div>}
    </section>
    <footer>GM only · No external requests · Changes apply directly to Owlbear Rodeo</footer>
  </main>;
}
