> Persistence update: working reviews now use IndexedDB, portable review packages can be restored, and model replacement is controlled. See [PERSISTENCE-EXCHANGE.md](PERSISTENCE-EXCHANGE.md). Earlier storage/restore limitations below describe previous slices.

# Association and review — slice 3

## Quick check

1. Open your IFC (or Open example), then import the hardware example if it is not already saved.
2. Select a door. **Hardware & review** shows its model GlobalId, assignment, all set items (expand an item for every field), review status, comments and change history. Assign/reassign a set using its ID, or remove it explicitly. These actions save immediately in the same browser.
3. Choose a status: **Not reviewed, In review, Accepted, Changes required**; click **Save status**. Add comments separately. Assignment/status history is append-only. This prototype identifies actions as local reviewer edits; there is no authenticated author identity.
4. Door table filters combine assignment and review status. Labels accompany status colors. Selecting a door in the model clears filters to reveal its table row.
5. To connect imported schedules, choose **Match schedule**. Confirm that the unscoped schedule records belong to the currently displayed file/fingerprint. Then choose **Exact IFC GlobalId** and **Propose matches**. Review the preview before **Apply safe exact matches**.
6. For door marks, choose exact door-mark matching and the IFC property. Tag and Name are initially available; proposing once discovers scalar source attributes and named single-value property-set fields. Select a discovered field and propose again. No whitespace trimming, case folding or leading-zero removal occurs.
7. Resolve ambiguous/unmatched/conflicting rows by explicitly selecting a door **by GlobalId**. **Inspect candidate** focuses it and closes the dialog; reopen/re-propose to resolve. **Confirm manual link** records that explicit choice. Existing bindings or reviewer assignments cannot be overwritten by this operation. Remove an assignment or unlink a schedule from the selected door first if correction is necessary.
8. Optional **Door markers** are clickable and show the door mark plus status label. Turn them off when unnecessary; they follow table filters. Isolation is useful for interior doors.
9. Refresh and reopen the exact IFC bytes: assignments/reviews reappear. Export **Hardware import → Download data backup** to include imports, links, reviewer state and history. Backup restore UI remains a later slice.

## Matching policy

| Condition | Outcome |
| --- | --- |
| Unconfirmed source model | Resolution queue: unscoped. No match application. |
| Scoped to a different SHA-256 fingerprint | Resolution queue: wrong model. No cross-model reuse or revision migration. |
| Unique exact GlobalId in confirmed model, valid identity, unoccupied target | Eligible for bulk application. |
| Unique exact door-mark value in reviewer-selected IFC field, valid identity and no conflicting imported GlobalId | Eligible for bulk application. |
| Multiple IFC doors share the mark; selected field has conflicting values; multiple schedules target one door | Resolution queue: ambiguous. No bulk application. |
| Imported GlobalId disagrees with mark candidate | Resolution queue: conflict; explicit manual resolution required. |
| Door already has a binding or reviewer assignment | Existing data protected; no bulk overwrite. |
| Missing/duplicate IFC GlobalId | Not persistable, even manually. Fix source identity before saving. |
| No candidate | Resolution queue: unmatched. |

**Apply safe exact matches** is the reviewer-initiated automatic batch operation: only currently unique, unambiguous exact proposals apply. Opening the viewer, importing data or selecting a row never automatically writes an association. The batch rechecks the current data revision and proposals at application time; changing model, source data or matching settings invalidates the preview. No physical-proximity matching exists. Manual resolution can deliberately override a conflicting source GUID, but only after an explicit target GlobalId choice; original imported values remain in provenance and in the source schedule.

Schedule scope confirmation is explicit and applies to all currently unscoped schedule records in local data. It is an assertion by the reviewer, not a claim that the software can deduce which building a third-party schedule belongs to. Already scoped records cannot be silently moved to another model.

## Versioned records and audit data

The compatible schemaVersion 1 project envelope now optionally contains `workflow: {version:1,...}`. The root reviews/comments fields from slice 2 remain reserved legacy schedule-review collections; active model-door reviews/comments are in workflow, so no legacy data is repurposed. Existing slice-2 saved data loads unchanged; this field is created on the first workflow edit. Imports, raw provenance, original schedule assignment rows and source IFC properties are retained. A single shared local store ensures import and review actions do not overwrite each other's state.

| Collection | Meaning |
| --- | --- |
| scopes | Schedule application record ID → confirmed model identity. Original imported modelIdentity is never rewritten. |
| bindings | Model identity + IFC GlobalId → schedule record ID, method (`global-id`, `door-mark`, `manual`), source property/value, matched value and timestamp. No renderer IDs. |
| assignments | Current model-door hardware set selection, separate from original imported schedule assignments. Includes assignment method and optional schedule record ID. |
| reviews | Current model-door status, separate from source properties and imported schedule records. |
| comments | Stable ID, review record ID, original comment text, timestamp. Append-only in this slice. |
| history | Stable ID, model-door identity, timestamp, action kind, before/after values and method. Scope/binding, assignment, status and comment actions are retained. Scope events may have an empty GlobalId when no source GUID exists; they refer to schedule record ID in event data. |

Review status uses the existing storage key `changes-requested` with the UI label **Changes required**. Current assignments/statuses are mutable reviewer state; history preserves changes. Assignment removal does not delete the source schedule or its binding, preventing a later exact-match operation from reapplying intentionally removed hardware. **Unlink schedule** removes the binding and any still-source-derived assignment, recording both actions; an independently reassigned manual hardware choice is retained.

Review history is local audit information, not a signed or tamper-proof compliance log. Timestamps use ISO UTC. There is no login, shared server, simultaneous collaboration or automated hardware/code compliance. LocalStorage write/graph validation and stale-tab checks run before publishing state. The source IFC is never written.

## Markers and adapter boundary

The adapter projects geometry bounds with Three Vector3.project and culls behind-camera/offscreen/occluded doors using Raycaster.intersectObjects. Markers are off by default. They follow table filtering, show at most the first 100 eligible doors, hide overlapping labels (170 × 32 pixel spacing), and prioritize the selected door when possible. Visible geometry occludes markers, even in transparent-context mode; use Doors only for interiors. Culling updates roughly six times per second. This is a small-model prototype, not a large-building annotation engine.

Renderer/EXPRESS IDs stay in the adapter. Marker selection uses session keys only to call the adapter; persisted links use the model fingerprint and IFC GlobalId. No supported geometry means no marker, but the door remains in the table. Invalid source identities cannot receive saved reviews or assignments.

The adapter exposes scalar IFC attribute values and named IfcPropertySingleValue values for matching. Other complex property types, composite door-mark matching, normalization rules and revision migration are not implemented. Class/attributes/property sets remain separately available in the source inspector.

Official API references checked against installed Three.js declarations: https://threejs.org/docs/pages/Vector3.html and https://threejs.org/docs/pages/Raycaster.html . No new runtime library or worker deployment was introduced.
