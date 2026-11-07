> Persistence update: working reviews now use IndexedDB, portable review packages can be restored, and model replacement is controlled. See [PERSISTENCE-EXCHANGE.md](PERSISTENCE-EXCHANGE.md). Earlier storage/restore limitations below describe previous slices.

# Individual element visibility

Click any rendered IFC element (wall, slab, door, etc.). The **Element visibility** panel at the top of the inspector provides **Hide selected element**. The selection remains available for property inspection and **Unhide selected element**, even while its geometry is hidden.

**Hidden elements** lists every explicitly hidden element with IFC class, tag/name and GlobalId. Use a row's **Unhide** button to restore only that element, or **Unhide all** to clear all explicit hides. This list is essential for restoring walls and other elements that do not appear in the door table.

Rules:

- Explicit hiding takes priority over selection, All elements, Transparent context and Doors only. Selecting a hidden door in the table does not silently show it; its row is labeled Hidden.
- Unhide removes the explicit hide. The current View mode still applies. A non-door element may remain excluded by Doors only; choose All elements to see the full model.
- Every mesh belonging to the selected IFC occurrence is hidden together. Hidden geometry is excluded from picking and marker layout/occlusion. Hidden doors have no markers.
- Fit model uses currently visible geometry; when all geometry is hidden it safely leaves the camera unchanged.
- These are view-only controls for the current model session. Hidden state clears on replacement, failed loading, reopening or page refresh. It is not stored in hardware/review backups. Assignments, review records and source IFC are unchanged.
- The adapter owns the hidden element set using internal session IDs; no temporary renderer IDs are persisted. Missing/duplicate IFC GlobalIds still permit temporary visibility changes, while existing assignment/review identity safeguards remain intact.

No package versions changed. The implementation uses the installed Three.js 0.187.0 Object3D.visible API, and explicitly filters hidden meshes from picking and marker calculations. Official reference checked: https://threejs.org/docs/pages/Object3D.html .

## Acceptance checklist

- [x] Pick a real IFC element and hide/unhide it.
- [x] Restore individual hidden elements, including non-door elements, or restore all.
- [x] Hidden door stays hidden across table reselection and view-mode changes.
- [x] Hidden geometry cannot be picked; hidden door markers disappear and restore correctly.
- [x] Replacement/error clears temporary hidden state.
- [x] Production build and real-IFC browser tests (see TESTING.md).
