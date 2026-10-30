# Two-door IFC fixture

`two-doors.ifc` is an original, small IFC4 STEP model authored for this repository, not a downloaded third-party building. It contains a slab, perimeter/partition walls, two doors, spatial containment and Pset_DoorCommon.FireRating = "60 min". Geometry is represented by actual IFC extruded-area solids, parsed and triangulated by web-ifc at runtime. There is no JavaScript substitute geometry.

The fixture and its generator (`scripts/generate-fixture.py`) are dedicated to the public domain under CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/ . You may redistribute and modify them. The illustrative FireRating is fixture data, not a product certification or compliance finding.

Regenerate with `python3 scripts/generate-fixture.py` from repository root. Expected: IFC4, 11 rendered elements, 2 IfcDoor elements, D-101 / Lobby door and D-102 / Office door. Fixed unique GlobalIds make identity regressions reproducible. The simple pavilion is a test building, not construction documentation; door aperture geometry uses separate wall pieces rather than IfcOpeningElement relationships.
