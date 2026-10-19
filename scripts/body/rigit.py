import bpy, json, math, mathutils
D='C:/Users/SMOESC~1/AppData/Local/Temp/claude/C--Users-SMoescheit/44d898c0-1bc7-4c77-9714-0c345791eaef/scratchpad/dl/'
J=json.load(open(D+'joints.json'))
body=bpy.data.objects['GEO-body_male_realistic']; body.location=(0,0,0)
for m in list(body.modifiers): body.modifiers.remove(m)   # base level only
# armature
ad=bpy.data.armatures.new('rig'); arm=bpy.data.objects.new('rig',ad); bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm
bpy.ops.object.mode_set(mode='EDIT')
def mir(p,s): return (p[0]*s,p[1],p[2])
bones=[]
def bone(name,h,t,parent=None):
    e=ad.edit_bones.new(name); e.head=h; e.tail=t
    if parent: e.parent=ad.edit_bones[parent]; e.use_connect=False
    bones.append(name); return e
bone('pelvis',J['pelvis'],J['spine'])
bone('spine',J['spine'],J['chest'],'pelvis')
bone('chest',J['chest'],J['neck'],'spine')
bone('neck',J['neck'],J['head'],'chest')
bone('head',J['head'],J['headTop'],'neck')
for s,sx in (('L',1),('R',-1)):
    m=lambda p: mir(p,sx)
    bone('shoulder'+s,m(J['shoulder']),m(J['elbow']),'chest')
    bone('elbow'+s,m(J['elbow']),m(J['wrist']),'shoulder'+s)
    bone('wrist'+s,m(J['wrist']),m(J['handEnd']),'elbow'+s)
    for f in ('index','middle','ring','little','thumb'):
        P=J[f]
        bone(f+'0'+s,m(P[0]),m(P[1]),'wrist'+s)
        bone(f+'1'+s,m(P[1]),m(P[2]),f+'0'+s)
        bone(f+'2'+s,m(P[2]),m(P[3]),f+'1'+s)
    bone('hip'+s,m(J['hip']),m(J['knee']),'pelvis')
    bone('knee'+s,m(J['knee']),m(J['ankle']),'hip'+s)
    bone('ankle'+s,m(J['ankle']),m(J['toe']),'knee'+s)
bpy.ops.object.mode_set(mode='OBJECT')
# automatic weights
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active=arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
vg={g.index:g.name for g in body.vertex_groups}
print('GROUPS',len(vg))
me=body.data
V=[(v.co.x,v.co.y,v.co.z) for v in me.vertices]
F=[list(p.vertices) for p in me.polygons]
Wt=[]; empty=0
for v in me.vertices:
    ws=sorted([(g.weight,vg[g.group]) for g in v.groups if g.weight>0.001],reverse=True)[:4]
    if not ws: empty+=1
    Wt.append(ws)
print('EMPTY',empty)
# eyes
eyes=[]
for nm in ('GEO-body_male_realistic.eye.L','GEO-body_male_realistic.eye.R'):
    o=bpy.data.objects[nm]; mw=o.matrix_world
    eyes.append({'v':[tuple(mw@x.co) for x in o.data.vertices],'f':[list(p.vertices) for p in o.data.polygons]})
json.dump({'v':V,'f':F,'w':Wt,'bones':bones,'eyes':eyes},open(D+'rigged.json','w'))
print('DONE')
