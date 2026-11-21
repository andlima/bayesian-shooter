#!/usr/bin/env node
// ===========================================================================
// bake-sprites.mjs — manifest-driven PNG → index.html sprite pipeline.
//
// Zero npm dependencies — only Node built-ins (fs, path, zlib, url). Runs
// under the repo's Node (v24+).
//
// Every pixel-art sprite the game draws (enemies, pickups, exit pillar,
// projectiles, the three weapon viewmodels, the two muzzle-flash frames) is
// authored as an 8-bit RGBA PNG under assets/sprites/ and listed once in
// MANIFEST below. The PNGs are the sole source of truth; git history is the
// record of the pre-pipeline procedural art.
//
// Modes:
//
//   node tools/bake-sprites.mjs                       (default — `make bake`)
//       Decodes every MANIFEST PNG and rewrites ONLY the region of
//       index.html between the sentinel lines
//           // <BAKED_SPRITES_BEGIN> ...
//           // <BAKED_SPRITES_END>
//       Every byte outside that region is left untouched. Output is
//       deterministic (manifest order, fixed formatting), so running it
//       twice produces no further diff.
//
//   node tools/bake-sprites.mjs --check               (`make check`)
//       Exit 0 if baking would leave index.html unchanged; exit 1 naming
//       the stale bindings otherwise. Writes nothing.
//
//   node tools/bake-sprites.mjs --preview <out.png> [--scale N]
//       Contact sheet of every MANIFEST sprite (nearest-neighbour upscaled,
//       default 4×) on a grey checkerboard, in manifest order, 8 px gutter,
//       rows wrapping at 1024 px. Prints a legend to stdout.
//
//   node tools/bake-sprites.mjs --dump <png>
//       Print a PNG as the editable text format (palette lines, `---`, then
//       one row of symbols per pixel row; `.` = transparent).
//
//   node tools/bake-sprites.mjs --encode <txt> <png>
//       Read that text format and write an 8-bit RGBA PNG.
//
// Encoding in index.html (per manifest entry):
//     "VM_PISTOL_IDLE": { w: 96, h: 104, pal: [4279440660, …], rle: "AQIB…" },
//   pal  — distinct non-zero rgba32 words, sorted ascending as unsigned
//          32-bit integers (≤ 255 entries).
//   rle  — base64 of (runLength, index) byte pairs over the row-major index
//          stream, where index 0 = transparent and k = pal[k - 1];
//          runLength ∈ 1..255 (longer runs are split).
// The runtime inflater is a dozen synchronous lines (no Image, fetch,
// canvas decode or await), so startup stays synchronous and file:// works.
//
// Pixel word format: rgba32() in index.html packs a pixel as the unsigned
// 32-bit word (255 << 24) | (b << 16) | (g << 8) | r — R in the least
// significant byte, A (always 255 for drawn pixels) in the most significant.
// A fully transparent pixel is the word 0. PNG alpha 0 maps to word 0; any
// other alpha maps to an opaque word carrying the PNG's RGB.
// ===========================================================================

import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SPRITES_DIR = join(REPO_ROOT, 'assets', 'sprites');
const INDEX_HTML = join(REPO_ROOT, 'index.html');

const BEGIN_MARK = '<BAKED_SPRITES_BEGIN>';
const END_MARK = '<BAKED_SPRITES_END>';

const MAX_PALETTE = 255;
const PREVIEW_WRAP_PX = 1024;
const PREVIEW_GUTTER_PX = 8;
const PREVIEW_DEFAULT_SCALE = 4;

// ---------------------------------------------------------------------------
// MANIFEST — the only list of baked sprites. `file` lives in assets/sprites/,
// `binding` is the const name the generated region declares in index.html,
// `w`/`h` are the required PNG dimensions (the bake errors on a mismatch).
// Bindings are consumed by SPRITES / WEAPONS / drawGunViewmodel unchanged.
// ---------------------------------------------------------------------------
export const MANIFEST = [
  { file: 'imp_walk_1.png',     binding: 'impWalk1',           w: 32, h: 32 },
  { file: 'imp_walk_2.png',     binding: 'impWalk2',           w: 32, h: 32 },
  { file: 'imp_wind.png',       binding: 'impWind',            w: 32, h: 32 },
  { file: 'imp_fire.png',       binding: 'impFire',            w: 32, h: 32 },
  { file: 'grunt_walk_1.png',   binding: 'gruntWalk1',         w: 32, h: 32 },
  { file: 'grunt_walk_2.png',   binding: 'gruntWalk2',         w: 32, h: 32 },
  { file: 'grunt_wind.png',     binding: 'gruntWind',          w: 32, h: 32 },
  { file: 'grunt_fire.png',     binding: 'gruntFire',          w: 32, h: 32 },
  { file: 'exit_1.png',         binding: 'exitFrame1',         w: 32, h: 32 },
  { file: 'exit_2.png',         binding: 'exitFrame2',         w: 32, h: 32 },
  { file: 'proj_imp_1.png',     binding: 'impProjFrame1',      w: 32, h: 32 },
  { file: 'proj_imp_2.png',     binding: 'impProjFrame2',      w: 32, h: 32 },
  { file: 'proj_grunt_1.png',   binding: 'gruntProjFrame1',    w: 32, h: 32 },
  { file: 'proj_grunt_2.png',   binding: 'gruntProjFrame2',    w: 32, h: 32 },
  { file: 'medkit_small.png',   binding: 'medkitSmallFrame',   w: 32, h: 32 },
  { file: 'medkit_large.png',   binding: 'medkitLargeFrame',   w: 32, h: 32 },
  { file: 'ammo_small.png',     binding: 'ammoSmallFrame',     w: 32, h: 32 },
  { file: 'ammo_large.png',     binding: 'ammoLargeFrame',     w: 32, h: 32 },
  { file: 'pickup_shotgun.png', binding: 'weaponShotgunFrame', w: 32, h: 32 },
  { file: 'vm_pistol_idle.png',  binding: 'VM_PISTOL_IDLE',    w: 96, h: 104 },
  { file: 'vm_pistol_fire.png',  binding: 'VM_PISTOL_FIRE',    w: 96, h: 104 },
  { file: 'vm_shotgun_idle.png', binding: 'VM_SHOTGUN_IDLE',   w: 96, h: 104 },
  { file: 'vm_shotgun_fire.png', binding: 'VM_SHOTGUN_FIRE',   w: 96, h: 104 },
  { file: 'vm_shotgun_pump.png', binding: 'VM_SHOTGUN_PUMP',   w: 96, h: 104 },
  { file: 'vm_knife_idle.png',   binding: 'VM_KNIFE_IDLE',     w: 96, h: 104 },
  { file: 'vm_knife_slash.png',  binding: 'VM_KNIFE_SLASH',    w: 96, h: 104 },
  { file: 'flash_pistol_1.png',  binding: 'FLASH_PISTOL_1',    w: 24, h: 24 },
  { file: 'flash_pistol_2.png',  binding: 'FLASH_PISTOL_2',    w: 24, h: 24 },
  { file: 'flash_shotgun_1.png', binding: 'FLASH_SHOTGUN_1',   w: 40, h: 40 },
  { file: 'flash_shotgun_2.png', binding: 'FLASH_SHOTGUN_2',   w: 40, h: 40 },
  // viewmodel-mitten-placement: the seven vm_* rows above are the mitten art
  // (VM_VARIANTS base / low / lower share them). The rows below are the two
  // redrawn placement variants — compact (same weapon, short hand wrap) and
  // wide (bigger Doom-style weapon). Appended after the flash rows so the
  // baked-region diff stays minimal.
  { file: 'vm_pistol_idle_compact.png',  binding: 'VM_PISTOL_IDLE_COMPACT',  w: 96, h: 104 },
  { file: 'vm_pistol_fire_compact.png',  binding: 'VM_PISTOL_FIRE_COMPACT',  w: 96, h: 104 },
  { file: 'vm_shotgun_idle_compact.png', binding: 'VM_SHOTGUN_IDLE_COMPACT', w: 96, h: 104 },
  { file: 'vm_shotgun_fire_compact.png', binding: 'VM_SHOTGUN_FIRE_COMPACT', w: 96, h: 104 },
  { file: 'vm_shotgun_pump_compact.png', binding: 'VM_SHOTGUN_PUMP_COMPACT', w: 96, h: 104 },
  { file: 'vm_knife_idle_compact.png',   binding: 'VM_KNIFE_IDLE_COMPACT',   w: 96, h: 104 },
  { file: 'vm_knife_slash_compact.png',  binding: 'VM_KNIFE_SLASH_COMPACT',  w: 96, h: 104 },
  { file: 'vm_pistol_idle_wide.png',     binding: 'VM_PISTOL_IDLE_WIDE',     w: 96, h: 104 },
  { file: 'vm_pistol_fire_wide.png',     binding: 'VM_PISTOL_FIRE_WIDE',     w: 96, h: 104 },
  { file: 'vm_shotgun_idle_wide.png',    binding: 'VM_SHOTGUN_IDLE_WIDE',    w: 96, h: 104 },
  { file: 'vm_shotgun_fire_wide.png',    binding: 'VM_SHOTGUN_FIRE_WIDE',    w: 96, h: 104 },
  { file: 'vm_shotgun_pump_wide.png',    binding: 'VM_SHOTGUN_PUMP_WIDE',    w: 96, h: 104 },
  { file: 'vm_knife_idle_wide.png',      binding: 'VM_KNIFE_IDLE_WIDE',      w: 96, h: 104 },
  { file: 'vm_knife_slash_wide.png',     binding: 'VM_KNIFE_SLASH_WIDE',     w: 96, h: 104 },
];

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

// words: Uint32Array (or array) of w*h rgba32 words, row-major.
// Returns a Buffer holding an 8-bit RGBA PNG (filter 0 on every row).
export function encodePNG(words, w, h) {
  if (words.length !== w * h) {
    throw new Error(`encodePNG: ${words.length} words do not fill ${w}x${h}`);
  }
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

// Returns { width, height, rgba } where rgba is a Buffer of width*height*4
// unfiltered bytes. Handles filter types 0–4; rejects anything that is not
// 8-bit RGBA (color type 6), non-interlaced.
export function decodePNG(buf) {
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

// PNG RGBA bytes -> { w, h, words } with words a Uint32Array of rgba32
// words (matching index.html's rgba32 exactly). Alpha 0 collapses to the
// transparent word 0; any other alpha yields an opaque word.
export function pngToWords(buf) {
  const { width, height, rgba } = decodePNG(buf);
  const words = new Uint32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const al = rgba[i * 4 + 3];
    words[i] = al === 0 ? 0 : (((255 << 24) | (b << 16) | (g << 8) | r) >>> 0);
  }
  return { w: width, h: height, words };
}

// ---------------------------------------------------------------------------
// Text sprite format (--dump / --encode; also what the art specs author in).
//
//   # comment lines and blank lines are ignored
//   R 220 60 50          <symbol> <r> <g> <b>, one per palette colour
//   ---                  separates palette from rows
//   ....RRrr....         one line per pixel row; '.' = transparent
// ---------------------------------------------------------------------------
const TEXT_SYMBOLS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*+=?!~^<>:;,/|';

function wordToRGB(word) {
  return [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff];
}
function rgbToWord(r, g, b) {
  return ((255 << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff)) >>> 0;
}

// words (w*h rgba32) -> text. Symbols are assigned in order of first
// appearance (row-major) from TEXT_SYMBOLS; errors past its length.
export function wordsToText(words, w, h) {
  if (words.length !== w * h) {
    throw new Error(`wordsToText: ${words.length} words do not fill ${w}x${h}`);
  }
  const symbolOf = new Map();
  const palLines = [];
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const v = words[y * w + x] >>> 0;
      if (v === 0) { row += '.'; continue; }
      let sym = symbolOf.get(v);
      if (sym === undefined) {
        if (symbolOf.size >= TEXT_SYMBOLS.length) {
          throw new Error(
            `wordsToText: more than ${TEXT_SYMBOLS.length} colours — text format cannot represent it`);
        }
        sym = TEXT_SYMBOLS[symbolOf.size];
        symbolOf.set(v, sym);
        const [r, g, b] = wordToRGB(v);
        palLines.push(`${sym} ${r} ${g} ${b}`);
      }
      row += sym;
    }
    rows.push(row);
  }
  return [
    `# ${w}x${h} — palette: <symbol> <r> <g> <b>; '---' then one row per line; '.' = transparent`,
    ...palLines,
    '---',
    ...rows,
    '',
  ].join('\n');
}

// text -> { w, h, words }. Errors on ragged rows, unknown symbols, bad
// palette lines or a missing '---' separator.
export function textToWords(text) {
  const lines = text.split(/\r?\n/);
  const palette = new Map();
  const rows = [];
  let inRows = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = inRows ? raw.replace(/\s+$/, '') : raw.trim();
    if (!inRows) {
      if (line === '' || line.startsWith('#')) continue;
      if (line === '---') { inRows = true; continue; }
      const m = line.match(/^(\S)\s+(\d+)\s+(\d+)\s+(\d+)$/);
      if (!m || m[1] === '.') {
        throw new Error(`textToWords: bad palette line ${i + 1}: ${JSON.stringify(raw)}`);
      }
      const [r, g, b] = [Number(m[2]), Number(m[3]), Number(m[4])];
      if (r > 255 || g > 255 || b > 255) {
        throw new Error(`textToWords: colour component out of range on line ${i + 1}`);
      }
      if (palette.has(m[1])) {
        throw new Error(`textToWords: duplicate symbol ${JSON.stringify(m[1])} on line ${i + 1}`);
      }
      palette.set(m[1], rgbToWord(r, g, b));
    } else {
      if (line === '' || line.startsWith('#')) continue;
      rows.push({ line, no: i + 1 });
    }
  }
  if (!inRows) throw new Error("textToWords: missing '---' separator");
  if (rows.length === 0) throw new Error('textToWords: no pixel rows after ---');
  const w = rows[0].line.length;
  const h = rows.length;
  const words = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    const { line, no } = rows[y];
    if (line.length !== w) {
      throw new Error(
        `textToWords: ragged row on line ${no} (expected ${w} columns, got ${line.length})`);
    }
    for (let x = 0; x < w; x++) {
      const c = line[x];
      if (c === '.') continue;
      const v = palette.get(c);
      if (v === undefined) {
        throw new Error(`textToWords: unknown symbol ${JSON.stringify(c)} on line ${no}, column ${x + 1}`);
      }
      words[y * w + x] = v;
    }
  }
  return { w, h, words };
}

// ---------------------------------------------------------------------------
// Palette + RLE encoding of a frame for the generated region.
// ---------------------------------------------------------------------------
function encodeFrame(words, binding) {
  const set = new Set();
  for (let i = 0; i < words.length; i++) {
    const v = words[i] >>> 0;
    if (v !== 0) set.add(v);
  }
  const pal = Array.from(set).sort((a, b) => a - b);
  if (pal.length > MAX_PALETTE) {
    throw new Error(`${binding}: ${pal.length} colours exceed the ${MAX_PALETTE}-entry palette limit`);
  }
  const indexOf = new Map();
  pal.forEach((v, i) => indexOf.set(v, i + 1));
  const bytes = [];
  let i = 0;
  while (i < words.length) {
    const v = words[i] >>> 0;
    let run = 1;
    while (i + run < words.length && (words[i + run] >>> 0) === v && run < 255) run++;
    bytes.push(run, v === 0 ? 0 : indexOf.get(v));
    i += run;
  }
  return { pal, rle: Buffer.from(bytes).toString('base64') };
}

// Node-side mirror of the runtime inflater (Buffer instead of atob). Used by
// --check's self-test and by scratch oracles that import this module.
export function inflateBaked(d) {
  const out = new Uint32Array(d.w * d.h);
  const bin = Buffer.from(d.rle, 'base64');
  for (let i = 0, p = 0; i < bin.length; i += 2) {
    const run = bin[i], k = bin[i + 1];
    const v = k ? d.pal[k - 1] : 0;
    for (let r = 0; r < run; r++) out[p++] = v;
  }
  out.w = d.w; out.h = d.h;
  return out;
}

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------
function loadManifestFrames() {
  const frames = [];
  for (const entry of MANIFEST) {
    const file = join(SPRITES_DIR, entry.file);
    if (!existsSync(file)) {
      throw new Error(`missing assets/sprites/${entry.file} (binding ${entry.binding})`);
    }
    let decoded;
    try {
      decoded = pngToWords(readFileSync(file));
    } catch (e) {
      throw new Error(`assets/sprites/${entry.file}: ${e.message}`);
    }
    if (decoded.w !== entry.w || decoded.h !== entry.h) {
      throw new Error(
        `assets/sprites/${entry.file}: expected ${entry.w}x${entry.h} per MANIFEST, got ${decoded.w}x${decoded.h}`);
    }
    frames.push({ ...entry, words: decoded.words });
  }
  return frames;
}

// ---------------------------------------------------------------------------
// Generated region
// ---------------------------------------------------------------------------
function frameLine(frame) {
  const { pal, rle } = encodeFrame(frame.words, frame.binding);
  return `  ${JSON.stringify(frame.binding)}: { w: ${frame.w}, h: ${frame.h}, pal: [${pal.join(', ')}], rle: ${JSON.stringify(rle)} },`;
}

function buildBakedRegion(frames) {
  const lines = [];
  lines.push('const BAKED_SPRITES = {');
  for (const f of frames) lines.push(frameLine(f));
  lines.push('};');
  lines.push('function inflateSprite(d) {');
  lines.push('  const out = new Uint32Array(d.w * d.h);');
  lines.push('  const bin = atob(d.rle);');
  lines.push('  for (let i = 0, p = 0; i < bin.length; i += 2) {');
  lines.push('    const run = bin.charCodeAt(i), k = bin.charCodeAt(i + 1);');
  lines.push('    const v = k ? d.pal[k - 1] : 0;');
  lines.push('    for (let r = 0; r < run; r++) out[p++] = v;');
  lines.push('  }');
  lines.push('  out.w = d.w; out.h = d.h;');
  lines.push('  return out;');
  lines.push('}');
  for (const f of frames) lines.push(`const ${f.binding} = inflateSprite(BAKED_SPRITES.${f.binding});`);
  return lines;
}

// Returns { html, next, body, indent } — the current file, what the bake
// would write, and the region body it would splice in.
function renderBake(frames) {
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
  const current = html.slice(beginLineEnd + 1, endLineStart);

  const body = buildBakedRegion(frames)
    .map((l) => (l.length ? indent + l : l) + '\n')
    .join('');

  return { html, next: head + body + tail, body, current, indent };
}

function bake() {
  const frames = loadManifestFrames();
  const { html, next, body } = renderBake(frames);
  if (next === html) {
    console.log('bake: index.html already up to date (no diff)');
    return;
  }
  writeFileSync(INDEX_HTML, next);
  console.log(
    `bake: rewrote sentinel region (${frames.length} frames, ${Buffer.byteLength(body)} bytes)`);
}

function check() {
  const frames = loadManifestFrames();
  const { html, next, current, indent } = renderBake(frames);
  if (next === html) {
    console.log('check: index.html is up to date');
    return 0;
  }
  const currentLines = new Set(current.split('\n'));
  const stale = [];
  for (const f of frames) {
    if (!currentLines.has(indent + frameLine(f))) stale.push(f.binding);
  }
  if (stale.length) {
    console.error(`check: index.html is stale — rebake (make bake). Stale bindings: ${stale.join(', ')}`);
  } else {
    console.error('check: index.html baked region differs in structure (inflater or binding order) — rebake (make bake)');
  }
  return 1;
}

// ---------------------------------------------------------------------------
// --preview: contact sheet
// ---------------------------------------------------------------------------
const CHECKER_A = rgbToWord(96, 96, 96);
const CHECKER_B = rgbToWord(160, 160, 160);
const CHECKER_CELL = 8;

function preview(outPath, scale) {
  const frames = loadManifestFrames();
  // Layout pass: manifest order, wrap when the next cell would exceed the
  // wrap width. Row height is the tallest sprite in that row.
  const cells = [];
  let x = PREVIEW_GUTTER_PX, y = PREVIEW_GUTTER_PX, rowH = 0, sheetW = 0;
  for (const f of frames) {
    const cw = f.w * scale, ch = f.h * scale;
    if (x > PREVIEW_GUTTER_PX && x + cw + PREVIEW_GUTTER_PX > PREVIEW_WRAP_PX) {
      x = PREVIEW_GUTTER_PX;
      y += rowH + PREVIEW_GUTTER_PX;
      rowH = 0;
    }
    cells.push({ f, x, y, cw, ch });
    x += cw + PREVIEW_GUTTER_PX;
    rowH = Math.max(rowH, ch);
    sheetW = Math.max(sheetW, x);
  }
  const sheetH = y + rowH + PREVIEW_GUTTER_PX;
  const sheet = new Uint32Array(sheetW * sheetH);
  for (let yy = 0; yy < sheetH; yy++) {
    for (let xx = 0; xx < sheetW; xx++) {
      const odd = (((xx / CHECKER_CELL) | 0) + ((yy / CHECKER_CELL) | 0)) & 1;
      sheet[yy * sheetW + xx] = odd ? CHECKER_B : CHECKER_A;
    }
  }
  for (const { f, x: cx, y: cy, cw, ch } of cells) {
    for (let yy = 0; yy < ch; yy++) {
      const sy = (yy / scale) | 0;
      for (let xx = 0; xx < cw; xx++) {
        const sx = (xx / scale) | 0;
        const v = f.words[sy * f.w + sx] >>> 0;
        if (v !== 0) sheet[(cy + yy) * sheetW + (cx + xx)] = v;
      }
    }
  }
  writeFileSync(outPath, encodePNG(sheet, sheetW, sheetH));
  console.log('index  file  binding  w×h  colours');
  frames.forEach((f, i) => {
    const colours = new Set(Array.from(f.words).filter((v) => v !== 0)).size;
    console.log(`${String(i).padStart(2)}  ${f.file}  ${f.binding}  ${f.w}×${f.h}  ${colours}`);
  });
  console.log(`preview: wrote ${outPath} (${sheetW}×${sheetH}, scale ${scale}×)`);
}

// ---------------------------------------------------------------------------
// --dump / --encode
// ---------------------------------------------------------------------------
function dump(pngPath) {
  const { w, h, words } = pngToWords(readFileSync(pngPath));
  process.stdout.write(wordsToText(words, w, h));
}

function encode(txtPath, pngPath) {
  const { w, h, words } = textToWords(readFileSync(txtPath, 'utf8'));
  writeFileSync(pngPath, encodePNG(words, w, h));
  console.log(`encode: wrote ${pngPath} (${w}×${h})`);
}

// ---------------------------------------------------------------------------
// CLI — only runs when executed directly, so the codec can be imported.
// ---------------------------------------------------------------------------
function usage() {
  console.error([
    'usage: node tools/bake-sprites.mjs                     bake (rewrite the index.html region)',
    '       node tools/bake-sprites.mjs --check             exit 1 if the region is stale',
    '       node tools/bake-sprites.mjs --preview <out.png> [--scale N]',
    '       node tools/bake-sprites.mjs --dump <png>',
    '       node tools/bake-sprites.mjs --encode <txt> <png>',
  ].join('\n'));
  return 2;
}

function main(argv) {
  const args = argv.slice();
  const mode = args[0];
  if (mode === undefined) { bake(); return 0; }
  if (mode === '--check') return check();
  if (mode === '--preview') {
    const out = args[1];
    if (!out || out.startsWith('--')) return usage();
    let scale = PREVIEW_DEFAULT_SCALE;
    const si = args.indexOf('--scale');
    if (si >= 0) {
      scale = Number(args[si + 1]);
      if (!Number.isInteger(scale) || scale < 1) {
        console.error('--scale needs a positive integer');
        return 2;
      }
    }
    preview(out, scale);
    return 0;
  }
  if (mode === '--dump') {
    if (!args[1]) return usage();
    dump(args[1]);
    return 0;
  }
  if (mode === '--encode') {
    if (!args[1] || !args[2]) return usage();
    encode(args[1], args[2]);
    return 0;
  }
  return usage();
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`bake-sprites: ${e.message}`);
    process.exitCode = 1;
  }
}
