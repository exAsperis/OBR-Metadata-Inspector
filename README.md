# OBR Metadata Inspector

OBR Metadata Inspector is a GM-only Registry Editor–style browser and editor for Owlbear Rodeo metadata.

It covers room and scene metadata, current and connected players, persistent and local scene items, plus this extension origin's local and session browser storage. Other players are visible but read-only because the Owlbear SDK only permits a player to update their own metadata.

## Development

```sh
npm install
npm run dev
```

Add `http://localhost:5173/manifest.json` as a development extension in Owlbear Rodeo. The Vite server accepts Owlbear Rodeo's cross-origin iframe requests.

## Editing safety

- JSON is validated before every write, including duplicate object-key detection.
- Deletions and whole-source replacements require confirmation.
- A source is re-read immediately before saving; conflicting external changes block the write until you reload or explicitly force-save.
- Values are never logged, transmitted, or sent to telemetry.

## Production

`npm run build` creates the static extension in `dist/`. The manifest is configured for the `/OBR-Metadata-Inspector/` GitHub Pages path.

This independent extension is not affiliated with or endorsed by Owlbear Rodeo.
