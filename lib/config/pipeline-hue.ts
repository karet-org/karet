// Deterministic per-pipeline accent color: hash the slug into a small
// brand-adjacent hue set so a pipeline keeps its color everywhere.

const HUES = [16, 42, 122, 200, 268, 330];

export function pipelineHue(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}
