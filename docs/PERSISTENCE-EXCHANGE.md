# Persistence, portable review exchange and model replacement

## Working storage

The application now stores the working project and one cached source IFC File in **IndexedDB** (`door-hardware-review`, database version 1). The working project, model metadata, cached file and revision token are committed in one read/write transaction. UI state is published only after `transaction.oncomplete`. Validation, aborted writes, quota errors and stale-tab conflicts leave the previous committed review intact. Strict durability is requested; browser/OS crash behavior and eviction are still subject to the browser.

On refresh the app waits for storage initialization, restores the saved project and reopens the cached local IFC. Its SHA-256 must match the saved active model identity before associations are displayed. Only the current IFC is cached; historical models retain inventories/fingerprints, not all source files. Camera position, selection, filters, markers and temporary Hide/Unhide settings reset. Working review content (hardware, model associations, submitted comments, statuses, provenance and reconciliation records) persists. Unsaved comment drafts survive panel rerenders during a save; only comments submitted with Add comment are persisted.

Opening a different IFC registers a new content fingerprint and inventory. It does not transfer any association. Returning to the exact same source bytes restores the original associations, independent of filename. Re-exported files receive a different fingerprint even if their names are identical.

Existing `localStorage['dhv.hardware-project.v1']` data migrates automatically only when no IndexedDB working review exists. The saved graph is validated, IDs/provenance are preserved, and the original key is removed only after the IndexedDB transaction commits. Malformed legacy data is retained with imports blocked; recovery export retains the original text. If a legacy copy remains after a removal failure, an existing IndexedDB working entry remains authoritative so old data does not resurrect.

## Portable exchange

Choose **Review package** in the toolbar:

1. **Export review package** downloads a JSON document containing the full application graph, source-file names and SHA-256 fingerprints, model inventories, hardware and source provenance, model assignments, review statuses/comments/history and all unresolved reconciliation plans.
2. The manifest explicitly says **`ifcFileIncluded: false`**. This version never embeds IFC bytes. Keep/send the source IFC separately. The recipient is asked to reopen the source IFC with the matching fingerprint; an unrelated file receives no associations. Hardware import's **Download data backup** now exports this same package format.
3. Select a JSON file and **Preview package**. The app validates the manifest, supported versions, record references and model metadata. Review counts and fingerprints before checking the replacement acknowledgement and clicking **Restore package**.
4. Restore replaces the working graph atomically and clears the cached IFC/viewer. It preserves stable data IDs, original source/provenance, original timestamps and unresolved records. The local concurrency revision advances; it is not treated as imported business identity. Package import does not merge or overwrite individual records opportunistically.
5. Reopen the matching IFC. Its fingerprint gates all model associations. A restored package without an open IFC still exposes saved hardware data and package/reconciliation metadata.
6. **Clear working storage** requires its own explicit checkbox. It writes an empty review and removes the cached IFC atomically; legacy migration storage is cleaned up afterward. Export first if the current review is needed. This is a UI action, not an automatic consequence of imports or model opening.

**Acceptance check:** add an assignment/status/comment, refresh, export, clear, restore the package, then reopen the original IFC. The assignment/status/comment and provenance should return. Open an unrelated IFC: none of those associations should appear there.

## Controlled model replacement

Open the candidate IFC normally first. In **Review package → Controlled model replacement**, choose the original reviewed model and **Create reconciliation plan**. This saves a queue without changing any assignments. Old model records, histories, original imports and scopes are retained.

| Result | Decision |
| --- | --- |
| One GlobalId in each inventory and identical captured door signatures | Eligible for **Transfer unchanged exact matches**, after reviewer initiates that action. |
| GlobalId survives but captured geometry/scalar properties differ | `changed`; requires explicit manual target confirmation. |
| GlobalId missing in candidate | `missing`; never fall back to mark or position. |
| Duplicate/missing/invalid GlobalId in either inventory | `ambiguous`; cannot silently choose an occurrence. Only a target with a unique valid GlobalId can receive a manual transfer. |
| Candidate already has assignment, review or binding | `conflict`; protected from overwrite. |
| Legacy source has no captured inventory | Treat surviving IDs as `changed`/unknown; no claim of identical doors. |

All original doors and reviewed/bound door references are considered. A GlobalId is a reconciliation candidate, **not proof that a re-export preserved the correct door**. Each captured signature hashes its name/tag, exposed scalar source attributes/single-value properties, geometry buffers and mesh transforms. The comparison is conservative: reordered triangulation, floating-point differences or a different coordinate origin can send otherwise equivalent geometry to manual review. Complex IFC property types are not fully compared. Material/appearance-only changes and every possible IFC semantic change are not certified by this signature.

The controlled bulk transfer revalidates eligibility and occupancy at application time. It copies current assignments, statuses and comments onto new model-door identities, preserving the original model records. New copied record IDs are generated; original source records/IDs remain archived and the replacement history links source and target identities, review IDs, plan and matching method. Historical events remain with their original model and timestamps.

For unresolved rows, explicitly select the target by its GlobalId and **Confirm manual transfer**. A changed GlobalId can therefore be reconciled manually. The saved plan records the source ID, target ID, method and resolution timestamp. Unresolved rows remain in IndexedDB and packages across refresh/export/import. No transfer occurs by door mark or geometry proximity. Original schedule scopes/bindings remain on the source model rather than being silently rewritten. Target assignments preserve their source schedule record reference when one exists; the archived binding is included in the replacement audit event.

Opening another model, importing a package or resetting the viewer invalidates the active model view. Revision checks and atomic storage protect against stale reconciliation actions or conflicting tabs. Multiple users/tabs editing simultaneously is not a supported collaboration feature.

## Schema and migration policy

- **IndexedDB database version 1:** creates one `working` object store. Working state and current source File occupy separate keys in the same transaction. Version-change events close old connections and ask for reload; blocked upgrades report a useful error.
- **Review package version 1:** `format: "dhv-review"`, `packageVersion: 1`, exported timestamp, explicit IFC exclusion, active model identity, source-file manifests, full `project` graph. See [review-package-v1.schema.json](../schemas/review-package-v1.schema.json).
- **Application schemaVersion 1 / workflow version 1:** compatible additive `models`, `activeModelIdentity` and `replacements` fields extend prior data. No IDs are renumbered during legacy migration or package restore. Original import-format schema is separate and still version 1.
- **Legacy raw application backup v1:** accepted only through explicit package preview/restore. Missing model inventories are marked `inventoryComplete: false`, with unknown filename/schema metadata and the known association fingerprint. Geometry/inventory is never invented. Reopen the corresponding source to capture a verified inventory.
- **Unknown/future versions:** rejected with no mutation; no best-effort downgrade or ignored review/status fields. IFC-included package variants are currently rejected. Graph and manifest checks run in addition to JSON structural schema rules.
- Each future incompatible version needs an explicit, tested migration. The original graph remains recoverable on failed validation/write. No automatic migration across model fingerprints occurs.

## Current limitations

No IFC embedding in JSON, multi-review merge, remote storage, concurrent collaboration, login or automated compliance. A package is not signed/authenticated; fingerprints identify source bytes, not who authored the package. The current model uses exact file-content identity, not a separate cross-revision logical building ID. Legacy scope history may lack a source inventory until its exact IFC is reopened.

Browser storage is origin-specific. Changing hostname/port/browser, clearing site data, private browsing, browser quota/eviction and device loss can remove or hide local data. Export packages and keep original IFCs separately. Large IFCs/schedules and repeated model inventories can consume substantial storage/memory; no streaming or large-model benchmark is claimed. Parsing/signature computation still runs on the main thread. UI view settings are not part of the review package.

No new dependency was added. Native IndexedDB documentation checked: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB , https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event , and https://www.w3.org/TR/IndexedDB/ . The installed TypeScript DOM declarations compile the transaction/version-change APIs used here.
