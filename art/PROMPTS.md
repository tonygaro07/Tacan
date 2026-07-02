# Tacan — InkShadow art prompt pack

Master style for every asset (append to each prompt — consistency comes from
repeating this suffix + keeping seeds fixed per asset):

> **STYLE:** ink-splatter silhouette illustration, cyberpunk neon noir, deep
> indigo night palette, glowing magenta and cyan neon accents, black ink
> shadows with splattered edges, wet reflections, dramatic rim light, high
> contrast, digital painting, no text, no watermark

Negative prompt (models that support it): `text, letters, watermark, logo, low contrast, daylight, pastel`

| # | Asset | File | Prompt (before STYLE suffix) | Size |
|---|-------|------|------------------------------|------|
| 1 | Wood tile | `tile-wood.png` | dense pine forest on a hillside seen from above, bioluminescent teal-green canopy glow | 1024×1024 |
| 2 | Brick tile | `tile-brick.png` | clay kiln quarry with stacked brick terraces, molten magenta glow from the kilns | 1024×1024 |
| 3 | Sheep tile | `tile-sheep.png` | moonlit pasture with grazing sheep silhouettes, soft lime-green haze | 1024×1024 |
| 4 | Wheat tile | `tile-wheat.png` | windswept wheat field at night, stalks catching golden neon light | 1024×1024 |
| 5 | Ore tile | `tile-ore.png` | jagged mountain mine entrance, violet crystal veins glowing in black rock | 1024×1024 |
| 6 | Desert tile | `tile-desert.png` | barren cracked dunes under a starless sky, faint grey-violet moon haze | 1024×1024 |
| 7 | Board backdrop | `backdrop.png` | rain-slick cyberpunk harbor city at night viewed from above, neon signs reflecting in dark water canals | 1792×1024 |
| 8 | Landing hero | `hero.png` | lone cloaked settler silhouette overlooking a neon island archipelago, ink splatter edges | 1792×1024 |

## Rules of the pack
- One asset = one prompt = one fixed seed (record the seed you keep next to the file).
- Regenerate ONLY the asset you dislike; never batch-regenerate everything, or the set drifts.
- Tiles get clipped to hexes by the renderer — keep the subject centered, edges are lost.
- Character portraits already exist (Ivalice roster) — don't regenerate those here.

## How to run the batch
```bash
export REPLICATE_API_TOKEN=r8_xxx   # replicate.com -> account -> API tokens
node scripts/gen-art.mjs            # writes client/public/art/*.png
```
