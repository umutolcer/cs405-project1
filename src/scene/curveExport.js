export function curveToJSON(curve) {
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const normalise = (p) => {
    const u = curve.coordinates === 'world' ? (p[0] / (2 * curve.aspect) + 0.5) : p[0];
    const v = curve.coordinates === 'world' ? (0.5 - p[1] / 2) : p[1];
    return [clamp(u), clamp(v)];
  };
  const result = { painting: curve.painting, kind: curve.kind };
  if (curve.kind === 'bezier-c1') result.segments = curve.segments.map((s) => s.map(normalise));
  else result.points = curve.points.map(normalise);
  return result;
}

export function downloadJSON(obj, filename = 'curve.json') {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
