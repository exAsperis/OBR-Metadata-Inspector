import type { JsonValue } from "./model";

class DuplicateKeyParser {
  private index = 0;
  constructor(private readonly text: string) {}
  check() { this.value(); this.ws(); if (this.index !== this.text.length) throw new Error("Invalid JSON."); }
  private ws() { while (/\s/.test(this.text[this.index] ?? "")) this.index++; }
  private value() {
    this.ws(); const char = this.text[this.index];
    if (char === "{") return this.object();
    if (char === "[") return this.array();
    if (char === '"') { this.string(); return; }
    const match = this.text.slice(this.index).match(/^(true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (!match) throw new Error("Invalid JSON.");
    this.index += match[0].length;
  }
  private string(): string {
    const start = this.index++;
    while (this.index < this.text.length) {
      const char = this.text[this.index++];
      if (char === "\\") this.index++;
      else if (char === '"') return JSON.parse(this.text.slice(start, this.index)) as string;
    }
    throw new Error("Unterminated JSON string.");
  }
  private object() {
    this.index++; this.ws(); const keys = new Set<string>();
    if (this.text[this.index] === "}") { this.index++; return; }
    while (true) {
      this.ws(); if (this.text[this.index] !== '"') throw new Error("Object keys must be strings.");
      const key = this.string();
      if (keys.has(key)) throw new Error(`Duplicate object key: “${key}”.`);
      keys.add(key); this.ws();
      if (this.text[this.index++] !== ":") throw new Error("Expected a colon after an object key.");
      this.value(); this.ws(); const next = this.text[this.index++];
      if (next === "}") return;
      if (next !== ",") throw new Error("Expected a comma between object properties.");
    }
  }
  private array() {
    this.index++; this.ws();
    if (this.text[this.index] === "]") { this.index++; return; }
    while (true) {
      this.value(); this.ws(); const next = this.text[this.index++];
      if (next === "]") return;
      if (next !== ",") throw new Error("Expected a comma between array values.");
    }
  }
}

export function parseJson(text: string): JsonValue {
  new DuplicateKeyParser(text).check();
  const value: unknown = JSON.parse(text);
  if (value === undefined || typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    throw new Error("The value is not JSON-compatible.");
  }
  return value as JsonValue;
}

export function formatJson(value: JsonValue) { return JSON.stringify(value, null, 2); }
