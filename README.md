# DoorHardwareViewer
Door Hardware Viewer via IFC

IFC viewer plus hardware import: open a local IFC, inspect real geometry/properties, find/select doors, and import CSV/JSON hardware schedules through a validated preview. No compliance automation. Files stay in the browser; source IFC is unchanged.

## Run

Use Node 24 and npm:

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. Choose **Open IFC file**, or **Open example** for the included CC0 IFC4 pavilion. Drag to orbit, right-drag to pan, scroll to zoom. The door table focuses/highlights a door; clicking a rendered door selects its row. Use **Doors only** or **Transparent context** to reach interior doors. The inspector shows source attributes and instance/type property sets.

```sh
npm run build
npm run preview
```

Serve the complete `dist` folder over HTTP(S); no server processing or external CDN required. WebGL2, WebAssembly and secure-context Web Crypto required. On environments that restrict network interface enumeration, use `npm run dev -- --host 127.0.0.1` (or preview with the same option).

## Verify

```sh
npx playwright install --with-deps chromium
npm run build
npm test
```

Optional `CHROMIUM_PATH` uses an existing Chromium installation. Tests run against the production preview, with genuine IFC file uploads and rendered-canvas picking. CI runs build and browser tests.

- [Hardware import guide and normalized data dictionary](docs/HARDWARE-IMPORT.md)
- [Requirements, data dictionary, plan and checklist](docs/PRODUCT.md)
- [Viewer comparison and deployment decision](docs/VIEWER-DECISION.md)
- [Verification evidence and limitations](docs/TESTING.md)
- [Fixture provenance / CC0](public/fixtures/README.md)
- [Third-party notices](docs/THIRD-PARTY.md)

## Hardware import

Click **Hardware import**. Download the examples from the dialog, or use **Load JSON example**. For CSV, choose separate door-assignment, hardware-set and hardware-item files, read them, map columns, then **Validate & preview**. Errors block the entire import. **Apply entire import** appends validated records and saves locally; it never overwrites existing identifiers.

Multiple items can belong to one set and multiple doors can share it. Applied sets/items/assignments are readable in the dialog. **Download data backup** exports stable IDs and provenance; backup restore UI and explicit IFC matching are future work. Identifiers and leading zeros are preserved; no automatic model attachment is performed.

Windows PowerShell: if `npm` scripts are blocked, use `npm.cmd ci` and `npm.cmd run dev`.
