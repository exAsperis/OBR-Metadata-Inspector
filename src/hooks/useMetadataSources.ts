import OBR, { type Item, type Metadata, type Player } from "@owlbear-rodeo/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { deepEqual, type JsonValue, type MetadataSource } from "../metadata/model";

type Status = "connecting" | "ready" | "restricted" | "error";
export class MetadataConflictError extends Error { constructor() { super("This metadata changed outside the inspector."); } }

function jsonValue(value: unknown): JsonValue {
  const serialized = JSON.stringify(value ?? {});
  if (serialized === undefined) throw new Error("Metadata contains an unsupported value.");
  return JSON.parse(serialized) as JsonValue;
}

function source(id: string, kind: MetadataSource["kind"], group: string, label: string, description: string,
  value: unknown, editable = true, available = true, unavailableReason?: string): MetadataSource {
  return { id, kind, group, label, description, value: jsonValue(value), editable, available, unavailableReason };
}

function itemSource(item: Item, local: boolean): MetadataSource {
  const group = local ? "Local Items" : "Items";
  const kind = local ? "local-item" : "item";
  const suffix = [item.type, item.layer, item.id].filter(Boolean).join(" · ");
  return source(`${kind}:${item.id}`, kind, group, item.name || `Unnamed ${item.type.toLowerCase()}`, suffix, item.metadata);
}

function playerSource(player: Player, currentId: string): MetadataSource {
  const current = player.id === currentId;
  const label = `${player.name || "Unnamed player"}${current ? " (you)" : ""}`;
  return source(`player:${player.id}`, "player", "Players", label, `${player.role} · ${player.id}`,
    player.metadata, current);
}

function storageSource(storage: Storage, session: boolean): MetadataSource {
  const value: Record<string, JsonValue> = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index); if (key !== null) value[key] = storage.getItem(key) ?? "";
  }
  return source(session ? "storage:session" : "storage:local", session ? "session-storage" : "local-storage",
    "Browser Storage", session ? "Session Storage" : "Local Storage",
    session ? "Extension-origin storage for this browser tab" : "Extension-origin storage for this browser", value);
}

function metadataPatch(previous: JsonValue, next: JsonValue): Record<string, unknown> {
  if (previous === null || Array.isArray(previous) || typeof previous !== "object" ||
      next === null || Array.isArray(next) || typeof next !== "object") {
    throw new Error("The root metadata value must be an object.");
  }
  const patch: Record<string, unknown> = { ...next };
  for (const key of Object.keys(previous)) if (!Object.hasOwn(next, key)) patch[key] = undefined;
  return patch;
}

function replaceStorage(storage: Storage, next: JsonValue) {
  if (next === null || Array.isArray(next) || typeof next !== "object") throw new Error("Browser storage must be an object.");
  const wanted = new Set(Object.keys(next));
  for (const key of Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key !== null)) {
    if (!wanted.has(key)) storage.removeItem(key);
  }
  for (const [key, value] of Object.entries(next)) {
    if (typeof value !== "string") throw new Error("Browser storage values must be strings.");
    storage.setItem(key, value);
  }
}

function setThemeVariables(theme: Awaited<ReturnType<typeof OBR.theme.getTheme>>) {
  const root = document.documentElement; root.dataset.theme = theme.mode.toLowerCase();
  root.style.setProperty("--obr-primary", theme.primary.main);
  root.style.setProperty("--obr-primary-contrast", theme.primary.contrastText);
  root.style.setProperty("--obr-bg", theme.background.default);
  root.style.setProperty("--obr-paper", theme.background.paper);
  root.style.setProperty("--obr-text", theme.text.primary);
  root.style.setProperty("--obr-muted", theme.text.secondary);
}

async function loadSources(): Promise<MetadataSource[]> {
  const currentId = await OBR.player.getId();
  const [room, currentMetadata, currentName, currentRole, party, sceneReady] = await Promise.all([
    OBR.room.getMetadata(), OBR.player.getMetadata(), OBR.player.getName(), OBR.player.getRole(), OBR.party.getPlayers(), OBR.scene.isReady(),
  ]);
  const current = { id: currentId, connectionId: currentId, name: currentName, role: currentRole, color: "", syncView: false,
    metadata: currentMetadata } as Player;
  const players = [...party.filter((player) => player.id !== currentId), current].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const result: MetadataSource[] = [source("room", "room", "Room", "Room Metadata", "Shared across the current room", room)];
  if (!sceneReady) {
    result.push(source("scene", "scene", "Scene", "Scene Metadata", "No scene is currently open", {}, false, false, "Open a scene to inspect scene metadata."));
  } else {
    const [sceneMetadata, items, localItems] = await Promise.all([OBR.scene.getMetadata(), OBR.scene.items.getItems(), OBR.scene.local.getItems()]);
    result.push(source("scene", "scene", "Scene", "Scene Metadata", "Shared with the current scene", sceneMetadata));
    result.push(...items.map((item) => itemSource(item, false)), ...localItems.map((item) => itemSource(item, true)));
  }
  result.push(...players.map((player) => playerSource(player, currentId)));
  try { result.push(storageSource(window.localStorage, false)); } catch { result.push(source("storage:local", "local-storage", "Browser Storage", "Local Storage", "Storage is unavailable", {}, false, false, "Browser local storage is unavailable.")); }
  try { result.push(storageSource(window.sessionStorage, true)); } catch { result.push(source("storage:session", "session-storage", "Browser Storage", "Session Storage", "Storage is unavailable", {}, false, false, "Browser session storage is unavailable.")); }
  return result;
}

async function writeSource(source: MetadataSource, next: JsonValue) {
  const patch = metadataPatch(source.value, next);
  if (source.kind === "room") await OBR.room.setMetadata(patch as Partial<Metadata>);
  else if (source.kind === "scene") await OBR.scene.setMetadata(patch as Partial<Metadata>);
  else if (source.kind === "player") await OBR.player.setMetadata(patch as Partial<Metadata>);
  else if (source.kind === "item" || source.kind === "local-item") {
    const itemId = source.id.slice(source.id.indexOf(":") + 1);
    const api = source.kind === "item" ? OBR.scene.items : OBR.scene.local;
    await api.updateItems([itemId], (items) => { if (items[0]) items[0].metadata = next as Metadata; });
  } else replaceStorage(source.kind === "local-storage" ? window.localStorage : window.sessionStorage, next);
}

export function useMetadataSources() {
  const [status, setStatus] = useState<Status>("connecting");
  const [sources, setSources] = useState<MetadataSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const active = useRef(false); const refreshTimer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!active.current) return; setRefreshing(true);
    try {
      const role = await OBR.player.getRole();
      if (role !== "GM") { setSources([]); setStatus("restricted"); return; }
      setSources(await loadSources()); setError(null); setStatus("ready");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load metadata."); setStatus("error"); }
    finally { if (active.current) setRefreshing(false); }
  }, []);

  const scheduleRefresh = useCallback(() => {
    window.clearTimeout(refreshTimer.current); refreshTimer.current = window.setTimeout(() => void refresh(), 80);
  }, [refresh]);

  const save = useCallback(async (sourceId: string, expected: JsonValue, next: JsonValue, force = false) => {
    const latest = await loadSources(); const current = latest.find((entry) => entry.id === sourceId);
    if (!current) throw new Error("This metadata source no longer exists.");
    if (!current.editable) throw new Error("This metadata source is read-only.");
    if (!force && !deepEqual(current.value, expected)) { setSources(latest); throw new MetadataConflictError(); }
    await writeSource(current, next); await refresh();
  }, [refresh]);

  useEffect(() => {
    active.current = true; let cleanups: (() => void)[] = []; let ready = false;
    const timeout = window.setTimeout(() => { if (!ready && active.current) { setError("Owlbear SDK did not become ready. Open this page as an extension."); setStatus("error"); } }, 8000);
    if (window.self === window.top) { setError("Open this extension inside an Owlbear Rodeo room."); setStatus("error"); return () => { active.current = false; }; }
    OBR.onReady(async () => {
      ready = true; window.clearTimeout(timeout);
      try { setThemeVariables(await OBR.theme.getTheme()); cleanups.push(OBR.theme.onChange(setThemeVariables)); } catch { /* system theme remains usable */ }
      cleanups.push(OBR.room.onMetadataChange(scheduleRefresh), OBR.scene.onMetadataChange(scheduleRefresh),
        OBR.scene.onReadyChange(scheduleRefresh), OBR.party.onChange(scheduleRefresh), OBR.player.onChange(scheduleRefresh),
        OBR.scene.items.onChange(scheduleRefresh), OBR.scene.local.onChange(scheduleRefresh));
      window.addEventListener("storage", scheduleRefresh); void refresh();
    });
    return () => { active.current = false; window.clearTimeout(timeout); window.clearTimeout(refreshTimer.current); cleanups.forEach((cleanup) => cleanup()); window.removeEventListener("storage", scheduleRefresh); };
  }, [refresh, scheduleRefresh]);

  return { status, sources, error, refreshing, refresh, save };
}
