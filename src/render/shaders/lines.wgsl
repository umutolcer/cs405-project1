struct Uniforms { vp: mat4x4f };
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) colour: vec3f,
};

@vertex
fn vs(@location(0) position: vec3f, @location(1) colour: vec3f) -> VertexOutput {
  var output: VertexOutput;
  output.position = u.vp * vec4f(position, 1.0);
  output.colour = colour;
  return output;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
  return toOutput(vec4f(input.colour, 1.0));
}
