import { describe, expect, it } from "vitest";
import { addChild, buildTree, deleteAtPath, filterTree, formatPath, getAtPath, replaceAtPath } from "./model";

describe("metadata model", () => {
  const value = { namespace: { enabled: true, values: [1, "two"] } };
  it("builds stable paths and previews", () => {
    const tree = buildTree(value, "room");
    expect(tree[0].displayPath).toBe("room.namespace");
    expect(tree[0].children[1].children[1].displayPath).toBe("room.namespace.values[1]");
  });
  it("gets and immutably replaces nested values", () => {
    const next = replaceAtPath(value, ["namespace", "enabled"], false);
    expect(getAtPath(next, ["namespace", "enabled"])).toBe(false);
    expect(value.namespace.enabled).toBe(true);
  });
  it("adds object and array children and rejects duplicates", () => {
    const added = addChild(value, ["namespace"], "newKey");
    expect(getAtPath(added.root, added.childPath)).toBeNull();
    expect(() => addChild(value, ["namespace"], "enabled")).toThrow(/already exists/);
    const appended = addChild(value, ["namespace", "values"]);
    expect(appended.childPath).toEqual(["namespace", "values", 2]);
  });
  it("deletes object keys and compacts arrays", () => {
    expect(getAtPath(deleteAtPath(value, ["namespace", "enabled"]), ["namespace", "enabled"])).toBeUndefined();
    expect(getAtPath(deleteAtPath(value, ["namespace", "values", 0]), ["namespace", "values"])).toEqual(["two"]);
  });
  it("filters names, values, types, and descendants", () => {
    const result = filterTree(buildTree(value, "room"), "two");
    expect(result[0].children[0].children[0].name).toBe("1");
    expect(filterTree(buildTree(value, "room"), "boolean")).toHaveLength(1);
  });
  it("quotes unsafe path segments", () => expect(formatPath("room", ["a.b", 2])).toBe('room["a.b"][2]'));
});
