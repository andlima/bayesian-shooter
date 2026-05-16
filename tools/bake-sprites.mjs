#!/usr/bin/env node
// ===========================================================================
// bake-sprites.mjs — PNG-source asset pipeline for the imp & grunt enemies.
//
// Zero npm dependencies — only Node built-ins (fs, path, zlib, url). Runs
// under the repo's Node (v24).
//
// Two modes:
//
//   node tools/bake-sprites.mjs --bootstrap [--force]
//       Writes assets/sprites/{imp,grunt}_{1,2}.png from the ASCII sprite
//       definitions embedded below. The definitions reproduce the EXACT
//       pixels the old procedural impFrame1/impFrame2/gruntFrame1/gruntFrame2
//       produced (same palettes, same rows as the pre-pipeline index.html).
//       Used once to seed the PNG sources without network access. Refuses to
//       overwrite an existing PNG unless --force is also passed.
//
//   node tools/bake-sprites.mjs            (default — `make bake`)
//       Decodes the four PNGs and rewrites ONLY the region of index.html
//       between the sentinel lines:
//           // <BAKED_SPRITES_BEGIN> ...
//           // <BAKED_SPRITES_END>
//       Every byte outside that region is left untouched. Output is
//       deterministic (sorted keys, one base64 line per frame), so running
//       it twice in a row produces no further diff.
//
// Pixel format: rgba32() in index.html packs a pixel as the unsigned 32-bit
// word (255 << 24) | (b << 16) | (g << 8) | r — i.e. R in the least
// significant byte, A (always 255 for drawn pixels) in the most significant.
// A fully transparent pixel is the word 0. PNG alpha 0 maps back to word 0.
// ===========================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const SPRITE_SIZE = 32;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SPRITES_DIR = join(REPO_ROOT, 'assets', 'sprites');
const INDEX_HTML = join(REPO_ROOT, 'index.html');

const BEGIN_MARK = '<BAKED_SPRITES_BEGIN>';
const END_MARK = '<BAKED_SPRITES_END>';

// ---------------------------------------------------------------------------
// rgba32 + buildFrame — copied verbatim from index.html so the bootstrap
// output is pixel-identical to the old procedural frames.
// ---------------------------------------------------------------------------
function rgba32(r, g, b) {
  return ((255 << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff)) >>> 0;
}
function buildFrame(rows, palette) {
  const out = new Uint32Array(SPRITE_SIZE * SPRITE_SIZE);
  for (let y = 0; y < SPRITE_SIZE; y++) {
    const row = rows[y];
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const c = row.charAt(x);
      const v = palette[c];
      if (v) out[y * SPRITE_SIZE + x] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Embedded ASCII sprite definitions — VERBATIM from the pre-pipeline
// index.html. This is the only place the original imp/grunt art survives;
// edit the PNGs (not this) for new art, then `make bake`.
// ---------------------------------------------------------------------------
const impPalette = {
  'R': rgba32(220,  60,  50), // bright red (body)
  'r': rgba32(140,  30,  25), // dark red outline
  'b': rgba32( 20,   0,   0), // eye / mouth dark
  'y': rgba32(255, 220,  60), // glowing eye
  'h': rgba32( 90,  20,  15), // horn / hoof
  's': rgba32( 30,   8,   6), // floor shadow (dark red-brown)
};
const gruntPalette = {
  'G': rgba32( 90, 190,  90), // bright green
  'g': rgba32( 30, 100,  40), // dark green outline
  'b': rgba32( 10,  10,  10), // visor / eye
  'y': rgba32(240, 220, 100), // belt / detail
  'k': rgba32( 50,  60,  50), // boot / glove
  's': rgba32( 15,  30,  18), // floor shadow (dark green-brown)
};

const SPRITE_DEFS = {
  imp_1: { palette: impPalette, rows: [
    '................................',
    '............hhhh....hhhh........',
    '............hhhh....hhhh........',
    '............RRRR....RRRR........',
    '............RRRR....RRRR........',
    '..........rrRRRRRRRRRRRRrr......',
    '..........rrRRRRRRRRRRRRrr......',
    '........rrRRyyRRRRRRRRyyRRrr....',
    '........rrRRyyRRRRRRRRyyRRrr....',
    '........rrRRRRbbRRRRbbRRRRrr....',
    '........rrRRRRbbRRRRbbRRRRrr....',
    '........rrRRRRRRRRRRRRRRRRrr....',
    '........rrRRRRRRRRRRRRRRRRrr....',
    '..........rrRRRRRRRRRRRRrr......',
    '..........rrRRRRRRRRRRRRrr......',
    '............rrRRRRRRRRrr........',
    '............rrRRRRRRRRrr........',
    '........rrRRRRRRRRRRRRRRRRrr....',
    '........rrRRRRRRRRRRRRRRRRrr....',
    '......rrRRRRRRRRRRRRRRRRRRRRrr..',
    '......rrRRRRRRRRRRRRRRRRRRRRrr..',
    '......rrRRRRRRRRRRRRRRRRRRRRrr..',
    '......rrRRRRRRRRRRRRRRRRRRRRrr..',
    '........rrRRRRRRRRRRRRRRRRrr....',
    '........rrRRRRRRRRRRRRRRRRrr....',
    '..........rrRRrr....rrRRrr......',
    '..........rrRRrr....rrRRrr......',
    '..........rrhhrr....rrhhrr......',
    '..........rrhhrr....rrhhrr......',
    '..........hhhhhh....hhhhhh......',
    '..........hhhhhh....hhhhhh......',
    '..........ssssss....ssssss......',
  ] },
  imp_2: { palette: impPalette, rows: [
    '................................',
    '............hhhh....hhhh........',
    '............hhhh....hhhh........',
    '............RRRR....RRRR........',
    '............RRRR....RRRR........',
    '..........rrRRRRRRRRRRRRrr......',
    '..........rrRRRRRRRRRRRRrr......',
    '........rrRRyyRRRRRRRRyyRRrr....',
    '........rrRRyyRRRRRRRRyyRRrr....',
    '........rrRRRRbbRRRRbbRRRRrr....',
    '........rrRRRRbbRRRRbbRRRRrr....',
    '........rrRRRRRRRRRRRRRRRRrr....',
    '........rrRRRRRRRRRRRRRRRRrr....',
    '..........rrRRRRRRRRRRRRrr......',
    '..........rrRRRRRRRRRRRRrr......',
    '............rrRRRRRRRRrr........',
    '............rrRRRRRRRRrr........',
    '........rrRRRRRRRRRRRRRRRRrr....',
    '........rrRRRRRRRRRRRRRRRRrr....',
    '......rrRRRRRRRRRRRRRRRRRRRRrr..',
    '......rrRRRRRRRRRRRRRRRRRRRRrr..',
    '......rrRRRRRRRRRRRRRRRRRRRRrr..',
    '......rrRRRRRRRRRRRRRRRRRRRRrr..',
    '........rrRRRRRRRRRRRRRRRRrr....',
    '........rrRRRRRRRRRRRRRRRRrr....',
    '........rrRRrr........rrRRrr....',
    '........rrRRrr........rrRRrr....',
    '........rrhhrr........rrhhrr....',
    '........rrhhrr........rrhhrr....',
    '........hhhhhh........hhhhhh....',
    '........hhhhhh........hhhhhh....',
    '........ssssss........ssssss....',
  ] },
  grunt_1: { palette: gruntPalette, rows: [
    '................................',
    '..........gggggggggggg..........',
    '..........gggggggggggg..........',
    '........ggGGGGGGGGGGGGgg........',
    '........ggGGGGGGGGGGGGgg........',
    '........ggGGbbbbbbbbGGgg........',
    '........ggGGbbbbbbbbGGgg........',
    '........ggGGGGGGGGGGGGgg........',
    '........ggGGGGGGGGGGGGgg........',
    '......ggGGGGGGGGGGGGGGGGgg......',
    '......ggGGGGGGGGGGGGGGGGgg......',
    '....ggGGggGGGGGGGGGGGGggGGgg....',
    '....ggGGggGGGGGGGGGGGGggGGgg....',
    '....ggGGggGGGGGGGGGGGGggGGgg....',
    '....ggGGggGGGGGGGGGGGGggGGgg....',
    '....ggGGGGGGGGGGGGGGGGGGGGgg....',
    '....ggGGGGGGGGGGGGGGGGGGGGgg....',
    '......ggGGyyyyyyyyyyyyGGgg......',
    '......ggGGyyyyyyyyyyyyGGgg......',
    '......ggGGGGGGGGGGGGGGGGgg......',
    '......ggGGGGGGGGGGGGGGGGgg......',
    '........ggGGGGGGGGGGGGgg........',
    '........ggGGGGGGGGGGGGgg........',
    '........ggGGgg....ggGGgg........',
    '........ggGGgg....ggGGgg........',
    '........ggGGgg....ggGGgg........',
    '........ggGGgg....ggGGgg........',
    '........ggkkgg....ggkkgg........',
    '........ggkkgg....ggkkgg........',
    '........kkkkkk....kkkkkk........',
    '........kkkkkk....kkkkkk........',
    '........ssssss....ssssss........',
  ] },
  grunt_2: { palette: gruntPalette, rows: [
    '................................',
    '..........gggggggggggg..........',
    '..........gggggggggggg..........',
    '........ggGGGGGGGGGGGGgg........',
    '........ggGGGGGGGGGGGGgg........',
    '........ggGGbbbbbbbbGGgg........',
    '........ggGGbbbbbbbbGGgg........',
    '........ggGGGGGGGGGGGGgg........',
    '........ggGGGGGGGGGGGGgg........',
    '......ggGGGGGGGGGGGGGGGGgg......',
    '......ggGGGGGGGGGGGGGGGGgg......',
    '....ggGGggGGGGGGGGGGGGggGGgg....',
    '....ggGGggGGGGGGGGGGGGggGGgg....',
    '....ggGGggGGGGGGGGGGGGggGGgg....',
    '....ggGGggGGGGGGGGGGGGggGGgg....',
    '....ggGGGGGGGGGGGGGGGGGGGGgg....',
    '....ggGGGGGGGGGGGGGGGGGGGGgg....',
    '......ggGGyyyyyyyyyyyyGGgg......',
    '......ggGGyyyyyyyyyyyyGGgg......',
    '......ggGGGGGGGGGGGGGGGGgg......',
    '......ggGGGGGGGGGGGGGGGGgg......',
    '........ggGGGGGGGGGGGGgg........',
    '........ggGGGGGGGGGGGGgg........',
    '......ggGGgg........ggGGgg......',
    '......ggGGgg........ggGGgg......',
    '......ggGGgg........ggGGgg......',
    '......ggGGgg........ggGGgg......',
    '......ggkkgg........ggkkgg......',
    '......ggkkgg........ggkkgg......',
    '......kkkkkk........kkkkkk......',
    '......kkkkkk........kkkkkk......',
    '......ssssss........ssssss......',
  ] },
};

// Map each PNG basename to the index.html `const` it feeds.
const FRAME_BINDINGS = {
  imp_1: 'impFrame1',
  imp_2: 'impFrame2',
  grunt_1: 'gruntFrame1',
  grunt_2: 'gruntFrame2',
};

// ---------------------------------------------------------------------------
// Minimal PNG codec (8-bit, color type 6 / RGBA, no interlace).
// ---------------------------------------------------------------------------
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'latin1');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// words: Uint32Array of SPRITE_SIZE*SPRITE_SIZE rgba32 words.
function encodePNG(words, w, h) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = 0; // filter type 0 (None)
    for (let x = 0; x < w; x++) {
      const word = words[y * w + x] >>> 0;
      const p = o + 1 + x * 4;
      raw[p] = word & 0xff;             // R
      raw[p + 1] = (word >>> 8) & 0xff; // G
      raw[p + 2] = (word >>> 16) & 0xff;// B
      raw[p + 3] = (word >>> 24) & 0xff;// A
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: truecolor + alpha
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method 0
  ihdr[12] = 0; // interlace: none
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePNG(buf) {
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIG[i]) throw new Error('not a PNG (bad signature)');
  }
  let off = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idatParts = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idatParts.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len; // 4 len + 4 type + len + 4 crc
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error('unsupported PNG: need 8-bit RGBA (color type 6)');
  }
  if (interlace !== 0) throw new Error('interlaced PNG not supported');
  const inflated = inflateSync(Buffer.concat(idatParts));
  const bpp = 4;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = inflated[pos++];
    for (let i = 0; i < stride; i++) {
      const x = inflated[pos++];
      const a = i >= bpp ? out[y * stride + i - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = (i >= bpp && y > 0) ? out[(y - 1) * stride + i - bpp] : 0;
      let v;
      switch (ft) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error('unknown PNG filter type ' + ft);
      }
      out[y * stride + i] = v & 0xff;
    }
  }
  return { width: w, height: h, rgba: out };
}

// PNG RGBA bytes -> rgba32 words (matching index.html's rgba32 exactly).
// Alpha 0 collapses to the transparent word 0.
function pngToWords(buf) {
  const { width, height, rgba } = decodePNG(buf);
  if (width !== SPRITE_SIZE || height !== SPRITE_SIZE) {
    throw new Error(`expected ${SPRITE_SIZE}x${SPRITE_SIZE}, got ${width}x${height}`);
  }
  const words = new Uint32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const al = rgba[i * 4 + 3];
    words[i] = al === 0 ? 0 : (((255 << 24) | (b << 16) | (g << 8) | r) >>> 0);
  }
  return words;
}

// Raw little-endian Uint32Array bytes -> base64 (no compression; the runtime
// inflater is a plain base64 -> Uint32Array reinterpret).
function wordsToBase64(words) {
  const bytes = Buffer.alloc(words.length * 4);
  for (let i = 0; i < words.length; i++) bytes.writeUInt32LE(words[i] >>> 0, i * 4);
  return bytes.toString('base64');
}

// ---------------------------------------------------------------------------
// Mode: --bootstrap
// ---------------------------------------------------------------------------
function bootstrap(force) {
  if (!existsSync(SPRITES_DIR)) mkdirSync(SPRITES_DIR, { recursive: true });
  let wrote = 0, skipped = 0;
  for (const name of Object.keys(SPRITE_DEFS)) {
    const def = SPRITE_DEFS[name];
    const file = join(SPRITES_DIR, `${name}.png`);
    if (existsSync(file) && !force) {
      console.log(`skip   ${name}.png (exists; pass --force to overwrite)`);
      skipped++;
      continue;
    }
    const words = buildFrame(def.rows, def.palette);
    writeFileSync(file, encodePNG(words, SPRITE_SIZE, SPRITE_SIZE));
    console.log(`wrote  assets/sprites/${name}.png`);
    wrote++;
  }
  console.log(`bootstrap done — ${wrote} written, ${skipped} skipped`);
}

// ---------------------------------------------------------------------------
// Mode: default — splice the sentinel region of index.html.
// ---------------------------------------------------------------------------
function buildBakedRegion(b64ByBinding) {
  const names = Object.keys(b64ByBinding).sort();
  const lines = [];
  lines.push('const BAKED_SPRITES = {');
  for (const n of names) lines.push(`  ${JSON.stringify(n)}: ${JSON.stringify(b64ByBinding[n])},`);
  lines.push('};');
  lines.push('function inflateSprite(b64) {');
  lines.push('  const bin = atob(b64), n = bin.length, bytes = new Uint8Array(n);');
  lines.push('  for (let i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);');
  lines.push('  return new Uint32Array(bytes.buffer);');
  lines.push('}');
  for (const n of names) lines.push(`const ${n} = inflateSprite(BAKED_SPRITES.${n});`);
  return lines;
}

function splice() {
  const b64ByBinding = {};
  for (const name of Object.keys(SPRITE_DEFS)) {
    const file = join(SPRITES_DIR, `${name}.png`);
    if (!existsSync(file)) {
      throw new Error(
        `missing ${file} — run \`node tools/bake-sprites.mjs --bootstrap\` first`);
    }
    const words = pngToWords(readFileSync(file));
    b64ByBinding[FRAME_BINDINGS[name]] = wordsToBase64(words);
  }

  const html = readFileSync(INDEX_HTML, 'utf8');
  const bi = html.indexOf(BEGIN_MARK);
  const ei = html.indexOf(END_MARK);
  if (bi < 0 || ei < 0 || ei < bi) {
    throw new Error('sentinel markers not found in index.html');
  }
  // Keep file start through the end of the BEGIN line (incl. its newline).
  const beginLineStart = html.lastIndexOf('\n', bi) + 1;
  const beginLineEnd = html.indexOf('\n', bi);
  const beginLine = html.slice(beginLineStart, beginLineEnd);
  const indent = beginLine.match(/^[ \t]*/)[0];
  const head = html.slice(0, beginLineEnd + 1);
  // Keep from the start of the END line through EOF (incl. the END line).
  const endLineStart = html.lastIndexOf('\n', ei) + 1;
  const tail = html.slice(endLineStart);

  const body = buildBakedRegion(b64ByBinding)
    .map((l) => (l.length ? indent + l : l) + '\n')
    .join('');

  const next = head + body + tail;
  if (next === html) {
    console.log('bake: index.html already up to date (no diff)');
    return;
  }
  writeFileSync(INDEX_HTML, next);
  console.log(`bake: rewrote sentinel region (${Object.keys(b64ByBinding).length} frames)`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.includes('--bootstrap')) {
  bootstrap(args.includes('--force'));
} else {
  splice();
}
