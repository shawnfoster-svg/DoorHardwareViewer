# Viewer decision — 2026-10-30

## Evaluation order and result
Evaluated That Open Components first using the current official IfcLoader tutorial and npm peer metadata, then compared xeokit as a credible full-viewer alternative. Chose a smaller composition: **That Open web-ifc 0.0.78 + Three.js 0.187.0**, both pinned in package-lock.json. This is an intentional low-level alternative, not a claim to be using Components.

| Option | Verified API / compatibility | License | Deployment and tradeoff |
| --- | --- | --- | --- |
| That Open Components 3.6.0 | IfcLoader.setup / load(Uint8Array,...); FragmentsManager.init(workerURL); model.useCamera and core.update. Peers: Three >=0.182.0, web-ifc >=0.0.77, camera-controls >=3.1.2, fragments ~3.6.0. Fragments 3.6.0 peers Three >=0.182.0 and web-ifc >=0.0.77. | Components and Fragments MIT; parser MPL-2.0 | Converts IFC into Fragments; needs version-matched Fragments worker plus matching parser WASM. Official tutorial permits self-hosting worker. Strong choice for a broader BIM tool, but adds conversion/worker APIs and a second data representation for this small slice. |
| xeokit SDK 2.6.114 | Official WebIFCLoaderPlugin accepts a web-ifc API and loads IFC geometry, metadata and property sets. Its example uses web-ifc 0.0.51; compatibility with current 0.0.78 was **not tested**, so not assumed. Official loader recommends preconverted XKT for large models. | AGPL-3.0 (commercial license also offered) | Direct IFC uses matching web-ifc WASM; XKT adds conversion workflow. More packaged viewer features, but licensing and old parser example add decisions unnecessary to this prototype. No paid license selected. |
| Chosen: web-ifc + Three | Installed official declarations verified: Init(locateFile, forceSingleThread), OpenModel, StreamAllMeshes, GetGeometry, vertex/index arrays, GetLine, GetLineIDsWithType, properties helpers, CloseModel. Three OrbitControls and raycasting use native Three meshes. No mutual peer constraint. Matching @types/three 0.186.0 passes strict typecheck against Three 0.187.0. | Parser MPL-2.0; Three MIT | Single-thread WASM imported from pinned parser package using Vite `?url`; emitted with hashed filename. No runtime CDN, Fragments conversion or worker. Simpler for small models, but geometry conversion blocks main thread and meshes are not optimized for huge buildings. |

## Schema support and boundaries
The installed parser's official schema declarations expose IFC2X3, IFC4 and IFC4X3. Components inherits parser/importer support; conversion class filters can omit elements (official tutorial explicitly warns of this). xeokit's direct loader inherits the parser version supplied to it; this comparison does not certify all schema/geometry combinations. **Only our IFC4 fixture is end-to-end tested here.** IFCZIP is not supported. Parser support does not guarantee every geometry representation or exporter defect is handled.

## WASM / worker requirements
Force single-thread via `Init(() => wasmUrl, true)`. Browser JS and WASM come from the same installed web-ifc package; do not replace one independently. Vite serves the WASM locally in dev and copies it into dist/assets for production. Host the entire dist folder over HTTP(S), with correct application/wasm MIME type, including assets and fixtures. Localhost is a secure context; production requires HTTPS for Web Crypto model fingerprints. Static hosting works; no upload backend, cross-origin isolation, COOP/COEP, or SharedArrayBuffer is required for this selected single-thread path. Modern WebGL2/WebAssembly browser required. Opening dist/index.html directly with file:// is unsupported.

A future worker parser would improve responsiveness, but must transfer geometry/property messages through the same adapter boundary. If Components is adopted later, self-host its version-matched worker and parser WASM; do not depend on the tutorial CDN URLs in production.

## Official sources checked
- Components tutorial and linked source: https://docs.thatopen.com/Tutorials/Components/Core/IfcLoader and https://github.com/ThatOpen/engine_components/blob/main/packages/core/src/fragments/IfcLoader/example.ts
- Components / Fragments version and peers: `npm view @thatopen/components version peerDependencies license`, `npm view @thatopen/fragments@3.6.0 peerDependencies license`.
- Parser README, examples, license and declarations: https://github.com/ThatOpen/engine_web-ifc ; installed `web-ifc/README.md`, `web-ifc-api.d.ts`, `ifc-schema.d.ts`, `helpers/properties.d.ts`, `LICENSE.md` (0.0.78).
- Three official package source / OrbitControls: https://github.com/mrdoob/three ; installed `three/examples/jsm/controls/OrbitControls.js`, package.json and LICENSE.
- xeokit official loader: https://github.com/xeokit/xeokit-sdk/blob/master/src/plugins/WebIFCLoaderPlugin/WebIFCLoaderPlugin.js ; https://github.com/xeokit/xeokit-sdk/blob/master/LICENSE ; `npm view @xeokit/xeokit-sdk version license dependencies`.

Source/API inspection caught an important behavior: `getPropertySets(..., includeTypeProperties=true)` returns type property sets **instead of** instance sets. Inspector combines both calls, then displays type properties separately. No source library modifications are made.
