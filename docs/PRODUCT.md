# IFC Door Hardware Review — slice 1

## Product requirements
Open one local IFC building model, find the correct door by tag/name/GlobalId or geometry, and inspect source information. Keep the source IFC unchanged. Local browser processing, no login, uploads, paid service, shared server or compliance automation. Hardware imports, comments, status and save/reopen of review records are future slices.

## Data dictionary

| Field | Meaning and rules |
| --- | --- |
| modelIdentity | SHA-256 of exact source IFC bytes, prefixed `sha256:`. A changed/re-exported file is a different model; future migration must be explicit. |
| globalId | IFC GlobalId from source, nullable. Together with modelIdentity this is the future association key. Duplicate/missing values are flagged, never silently matched. |
| ifcClass | Schema class returned by web-ifc (e.g. IfcDoor). |
| name / tag | Source Name / Tag. Optional and not unique identifiers. No matching by proximity. |
| key | Session selection handle. Equal to unique GlobalId when valid; random UUID for missing/duplicate values. Never persist this handle. |
| attributes | Resolved IFC attributes for inspection only. Raw source reference numbers may appear in diagnostic JSON; never use them as application identity. |
| propertySets / typeProperties | Source instance and type property sets / type objects, resolved recursively. Displayed without interpreting compliance. |

The adapter owns all web-ifc model handles, EXPRESS lookup tables, meshes and renderer IDs. No application association records exist yet. Future persistence must use `{modelIdentity, globalId}` and refuse invalid identities; it must not serialize `key`, source reference numbers, or meshes.

## Implementation plan
1. **Complete:** inspect repository; preserve original README history; choose/version viewer engine; add TypeScript/Vite app and genuine IFC fixture.
2. **Complete:** file loading, navigation, bidirectional door selection, element inspector, search, doors-only / transparent context, loading and error handling.
3. **Complete:** production build, browser acceptance tests, test evidence and limitations.
4. **Next, separate authorization/slice:** import schema, lossless CSV/JSON parsing and explicit association preview; no hardware import in slice 1.
5. Later: review comments/status and versioned save/reopen, with round-trip fixtures and model identity checks.

## Acceptance checklist
- [x] Real local IFC file loading; example uses the same loader.
- [x] Orbit, pan, zoom, fit.
- [x] Rendered element selection; class, GlobalId, Name, Tag, attributes and property sets.
- [x] Searchable IfcDoor table; row highlights and focuses geometry.
- [x] Canvas door selection synchronizes selected table row (clears search to reveal it).
- [x] Doors-only isolation and transparent context.
- [x] Loading, invalid-file, engine/WebGL and inspection error states.
- [x] Adapter boundary; model fingerprint + GlobalId identity design.
- [x] Original CC0 IFC4 fixture with two doors and properties.
- [x] Production build and browser verification (see TESTING.md).
- [ ] Hardware import, review workflow persistence (deliberately out of scope).

## Slice 2 — hardware import

The hardware import slice is now implemented. Its model, field requirements, validation and usage are detailed in [HARDWARE-IMPORT.md](HARDWARE-IMPORT.md). Slice 1's original scope above is retained as history.

- [x] Versioned, normalized door schedule, hardware sets, line items and assignments; separate review/comment model.
- [x] Stable application UUIDs; string business identifiers and leading zeros.
- [x] Separate CSV tables and versioned JSON package; downloadable examples.
- [x] CSV mapping, all-row preview, row-level errors and proposed import counts.
- [x] Missing fields, invalid quantity, duplicates and nonexistent references block the entire batch.
- [x] Preserve unknown fields, complete source text, row provenance and mappings.
- [x] Explicit append-only apply; no silent overwrite or invalid-row discard.
- [x] Local applied-data persistence and full data/provenance export; storage errors preserve prior state.
- [ ] Explicit IFC matching/binding, backup restore UI, review/comment editing (future slices).

## Slice 3 — model association and manual review

Implemented; see [ASSOCIATION-REVIEW.md](ASSOCIATION-REVIEW.md) for the workflow, matching rules, additive versioned data dictionary and limits.

- [x] Manual model-door assignment, reassignment, removal, and all set items.
- [x] Model-scoped status/comments and append-only change history.
- [x] Assignment and review filters; labels plus color.
- [x] Explicit source-model confirmation, exact GUID and configurable exact IFC-property matching.
- [x] Unique exact matches only; duplicate/ambiguous/unmatched/conflicting records stay queued.
- [x] Manual queue resolution by explicit target GlobalId, plus protected unlink/correction.
- [x] Optional clickable markers with offscreen, occlusion, overlap and count controls.
- [x] Two real IFC doors with the same mark cannot silently receive hardware.
- [ ] Backup restore UI, complex/composite property matching and revision migration (future work).
