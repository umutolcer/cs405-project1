struct Uniforms {
  mvp: mat4x4f,
  model: mat4x4f,
  colour: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) light: f32,
};

@vertex
fn vs(@location(0) position: vec3f, @location(1) normal: vec3f) -> VertexOutput {
  var output: VertexOutput;
  output.position = u.mvp * vec4f(position, 1.0);
  let worldNormal = normalize((u.model * vec4f(normal, 0.0)).xyz);
  output.light = 0.38 + 0.62 * max(dot(worldNormal, normalize(vec3f(0.35, 0.8, 0.62))), 0.0);
  return output;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
  return toOutput(vec4f(u.colour.rgb * input.light, u.colour.a));
}
