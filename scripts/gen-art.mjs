// ---------------------------------------------------------------------------
// Batch art generation for the InkShadow theme (E4-04 / Epic 6).
// Uses Replicate's FLUX model via plain HTTP — no SDK needed.
//   export REPLICATE_API_TOKEN=r8_xxx  (replicate.com -> account -> API tokens)
//   node scripts/gen-art.mjs [--only tile-wood]
// Each asset uses a FIXED seed so re-runs are reproducible; change a seed only
// when you want a different take on that one asset.
// ---------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STYLE =
  "ink-splatter silhouette illustration, cyberpunk neon noir, deep indigo night palette, " +
  "glowing magenta and cyan neon accents, black ink shadows with splattered edges, wet reflections, " +
  "dramatic rim light, high contrast, digital painting, no text, no watermark";

const ASSETS = [
  { file: "tile-wood.png",   seed: 101, ar: "1:1",  prompt: "dense pine forest on a hillside seen from above, bioluminescent teal-green canopy glow" },
  { file: "tile-brick.png",  seed: 102, ar: "1:1",  prompt: "clay kiln quarry with stacked brick terraces, molten magenta glow from the kilns" },
  { file: "tile-sheep.png",  seed: 103, ar: "1:1",  prompt: "moonlit pasture with grazing sheep silhouettes, soft lime-green haze" },
  { file: "tile-wheat.png",  seed: 104, ar: "1:1",  prompt: "windswept wheat field at night, stalks catching golden neon light" },
  { file: "tile-ore.png",    seed: 105, ar: "1:1",  prompt: "jagged mountain mine entrance, violet crystal veins glowing in black rock" },
  { file: "tile-desert.png", seed: 106, ar: "1:1",  prompt: "barren cracked dunes under a starless sky, faint grey-violet moon haze" },
  { file: "backdrop.png",    seed: 107, ar: "16:9", prompt: "rain-slick cyberpunk harbor city at night viewed from above, neon signs reflecting in dark water canals" },
  { file: "hero.png",        seed: 108, ar: "16:9", prompt: "lone cloaked settler silhouette overlooking a neon island archipelago, ink splatter edges" },
];

const TOKEN = process.env.REPLICATE_API_TOKEN;
if (!TOKEN) {
  console.error("Set REPLICATE_API_TOKEN first (replicate.com -> account -> API tokens)");
  process.exit(1);
}

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const outDir = join(import.meta.dirname, "..", "client", "public", "art");
mkdirSync(outDir, { recursive: true });

async function generate(asset) {
  const res = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({
      input: {
        prompt: `${asset.prompt}, ${STYLE}`,
        aspect_ratio: asset.ar,
        seed: asset.seed,
        output_format: "png",
        safety_tolerance: 2,
      },
    }),
  });
  if (!res.ok) throw new Error(`${asset.file}: HTTP ${res.status} ${await res.text()}`);
  const prediction = await res.json();
  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!url) throw new Error(`${asset.file}: no output (status ${prediction.status})`);
  const img = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(join(outDir, asset.file), img);
  console.log(`✓ ${asset.file} (${(img.length / 1024).toFixed(0)} KB, seed ${asset.seed})`);
}

for (const asset of ASSETS) {
  if (only && !asset.file.startsWith(only)) continue;
  try {
    await generate(asset);
  } catch (err) {
    console.error(`✗ ${err.message}`);
  }
}
console.log(`\nDone. Assets in client/public/art/ — next step: wire them into Board.tsx as hex pattern fills.`);
