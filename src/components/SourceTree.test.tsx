import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MetadataSource } from "../metadata/model";
import { SourceTree } from "./SourceTree";

const sources: MetadataSource[] = [
  { id: "room", kind: "room", group: "Room", label: "Room Metadata", description: "Room", value: { namespace: { enabled: true } }, editable: true, available: true },
  { id: "player:other", kind: "player", group: "Players", label: "Another Player", description: "PLAYER", value: { secret: 4 }, editable: false, available: true },
];

describe("SourceTree", () => {
  it("expands groups and selects a source", () => {
    const onSelect = vi.fn(); render(<SourceTree sources={sources} query="" selection={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Room" }));
    fireEvent.click(screen.getByRole("treeitem", { name: /Room Metadata/ }));
    expect(onSelect).toHaveBeenCalledWith({ sourceId: "room", path: [] });
  });
  it("searches nested values and exposes matching ancestors", () => {
    render(<SourceTree sources={sources} query="true" selection={null} onSelect={() => undefined} />);
    expect(screen.getByRole("treeitem", { name: /enabled/ })).toBeTruthy();
  });
  it("keeps read-only sources selectable for inspection", () => {
    render(<SourceTree sources={sources} query="Another" selection={null} onSelect={() => undefined} />);
    expect((screen.getByRole("treeitem", { name: /Another Player/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
