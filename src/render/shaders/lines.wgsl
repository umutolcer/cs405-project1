// Coloured lines: debug axes and wireframes now; the frustum (Part C) and the
// curves (Part D) can use the same pipeline later.
// Vertex layout: position xyz, colour rgb (LINEAR).

struct Uniforms {
  mvp: mat4x4f,   // P · V · M
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) colour: vec3f,
};

@vertex
fn vs(@location(0) pos: vec3f, @location(1) colour: vec3f) -> VSOut {
  var o: VSOut;
  o.position = u.mvp * vec4f(pos, 1.0);
  o.colour = colour;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4f {
  return toOutput(vec4f(i.colour, 1.0));
}
