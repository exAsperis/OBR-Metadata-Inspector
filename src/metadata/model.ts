export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonPath = (string | number)[];

export type SourceKind = "room" | "scene" | "player" | "item" | "local-item" | "local-storage" | "session-storage";

export interface MetadataSource {
  id: string;
  kind: SourceKind;
  group: string;
  label: string;
  description: string;
  value: JsonValue;
  editable: boolean;
  available: boolean;
  unavailableReason?: string;
}

export interface TreeNode {
  id: string;
  name: string;
  path: JsonPath;
  displayPath: string;
  type: string;
  preview: string;
  value: JsonValue;
  children: TreeNode[];
}

export function jsonType(value: JsonValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function previewValue(value: JsonValue, limit = 72): string {
  let text: string;
  if (Array.isArray(value)) text = `Array(${value.length})`;
  else if (value !== null && typeof value === "object") text = `Object(${Object.keys(value).length})`;
  else text = JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function segmentText(segment: string | number) {
  if (typeof segment === "number") return `[${segment}]`;
  return /^[A-Za-z_$][\w$]*$/.test(segment) ? `.${segment}` : `[${JSON.stringify(segment)}]`;
}

export function formatPath(source: string, path: JsonPath): string {
  return source + path.map(segmentText).join("");
}

export function buildTree(value: JsonValue, sourceId: string, path: JsonPath = []): TreeNode[] {
  const entries: [string | number, JsonValue][] = Array.isArray(value)
    ? value.map((child, index) => [index, child])
    : value !== null && typeof value === "object"
      ? Object.entries(value)
      : [];
  return entries.map(([key, child]) => {
    const childPath = [...path, key];
    return {
      id: `${sourceId}:${JSON.stringify(childPath)}`,
      name: String(key),
      path: childPath,
      displayPath: formatPath(sourceId, childPath),
      type: jsonType(child),
      preview: previewValue(child),
      value: child,
      children: buildTree(child, sourceId, childPath),
    };
  });
}

export function getAtPath(root: JsonValue, path: JsonPath): JsonValue {
  return path.reduce<JsonValue>((current, key) => {
    if (current === null || typeof current !== "object") throw new Error("Path does not exist.");
    return (current as JsonValue[] & Record<string, JsonValue>)[key as never];
  }, root);
}

export function replaceAtPath(root: JsonValue, path: JsonPath, next: JsonValue): JsonValue {
  if (path.length === 0) return next;
  const [head, ...tail] = path;
  if (Array.isArray(root)) {
    if (typeof head !== "number" || head < 0 || head >= root.length) throw new Error("Array path does not exist.");
    const copy = [...root];
    copy[head] = replaceAtPath(copy[head], tail, next);
    return copy;
  }
  if (root !== null && typeof root === "object" && typeof head === "string" && Object.hasOwn(root, head)) {
    return { ...root, [head]: replaceAtPath(root[head], tail, next) };
  }
  throw new Error("Object path does not exist.");
}

export function deleteAtPath(root: JsonValue, path: JsonPath): JsonValue {
  if (path.length === 0) return {};
  const [head, ...tail] = path;
  if (tail.length === 0) {
    if (Array.isArray(root) && typeof head === "number") return root.filter((_, index) => index !== head);
    if (root !== null && !Array.isArray(root) && typeof root === "object" && typeof head === "string") {
      const copy = { ...root }; delete copy[head]; return copy;
    }
    throw new Error("Path does not exist.");
  }
  if (Array.isArray(root) && typeof head === "number") {
    const copy = [...root]; copy[head] = deleteAtPath(copy[head], tail); return copy;
  }
  if (root !== null && !Array.isArray(root) && typeof root === "object" && typeof head === "string") {
    return { ...root, [head]: deleteAtPath(root[head], tail) };
  }
  throw new Error("Path does not exist.");
}

export function addChild(root: JsonValue, path: JsonPath, key?: string): { root: JsonValue; childPath: JsonPath } {
  const target = getAtPath(root, path);
  if (Array.isArray(target)) {
    const childPath = [...path, target.length];
    return { root: replaceAtPath(root, path, [...target, null]), childPath };
  }
  if (target !== null && typeof target === "object") {
    const name = key?.trim();
    if (!name) throw new Error("A property name is required.");
    if (Object.hasOwn(target, name)) throw new Error(`“${name}” already exists.`);
    return { root: replaceAtPath(root, path, { ...target, [name]: null }), childPath: [...path, name] };
  }
  throw new Error("Children can only be added to objects and arrays.");
}

export function deepEqual(a: JsonValue, b: JsonValue) { return JSON.stringify(a) === JSON.stringify(b); }

export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return nodes;
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, query);
    const matches = [node.name, node.displayPath, node.type, node.preview]
      .some((field) => field.toLocaleLowerCase().includes(needle));
    return matches || children.length ? [{ ...node, children }] : [];
  });
}
