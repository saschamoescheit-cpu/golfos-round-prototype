# The realistic body of the 3D golfer

Source: Blender Foundation „Human Base Meshes“ v1.4.1 (CC0 1.0), object `GEO-body_male_realistic` (base level, no multires),
https://download.blender.org/demo/asset-bundles/human-base-meshes/

1. `joints.json` – the joint centres of that body (measured with plane slices of the mesh; hand landmarks in the hand's own
   frame). `joints.mjs` writes it from the hand frame.
2. `rigit.py` – in Blender (portable 4.2, `blender -b human_base_meshes_bundle.blend --python rigit.py`): an armature with
   our joint names at those points, automatic weights; writes `rigged.json`.
3. `build-body.mjs rigged.json joints.json ../../src/mobility/anim3d/realisticBody.data.ts` – converts to our axes and
   size (hip joint 0.92 m), cuts the clothes from the body's own faces (shirt, trousers, belt, shoes, glove, cap with
   visor, hair), and writes the bind frames of every bone.
