import zlib from 'node:zlib';
import fs from 'node:fs';

// ---- minimal RGBA PNG encoder ----
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
function makeCanvas(w, h) {
  const buf = Buffer.alloc(w * h * 4);
  return {
    w, h, buf,
    set(x, y, r, g, b, a = 255) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      // alpha blend over existing
      const sa = a / 255, da = 1 - sa;
      buf[i]   = (r * sa + buf[i] * da) | 0;
      buf[i+1] = (g * sa + buf[i+1] * da) | 0;
      buf[i+2] = (b * sa + buf[i+2] * da) | 0;
      buf[i+3] = Math.max(buf[i+3], a);
    },
    rect(x0, y0, ww, hh, r, g, b, a = 255) {
      for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) this.set(x, y, r, g, b, a);
    },
    disc(cx, cy, rad, r, g, b, a = 255) {
      for (let y = cy - rad; y <= cy + rad; y++)
        for (let x = cx - rad; x <= cx + rad; x++)
          if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) this.set(x, y, r, g, b, a);
    },
  };
}
// deterministic pseudo-random (no Math.random needed)
let seed = 1234567;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

// Output dir: first CLI arg, or ./demo-assets relative to where you run node.
// From inside a capybara_2d_engine clone: `node genart.mjs ./demo-assets`
const OUT = process.argv[2] || './demo-assets';
fs.mkdirSync(OUT, { recursive: true });

// ---- MAP: 1500x1000 grass field, 3:2 aspect ----
{
  const W = 1500, H = 1000, c = makeCanvas(W, H);
  // base grass gradient
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = (Math.sin(x * 0.05) + Math.cos(y * 0.06)) * 6;
    c.set(x, y, 96 + n, 152 + n, 74 + n, 255);
  }
  // subtle grid lines (helps sense of movement)
  for (let x = 0; x < W; x += 100) c.rect(x, 0, 2, H, 86, 138, 68, 90);
  for (let y = 0; y < H; y += 100) c.rect(0, y, W, 2, 86, 138, 68, 90);
  // grass tufts
  for (let i = 0; i < 900; i++) {
    const x = (rnd() * W) | 0, y = (rnd() * H) | 0;
    const shade = 60 + (rnd() * 40 | 0);
    c.rect(x, y, 2, 5, shade + 20, shade + 80, shade, 160);
  }
  // flowers
  const petals = [[235, 90, 120], [250, 220, 90], [150, 120, 235]];
  for (let i = 0; i < 70; i++) {
    const x = (60 + rnd() * (W - 120)) | 0, y = (60 + rnd() * (H - 120)) | 0;
    const p = petals[(rnd() * petals.length) | 0];
    c.disc(x - 4, y, 3, ...p); c.disc(x + 4, y, 3, ...p);
    c.disc(x, y - 4, 3, ...p); c.disc(x, y + 4, 3, ...p);
    c.disc(x, y, 2, 250, 240, 120);
  }
  // a little pond bottom-right
  c.disc(1180, 760, 120, 70, 130, 190, 255);
  c.disc(1180, 760, 120, 90, 150, 205, 60);
  // a dirt path
  for (let y = 0; y < H; y++) { const x = 500 + Math.sin(y * 0.02) * 120; c.rect(x - 34, y, 68, 1, 168, 138, 96, 220); }
  fs.writeFileSync(`${OUT}/map.png`, encodePNG(W, H, c.buf));
  console.log('map.png', W + 'x' + H);
}

// ---- PLAYER: 4-frame walk strip, each 64x96 -> 256x96 ----
{
  const FW = 64, FH = 96, N = 4, W = FW * N, H = FH, c = makeCanvas(W, H);
  const skin = [245, 205, 165], shirt = [70, 120, 210], pants = [50, 55, 70], hair = [80, 50, 30], shoe = [30, 30, 34];
  for (let f = 0; f < N; f++) {
    const ox = f * FW + FW / 2; // frame center x
    const legSwing = [0, 6, 0, -6][f]; // walk bob
    const bob = [0, -2, 0, -2][f];
    const cy = 18 + bob;
    // shadow
    c.disc(ox, 90, 16, 20, 30, 20, 60);
    c.rect(ox - 16, 88, 32, 6, 20, 30, 20, 60);
    // legs
    c.rect(ox - 10, 60 + bob, 8, 26 + legSwing, ...pants);
    c.rect(ox + 2, 60 + bob, 8, 26 - legSwing, ...pants);
    // shoes
    c.rect(ox - 11, 84 + legSwing, 10, 6, ...shoe);
    c.rect(ox + 1, 84 - legSwing, 10, 6, ...shoe);
    // body/shirt
    c.rect(ox - 13, 38 + bob, 26, 26, ...shirt);
    // arms
    c.rect(ox - 17, 40 + bob, 6, 20, ...skin);
    c.rect(ox + 11, 40 + bob, 6, 20, ...skin);
    // head
    c.disc(ox, cy + 4, 13, ...skin);
    // hair
    c.rect(ox - 13, cy - 9, 26, 9, ...hair);
    c.disc(ox, cy - 4, 13, ...hair);
    c.disc(ox, cy + 2, 13, ...skin); // face below hair
    // eyes (facing down/front)
    c.rect(ox - 6, cy + 3, 3, 4, 30, 30, 40);
    c.rect(ox + 3, cy + 3, 3, 4, 30, 30, 40);
  }
  fs.writeFileSync(`${OUT}/player.png`, encodePNG(W, H, c.buf));
  console.log('player.png', W + 'x' + H);
}
console.log('done ->', OUT);
