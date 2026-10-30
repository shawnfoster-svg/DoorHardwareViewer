# Hardware import — version 1

## Use the feature

Choose **Hardware import** from the viewer toolbar. Loading an IFC is optional for importing schedule data. The dialog links to downloadable examples in `public/templates`.

For CSV choose separate **Door assignments**, **Hardware sets**, and **Hardware items** files. One or more tables may be provided. Explicit hardware-set definitions must exist in the batch or previously applied data; sets are never invented from a misspelled reference. Use the third, small sets CSV to define new sets.

For JSON choose a package with `schemaVersion: 1`; arrays are `doors`, `hardwareSets`, `hardwareItems`, `assignments`. Door records may contain `hardwareSetId` as shorthand for an assignment, or use the separate assignments array. Do not do both for the same door. JSON identifiers must be quoted strings; numerical identifiers are rejected rather than guessed.

1. **Read selected files.** Source text is held locally, without application changes.
2. Check CSV column mappings. Exact canonical headers map automatically; each source column can map to at most one application field. Unmapped columns are retained as extras. JSON uses canonical field names.
3. **Validate & preview.** All mapped rows and row-level errors are displayed, followed by proposed counts and zero replacements.
4. Correct file errors and read/preview again. **Any error blocks the entire batch.** Invalid rows are never silently skipped. **Download staged report** retains the source text, mappings, errors and preview for correction.
5. **Apply entire import** explicitly appends the validated batch. Existing business identifiers or assignments produce errors; no implicit merge, update or overwrite is supported.

A set can have multiple line items. Multiple schedule doors can reference the same set. Applied data displays each set, its items and its assigned door marks.

## Data dictionary / normalization

`src/hardware/model.ts` is the versioned application model. `schemas/hardware-import-v1.schema.json` documents the external JSON package; graph validation (unique keys, positive quantity, references) runs in code in addition to structural constraints.

| Entity | Stable application identity | Business fields / links |
| --- | --- | --- |
| DoorSchedule | `id` UUID | `doorMark` required unique string; `ifcGlobalId`, `level` optional strings. `modelIdentity` is null until a future explicit IFC binding. |
| HardwareSet | `id` UUID | `hardwareSetId` required unique string; optional `description`. |
| HardwareItem | `id` UUID | `itemId` required unique string across all sets; `hardwareSetRecordId` references HardwareSet.id; positive numeric `quantity`; optional `unit`, `category`, `manufacturer`, `productCode`, `description`, `finish`, `notes`. |
| Assignment | `id` UUID | `doorRecordId` references DoorSchedule.id; `hardwareSetRecordId` references HardwareSet.id. At most one assignment per door in v1. |
| ReviewRecord | `id` UUID | `doorRecordId`; status enum; optional explicit `modelIdentity` + `ifcGlobalId` model reference. Separate from imported schedule and hardware data. Editing UI is not implemented. |
| ReviewComment | `id` UUID | `reviewRecordId`, text, createdAt. Separate from reviews. Editing UI is not implemented. |
| ImportBatch | `id` UUID | Imported timestamp, source files (name, format, full text, source UUID), column mappings and unknown document metadata. |

Every imported record also has `extra` (unrecognized source fields with original value types) and `provenance` (batch/source IDs, source table, logical record row, complete original parsed row). A Door CSV's hardwareSetId is normalized into Assignment; it is preserved in raw provenance rather than duplicated as a mutable door field. Inline JSON assignments follow the same rule.

The project envelope is `{schemaVersion:1, revision, doors, hardwareSets, hardwareItems, assignments, reviews, comments, imports}`. Review/comment arrays begin empty. Generated UUIDs stay stable across mapping previews, apply, browser reopen and backup exports; reimport is not a way to regenerate or replace existing records. Future schema changes require explicit migration; unsupported JSON versions are rejected.

## Required values and validation

- CSV door-assignment rows require `doorMark` and `hardwareSetId`. JSON doors require `doorMark`, and may remain unassigned when using a separate assignment table.
- Hardware sets require `hardwareSetId`. Items require `itemId`, `hardwareSetId`, `quantity`. Explicit assignments require `doorMark`, `hardwareSetId` and both referenced records.
- Identifiers remain strings, including `001`, `0007`, product codes, item IDs, levels and finishes. Required whitespace-only values fail; leading/trailing whitespace in identifiers is flagged for explicit correction. Matching is exact and case-sensitive.
- Quantity accepts a positive finite JSON number or ordinary decimal string (e.g. `3`, `0.5`). Zero, negative, NaN, Infinity, exponent-form CSV strings and unit-suffixed quantities fail. Original source values remain in provenance.
- Duplicate door marks, nonempty IFC GlobalIds, set IDs, item IDs, and door assignments fail within a batch or against existing data. Missing set/door references fail. Shared references to one valid set are expected and allowed.
- Blank/duplicate CSV headers, malformed quotes, wrong cell counts, blank interior records, and mapping collisions fail. A final newline is not a record. CSV row numbering is **logical record index including the header**; multiline fields can span physical lines. JSON rows are 1-based array indices. Original full source text preserves even malformed records.
- Unknown JSON fields are preserved. Reviews/comments are explicitly rejected by this import format; they cannot bypass review validation through a hardware package.

## Storage and model boundary

Applied hardware data is stored under `dhv.hardware-project.v1` in localStorage for this origin. A write must succeed before the application publishes the new state; quota/security failure keeps the previous project and staged source intact. A changed storage value from another tab blocks apply. The saved graph is validated on load; damaged/unsupported data blocks imports and remains untouched. Downloading a backup in that state downloads the original stored text for recovery.

**Download data backup** exports the complete versioned application graph, stable IDs and provenance. A backup restore/import UI is not part of this slice; keep the backup for future restoration or manual recovery. The input JSON example is an import package, not a project backup. No data is uploaded. Browser clearing/private mode, changing hostname/port or using another browser can remove or hide local data; export a backup for safekeeping.

Imported schedule references are **not automatically attached to rendered IFC doors**. Source ifcGlobalId is only a candidate until model identity and matching are explicitly reviewed. The IFC remains unchanged. No proximity matching, hardware compliance, review editing or collaboration is implemented.

## Parser decision and limits

Papa Parse 5.7.0 (MIT) is pinned. Official documentation checked: https://www.papaparse.com/docs . `dynamicTyping:false` preserves identifier strings; positional parsing preserves access to surplus cells and detects header collisions rather than allowing automatic header renaming to hide ambiguity. Comma delimiter is explicit. Quoted commas, double-quote escapes and multiline fields are supported. No worker/WASM is needed for this parser. UTF-8/BOM input is supported; semicolon CSV, legacy encoding selection, streaming and large-file performance are outside this slice.

JSON parsing, CSV parsing, preview and localStorage run in browser memory. Provenance increases storage use, so large schedules can exceed browser quota; this is reported as an unapplied import. There is no partial apply or overwrite/update mode. Pretty property presentation for the IFC inspector remains separate work.
