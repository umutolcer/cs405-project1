// Lit meshes (Parts A and B). Vertex layout: position xyz, normal xyz.
// All lighting is done in LINEAR colour; the result goes through toOutput().

struct Uniforms {
  mvp: mat4x4f,     // P · V · M  (column-major, as uploaded)
  model: mat4x4f,   // M = node.world · shape, used for the normal
  colour: vec4f,    // linear RGB albedo; a = 1 lit, 0 flat (unlit)
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
};

@vertex
fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f) -> VSOut {
  var o: VSOut;
  o.position = u.mvp * vec4f(pos, 1.0);

  // Normals transform with the inverse-transpose of M's 3×3 part. The cofactor
  // matrix with columns (c1×c2, c2×c0, c0×c1) equals det(M) · M⁻ᵀ, so it gives
  // the right direction — also under non-uniform scale (S·R·T shears!) —
  // without computing an inverse. The sign of det fixes mirrored matrices.
  let c0 = u.model[0].xyz;
  let c1 = u.model[1].xyz;
  let c2 = u.model[2].xyz;
  let n = cross(c1, c2) * nrm.x + cross(c2, c0) * nrm.y + cross(c0, c1) * nrm.z;
  let s = select(1.0, -1.0, dot(c0, cross(c1, c2)) < 0.0);
  o.normal = n * s;
  return o;
}

// Direction TOWARDS the key light: upper left and in front, roughly as the
// light falls in the still lifes of the collection.
const LIGHT_DIR = vec3f(-0.45, 0.70, 0.55);
const LIGHT_COLOUR = vec3f(1.0, 0.94, 0.82);

@fragment
fn fs(i: VSOut) -> @location(0) vec4f {
  let len = length(i.normal);
  let n = select(vec3f(0.0, 0.0, 1.0), i.normal / max(len, 1e-8), len > 1e-8);
  let l = normalize(LIGHT_DIR);
  let diffuse = max(dot(n, l), 0.0);
  // hemisphere ambient: dark from below, warmer from above
  let ambient = mix(vec3f(0.035, 0.03, 0.028), vec3f(0.22, 0.20, 0.17), 0.5 + 0.5 * n.y);
  let lit = u.colour.rgb * (ambient + LIGHT_COLOUR * diffuse);
  let rgb = mix(u.colour.rgb, lit, u.colour.a);
  return toOutput(vec4f(rgb, 1.0));
}
