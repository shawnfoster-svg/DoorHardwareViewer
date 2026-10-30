"""Original CC0 IFC4 test building, expressed as genuine IFC swept solids."""
from pathlib import Path
rows=[]
def add(s):
 rows.append(s); return f'#{len(rows)}'
def guid(n): return f'{n:022d}'
p=add('IFCCARTESIANPOINT((0.,0.,0.))'); z=add('IFCDIRECTION((0.,0.,1.))'); x=add('IFCDIRECTION((1.,0.,0.))'); axis=add(f'IFCAXIS2PLACEMENT3D({p},{z},{x})'); place=add(f'IFCLOCALPLACEMENT($,{axis})')
p2=add('IFCCARTESIANPOINT((0.,0.))'); a2=add(f'IFCAXIS2PLACEMENT2D({p2},$)')
ctx=add(f"IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,{axis},$)")
unit=add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'); units=add(f'IFCUNITASSIGNMENT(({unit}))')
proj=add(f"IFCPROJECT('{guid(1)}',$,'Door review fixture',$,$,$,$,({ctx}),{units})")
bld=add(f"IFCBUILDING('{guid(2)}',$,'Review pavilion',$,$,{place},$,$,.ELEMENT.,$,$,$)")
storey=add(f"IFCBUILDINGSTOREY('{guid(3)}',$,'Ground floor',$,$,{place},$,$,.ELEMENT.,0.)")
add(f"IFCRELAGGREGATES('{guid(4)}',$,$,$,{proj},({bld}))");add(f"IFCRELAGGREGATES('{guid(5)}',$,$,$,{bld},({storey}))")
elements=[]
def box(cls,n,name,tag,px,py,pz,w,d,h,extra):
 pt=add(f'IFCCARTESIANPOINT(({px:.3f},{py:.3f},{pz:.3f}))'); a=add(f'IFCAXIS2PLACEMENT3D({pt},{z},{x})'); lp=add(f'IFCLOCALPLACEMENT($,{a})')
 profile=add(f'IFCRECTANGLEPROFILEDEF(.AREA.,$,{a2},{w:.3f},{d:.3f})'); solid=add(f'IFCEXTRUDEDAREASOLID({profile},{axis},{z},{h:.3f})'); rep=add(f"IFCSHAPEREPRESENTATION({ctx},'Body','SweptSolid',({solid}))"); shape=add(f'IFCPRODUCTDEFINITIONSHAPE($,$,({rep}))')
 el=add(f"{cls}('{guid(n)}',$,'{name}',$,$,{lp},{shape},'{tag}',{extra})"); elements.append(el); return el
box('IFCSLAB',10,'Ground slab','S-01',0,0,-.2,8,6,.2,'.FLOOR.')
box('IFCWALL',11,'North wall','W-01',0,3,0,8,.2,3,'.NOTDEFINED.')
box('IFCWALL',12,'West wall','W-02',-4,0,0,.2,6,3,'.NOTDEFINED.')
box('IFCWALL',13,'East wall','W-03',4,0,0,.2,6,3,'.NOTDEFINED.')
# Partition pieces frame two door apertures.
for i,(cx,w) in enumerate([(-3.25,1.5),(0,3),(3.25,1.5)]): box('IFCWALL',14+i,'Partition','W-P',cx,0,0,w,.15,3,'.NOTDEFINED.')
for i,cx in enumerate([-2,2]):
 box('IFCWALL',20+i,'Door lintel','W-L',cx,0,2.1,1,.15,.9,'.NOTDEFINED.')
 door=box('IFCDOOR',30+i,['Lobby door','Office door'][i],f'D-10{i+1}',cx,0,0,.95,.06,2.1,'2.1,0.95,.DOOR.,.SINGLE_SWING_LEFT.,$')
 prop=add("IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('60 min'),$)"); ps=add(f"IFCPROPERTYSET('{guid(40+i)}',$,'Pset_DoorCommon',$,({prop}))");add(f"IFCRELDEFINESBYPROPERTIES('{guid(50+i)}',$,$,$,({door}),{ps})")
add(f"IFCRELCONTAINEDINSPATIALSTRUCTURE('{guid(60)}',$,$,$,({','.join(elements)}),{storey})")
text="ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Original CC0 Door Hardware Viewer fixture'),'2;1');\nFILE_NAME('two-doors.ifc','2026-10-30T00:00:00',('DoorHardwareViewer contributors'),(''),'fixture generator','DoorHardwareViewer','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n"+'\n'.join(f'#{i+1}={s};' for i,s in enumerate(rows))+'\nENDSEC;\nEND-ISO-10303-21;\n'
Path('public/fixtures/two-doors.ifc').write_text(text)
