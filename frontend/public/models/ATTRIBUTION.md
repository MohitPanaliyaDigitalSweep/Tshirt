# Model attribution

- File: `shirt_baked_collapsed.glb`
- Source: pmndrs `examples` demo assets (used in the pmndrs/react-three-fiber examples).
- License: MIT (pmndrs examples).
- Mesh node: `T_Shirt_male`; original material slot: `lambert1` (replaced at runtime
  with a cloned `MeshPhysicalMaterial` driven by the `color` prop).
- Model bounds (from GLTF POSITION accessor): x ±0.276, y −0.352…0.261, z −0.125…0.144.

## Decal zones (runtime placements, not UVs)

Artwork is projected as small planes floating just off the shirt surface:

| Zone | Position | Rotation | Size |
| ---- | -------- | -------- | ---- |
| front | [0, 0.04, 0.15] | [0, 0, 0] | 0.13 |
| back | [0, 0.04, −0.135] | [0, π, 0] | 0.13 |
| sleeve_left | [−0.245, 0.10, 0.02] | [0, −π/2, 0] | 0.075 |
| sleeve_right | [0.245, 0.10, 0.02] | [0, π/2, 0] | 0.075 |

Multiple artworks in one zone stack outward along the zone normal (+0.0018 each).
