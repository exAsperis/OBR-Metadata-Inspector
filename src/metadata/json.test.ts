import { describe, expect, it } from "vitest";
import { formatJson, parseJson } from "./json";

describe("JSON validation", () => {
  it("parses every JSON root type", () => { expect(parseJson("null")).toBeNull(); expect(parseJson('"x"')).toBe("x"); expect(parseJson("[1,true]")).toEqual([1, true]); });
  it("rejects duplicate keys at any depth", () => { expect(() => parseJson('{"a":1,"a":2}')).toThrow(/Duplicate/); expect(() => parseJson('{"a":{"b":1,"b":2}}')).toThrow(/Duplicate/); });
  it("rejects malformed JSON", () => expect(() => parseJson('{"a":}')).toThrow());
  it("formats values", () => expect(formatJson({ a: 1 })).toBe('{\n  "a": 1\n}'));
});
