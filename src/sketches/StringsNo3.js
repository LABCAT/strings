import p5 from 'p5';
import '@lib/p5.audioReact.js';
import {
  getPatternLocalAnchors,
  randomPatternName,
} from '@lib/patternAnchors.js';

const base = import.meta.env.BASE_URL || './';
const audio = base + 'audio/StringsNo3.mp3';
const midi = base + 'audio/StringsNo3.mid';

const STRAND_COUNT = 48;
const POINTS_PER_STRAND = 48;
/** Glow pass uses every Nth point — soft halo, fewer WEBGL vertices. */
const GLOW_POINT_STEP = 2;
/** Base ellipsoid size of the string field around the halo center. */
const HALO_RX = 220;
const HALO_RY = 140;
const HALO_RZ = 160;
const HALO_FOLLOW = 0.1;
/** Touch Orchestra timpani keyzone: midi <= 53. */
const TIMPANI_MIDI_MAX = 53;
const STRAND_EASE = 0.045;
const EXPAND_MIN_SEC = 0.2;
const STAR_POINTS = 6;
const STAR_SHELL_MIN = 380;
const STAR_SHELL_MAX = 1100;
const STAR_COUNT_MIN = 52;
const STAR_COUNT_MAX = 110;
/** Track1 fires once per bar: phrase1 = 16, phrase2 = 19. */
const PHRASE1_BARS = 16;
const TOTAL_BARS = 35;
/** Pattern fill relative to halo ellipsoid — keep under 1 so shapes stay readable. */
const PATTERN_SCALE = 0.92;

/**
 * Mobile short-side is ~360–500 (leave framing alone).
 * Desktop short-side grows → pull camera in + mild early field boost.
 */
function viewportFit(w, h) {
  const longSide = Math.max(w, h);
  const shortSide = Math.min(w, h);
  const desktop = clamp01((shortSide - 500) / 520);
  return {
    // Phone stays ~0.35×; large desktop ~0.12×.
    cameraRadius: longSide * (0.35 - desktop * 0.23),
    fieldBoost: 1 + desktop * 0.4,
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smooth01(t) {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
}

function getSongArc(bar) {
  const b = Math.max(1, Math.min(TOTAL_BARS, bar | 0));
  const phrase = b <= PHRASE1_BARS ? 1 : 2;
  const progress = smooth01((b - 1) / Math.max(1, TOTAL_BARS - 1));
  let energy = progress;
  if (phrase === 2) energy = Math.min(1, progress * 0.82 + 0.28);
  return { bar: b, phrase, progress, energy };
}

function hsbToRgb(h, s, b) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  b = Math.max(0, Math.min(100, b)) / 100;
  const c = b * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = b - c;
  let r = 0;
  let g = 0;
  let bl = 0;
  if (h < 60) [r, g, bl] = [c, x, 0];
  else if (h < 120) [r, g, bl] = [x, c, 0];
  else if (h < 180) [r, g, bl] = [0, c, x];
  else if (h < 240) [r, g, bl] = [0, x, c];
  else if (h < 300) [r, g, bl] = [x, 0, c];
  else [r, g, bl] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((bl + m) * 255),
  ];
}

/** Soft-steer hues out of green (≈75–155). Still allows green occasionally. */
function avoidGreenHue(h, rng, keepChance = 0.16) {
  h = ((h % 360) + 360) % 360;
  if (h < 75 || h > 155) return h;
  if (rng() < keepChance) return h;
  // Prefer cool teal/blue; sometimes warm amber — both sit outside the green band.
  return rng() < 0.65 ? 165 + rng() * 55 : 20 + rng() * 45;
}

function generateUniverseGradient(rng = Math.random, {
  bright = false,
  hueBase = 210,
  aurora = 0,
  hueSeed = 0,
  haloCx = 50,
  haloCy = 52,
} = {}) {
  // Halo radial stays the structural base. Accent stack borrows Glyphs' layered
  // linears/radials + difference blends, but stays palette-anchored to the arc.
  // Layer counts / falloff stay fixed so the wash doesn't get less radial over time.
  const base = avoidGreenHue((hueBase + hueSeed + 360) % 360, rng, 0.12);
  const a = Math.max(0, Math.min(1, aurora));
  const boost = bright ? 22 : 0;
  const satBoost = bright ? 14 : 0;

  const layers = [];
  const blends = [];

  // Fixed Glyphs-weight accent stack (no aurora-driven extra linears).
  const linearCount = 3;
  for (let i = 0; i < linearCount; i++) {
    const angle = Math.floor(rng() * 360);
    // Wide jumps (incl. complementary) — soft neighbor hues were invisible.
    const h1 = avoidGreenHue((base + rng() * 80 + i * 55 + (i % 2 === 0 ? 0 : 140) + 360) % 360, rng);
    const h2 = avoidGreenHue((h1 + 60 + rng() * 120 + 360) % 360, rng);
    const [lr1, lg1, lb1] = hsbToRgb(
      h1,
      55 + rng() * 40 + satBoost,
      Math.min(100, 45 + rng() * 50 + boost + a * 10)
    );
    const [lr2, lg2, lb2] = hsbToRgb(
      h2,
      50 + rng() * 40,
      Math.min(100, 25 + rng() * 45 + boost * 0.5)
    );
    const stop1 = Math.floor(rng() * 30);
    const stop2 = 65 + Math.floor(rng() * 30);
    layers.push(
      `linear-gradient(${angle}deg, rgb(${lr1}, ${lg1}, ${lb1}) ${stop1}%, rgb(${lr2}, ${lg2}, ${lb2}) ${stop2}%)`
    );
    // First soft-light so one less difference shredder over the orb.
    if (i === 0 || i === 1) blends.push('soft-light');
    else blends.push('difference');
  }

  const radialAccents = 2;
  for (let i = 0; i < radialAccents; i++) {
    const size1 = 75 + Math.floor(rng() * 50);
    const size2 = 75 + Math.floor(rng() * 50);
    // Bias toward halo so accents reinforce the orb more often.
    const posX = Math.floor(Math.max(5, Math.min(95, haloCx + (rng() - 0.5) * 50)));
    const posY = Math.floor(Math.max(5, Math.min(95, haloCy + (rng() - 0.5) * 50)));
    const h1 = avoidGreenHue((base + rng() * 100 + i * 110 + 360) % 360, rng);
    const h2 = avoidGreenHue((h1 + 120 + rng() * 80 + 360) % 360, rng);
    const [ar1, ag1, ab1] = hsbToRgb(
      h1,
      55 + rng() * 40 + satBoost,
      Math.min(100, 50 + rng() * 45 + boost)
    );
    const [ar2, ag2, ab2] = hsbToRgb(h2, 40 + rng() * 35, 8 + rng() * 22);
    layers.push(
      `radial-gradient(${size1}% ${size2}% at ${posX}% ${posY}%, rgb(${ar1}, ${ag1}, ${ab1}) 0%, rgb(${ar2}, ${ag2}, ${ab2}) 100%)`
    );
    blends.push(i === 0 ? 'difference' : 'soft-light');
  }

  // Soft companion glow — fixed count, near-halo tint only.
  const companions = 1;
  for (let i = 0; i < companions; i++) {
    const ch = avoidGreenHue((base + 40 + i * 80 + rng() * 50 + 360) % 360, rng);
    const [cr, cg, cb] = hsbToRgb(ch, 65 + rng() * 30, Math.min(100, 60 + rng() * 35 + boost * 0.5));
    const alpha = 0.22 + rng() * 0.16 + (bright ? 0.1 : 0);
    const ox = Math.max(8, Math.min(92, haloCx + (rng() - 0.5) * 40));
    const oy = Math.max(8, Math.min(92, haloCy + (rng() - 0.5) * 40));
    const rx = 30 + rng() * 45;
    const ry = 20 + rng() * 35;
    layers.push(
      `radial-gradient(ellipse ${rx.toFixed(0)}% ${ry.toFixed(0)}% at ${ox.toFixed(0)}% ${oy.toFixed(0)}%, rgba(${cr}, ${cg}, ${cb}, ${alpha.toFixed(3)}) 0%, rgba(${cr}, ${cg}, ${cb}, 0) 72%)`
    );
    blends.push('screen');
  }

  // Core halo radial — structural base, locked to the string field.
  const hue = avoidGreenHue((base + rng() * 40 - 12 + 360) % 360, rng, 0.1);
  const [r1, g1, b1] = hsbToRgb(hue, 55 + rng() * 25 + satBoost, Math.min(100, 58 + rng() * 28 + boost + a * 8));
  const [r2, g2, b2] = hsbToRgb(avoidGreenHue((hue + 25 + rng() * 35) % 360, rng, 0.1), 50 + rng() * 25 + satBoost * 0.5, Math.min(100, 28 + rng() * 22 + boost * 0.5 + a * 5));
  const [r3, g3, b3] = hsbToRgb(avoidGreenHue((hue + 170 + rng() * 40) % 360, rng, 0.1), 35 + rng() * 25, 4 + rng() * 10);
  const midStop = 48;
  layers.push(
    `radial-gradient(ellipse at var(--halo-cx, 50%) var(--halo-cy, 52%), rgb(${r1}, ${g1}, ${b1}) 0%, rgb(${r2}, ${g2}, ${b2}) ${midStop}%, rgb(${r3}, ${g3}, ${b3}) 100%)`
  );
  blends.push('normal');

  return {
    bg: layers.join(', '),
    blendModes: blends.join(', '),
  };
}

function pickHaloTarget(p) {
  // Screen-space oval position (CSS %); strings are unprojected to match.
  return {
    cx: p.random(22, 78),
    cy: p.random(24, 78),
  };
}

function screenHaloToWorld(p, cx, cy, eyeX, eyeY, eyeZ, lookX = 0, lookY = 0, lookZ = 0) {
  let fx = lookX - eyeX;
  let fy = lookY - eyeY;
  let fz = lookZ - eyeZ;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;

  // right = forward × worldUp
  let rx = -fz;
  let ry = 0;
  let rz = fx;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;

  // up = right × forward
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  const focusDist = fl;
  const fov = Math.PI / 2.4;
  const halfH = focusDist * Math.tan(fov * 0.5);
  const halfW = halfH * (p.width / Math.max(p.height, 1));
  const nx = (cx - 50) / 50;
  const ny = (cy - 50) / 50;

  return {
    x: lookX + rx * nx * halfW + ux * -ny * halfH,
    y: lookY + ry * nx * halfW + uy * -ny * halfH,
    z: lookZ + rz * nx * halfW + uz * -ny * halfH,
  };
}

/** Camera view basis (forward / right / up) — reused by stars + pattern billboard. */
function cameraBasis(eyeX, eyeY, eyeZ, lookX, lookY, lookZ) {
  let fx = lookX - eyeX;
  let fy = lookY - eyeY;
  let fz = lookZ - eyeZ;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;

  let rx = -fz;
  let ry = 0;
  let rz = fx;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;

  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  return { fx, fy, fz, rx, ry, rz, ux, uy, uz };
}
const sketch = (p) => {
  p.canvasWidth = window.innerWidth;
  p.canvasHeight = window.innerHeight;
  p.song = null;
  p.audioLoaded = false;
  p.creditsLogged = false;
  p.hasStarted = false;
  p.PPQ = 3840 * 4;

  p.strands = [];
  p.stars = [];
  p.starShimmer = 0;
  p.starRefresh = null;
  p.t = 0;
  p.cameraAngle = 0;
  p.cameraRadius = 900;
  p.veilOpacity = 0.45; // resting veil — timpani flashes to 1 then eases back here
  p.veilCurrent = 0.45;
  p.halo = { x: 0, y: 0, z: 0 };
  p.haloCss = { cx: 50, cy: 52 };
  p.haloCssTarget = { cx: 50, cy: 52 };
  p.haloScale = 0.7;
  p.haloScaleTarget = 0.7;
  p.hueFamily = 205;
  p.hueSeed = Math.floor(Math.random() * 360);
  p.auroraAmount = 0;
  p.bar = 0;
  p.arc = getSongArc(1);
  p.orbitRate = 0.0022;
  p.motionEase = STRAND_EASE;
  p.expandPow = 1.1;
  p.patternName = null;
  p.patternTight = false;
  p.fieldBoost = 1;

  p.applyViewportFit = () => {
    const fit = viewportFit(p.width || p.canvasWidth, p.height || p.canvasHeight);
    p.cameraRadius = fit.cameraRadius;
    p.fieldBoost = fit.fieldBoost;
  };

  p.setup = async () => {
    p.pixelDensity(1);
    p.frameRate(60);
    p.createCanvas(p.canvasWidth, p.canvasHeight, p.WEBGL);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noFill();
    p.strokeWeight(2);
    p.applyViewportFit();
    p.perspective(p.PI / 2.4, p.width / p.height, 1, 5000);
    document.getElementById("css-string-sky")?.remove();
    document.getElementById("css-string-sky-style")?.remove();
    document.getElementById("timpani-flash")?.remove();
    document.getElementById("timpani-flash-style")?.remove();
    p.applySongArc(1);
    p.applyUniverseGradient();
    document.documentElement.style.setProperty('--play-icon-color', '#ffffffcc');
    p.clear();
    p.seedStrands(STRAND_COUNT);
    p.seedStars(p.starCountForArc());

    await p.loadSong(audio, midi, (midiData) => {
      if (!midiData) return;

      console.log('StringsNo3 MIDI:', midiData);
      console.table(
        midiData.tracks.map((track, index) => ({
          index,
          name: track.name || '',
          notes: track.notes?.length ?? 0,
        }))
      );

      // Track names are source of truth — GM instrument metadata is wrong for Combinator.
      const touchOrchestra = midiData.tracks[6].notes;
      p.scheduleCueSet(touchOrchestra, 'executeTrack1');

      const timpaniNotes = touchOrchestra.filter((n) => n.midi <= TIMPANI_MIDI_MAX);
      console.log(
        `Timpani candidates (midi <= ${TIMPANI_MIDI_MAX}):`,
        timpaniNotes.length,
        timpaniNotes.map((n) => ({ t: +n.time.toFixed(2), midi: n.midi, vel: +n.velocity.toFixed(2) }))
      );
      p.scheduleCueSet(timpaniNotes, "executeTimpani");
    });
  };

  p.applySongArc = (bar) => {
    p.bar = bar;
    const arc = getSongArc(bar);
    p.arc = arc;
    const { energy, progress } = arc;

    // Cool → violet → warm across the piece, offset by a per-session seed.
    p.hueFamily = (205 + progress * 155 + (p.hueSeed || 0) + 360) % 360;
    // Glow/aurora use ~8 bars ahead so cue-1 intensity matches former cue-9.
    const glowArc = getSongArc(Math.min(TOTAL_BARS, bar + 8));
    p.glowEnergy = glowArc.energy;
    p.earlyEnergy = Math.pow(glowArc.energy, 0.5);
    p.auroraAmount = smooth01(glowArc.progress / 0.88);

    // Desktop: boost early field size so patterns aren't tiny at the open.
    const boost = p.fieldBoost ?? 1;
    const earlyBoost = 1 + (1 - energy) * (boost - 1);
    p.haloScaleTarget = p.lerp(0.58, 1.15, energy) * earlyBoost;
    p.orbitRate = p.lerp(0.0012, 0.005, Math.pow(energy, 1.5));
    p.motionEase = p.lerp(0.02, 0.12, energy);
    p.expandPow = p.lerp(1.3, 0.4, energy);

    // Phrase-2 seam: open the field and shift into a fresh palette chapter.
    if (bar === PHRASE1_BARS + 1) {
      p.haloScaleTarget = Math.max(p.haloScaleTarget, 1.28);
      p.orbitRate = Math.max(p.orbitRate, 0.0028);
      p.hueSeed = (p.hueSeed + p.random(70, 150)) % 360;
      p.hueFamily = (205 + progress * 155 + p.hueSeed + 360) % 360;
    }

    return arc;
  };

  p.starCountForArc = () => {
    const { energy } = p.arc || getSongArc(1);
    return Math.floor(p.lerp(STAR_COUNT_MIN, STAR_COUNT_MAX, energy));
  };

  p.applyUniverseGradient = ({ bright = false, moveHalo = true } = {}) => {
    if (moveHalo) {
      p.haloCssTarget = pickHaloTarget(p);
    }
    const { bg: wash, blendModes } = generateUniverseGradient(Math.random, {
      bright,
      hueBase: p.hueFamily,
      aurora: p.auroraAmount || 0,
      hueSeed: p.hueSeed || 0,
      haloCx: p.haloCssTarget?.cx ?? p.haloCss?.cx ?? 50,
      haloCy: p.haloCssTarget?.cy ?? p.haloCss?.cy ?? 52,
    });
    const root = document.documentElement.style;
    root.setProperty('--gradient-bg', wash);
    root.setProperty('--halo-cx', `${p.haloCss.cx}%`);
    root.setProperty('--halo-cy', `${p.haloCss.cy}%`);
    root.setProperty('--gradient-blend-mode', blendModes);
  };

  // Coalesce rapid MIDI-driven style updates onto one rAF to avoid main-thread stalls.
  p.queueUniverseGradient = (opts = {}) => {
    p._pendingGradient = { ...(p._pendingGradient || {}), ...opts };
    if (p._gradientRaf) return;
    p._gradientRaf = requestAnimationFrame(() => {
      p._gradientRaf = 0;
      const pending = p._pendingGradient || {};
      p._pendingGradient = null;
      p.applyUniverseGradient(pending);
    });
  };

  p.executeTimpani = () => {
     p.veilCurrent = 0.9;
  };

  p.draw = () => {
    const playing = !!(p.song && p.song.isPlaying());
    // Idle before first play: veil only. After start (incl. pause): keep scene visible.
    const showScene = playing || !!p.hasStarted;

    p.clear();

    // Veil always — including paused / pre-play.
    p.veilCurrent = p.lerp(p.veilCurrent ?? p.veilOpacity, p.veilOpacity, 0.22);
    p.colorMode(p.RGB, 255);
    p.background(0, 0, 0, p.veilCurrent * 255);
    p.colorMode(p.HSB, 360, 100, 100, 100);

    if (!showScene) return;

    p.blendMode(p.ADD);
    p.noFill();
    p.strokeWeight(2);

    if (playing) {
      p.haloCss.cx = p.lerp(p.haloCss.cx, p.haloCssTarget.cx, HALO_FOLLOW);
      p.haloCss.cy = p.lerp(p.haloCss.cy, p.haloCssTarget.cy, HALO_FOLLOW);
      p.haloScale = p.lerp(p.haloScale, p.haloScaleTarget, 0.06);
      // Throttle CSS halo writes — sub-pixel churn stalls style recalc.
      const hxCss = p.haloCss.cx;
      const hyCss = p.haloCss.cy;
      if (
        Math.abs(hxCss - (p._haloCssWrittenX ?? -1)) > 0.08 ||
        Math.abs(hyCss - (p._haloCssWrittenY ?? -1)) > 0.08
      ) {
        const root = document.documentElement.style;
        root.setProperty('--halo-cx', `${hxCss}%`);
        root.setProperty('--halo-cy', `${hyCss}%`);
        p._haloCssWrittenX = hxCss;
        p._haloCssWrittenY = hyCss;
      }
      p.cameraAngle += p.orbitRate;
    }

    const radius = p.cameraRadius + Math.sin(p.t * 0.3) * 25;
    const eyeX = Math.cos(p.cameraAngle) * radius;
    const eyeY = Math.sin(p.cameraAngle * 0.35) * 90;
    const eyeZ = Math.sin(p.cameraAngle) * radius;
    const lookX = Math.sin(p.t * 0.2) * 15;
    const lookY = Math.cos(p.t * 0.16) * 10;
    const lookZ = 0;
    p.halo = screenHaloToWorld(
      p,
      p.haloCss.cx,
      p.haloCss.cy,
      eyeX,
      eyeY,
      eyeZ,
      lookX,
      lookY,
      lookZ
    );

    p.camera(eyeX, eyeY, eyeZ, lookX, lookY, lookZ, 0, 1, 0);

    const basis = cameraBasis(eyeX, eyeY, eyeZ, lookX, lookY, lookZ);

    if (playing) {
      p.starShimmer = Math.max(0, p.starShimmer - 0.012);
      if (p.starRefresh) {
        p.starRefresh.v += 0.045;
        if (p.starRefresh.v >= 1) p.starRefresh = null;
      }
    }
    drawStars(p, basis, lookX, lookY, lookZ);

    // Keep sacred-geometry destinations face-on as the camera orbits.
    if (playing) syncPatternToCamera(p, basis);

    const now = p.getSongPlaybackTime?.() ?? p.millis() / 1000;
    const strands = p.strands;
    const hx = p.halo.x;
    const hy = p.halo.y;
    const hz = p.halo.z;
    const energy = p.glowEnergy ?? p.arc?.energy ?? 0.3;
    const earlyEnergy = p.earlyEnergy ?? Math.pow(energy, 0.5);
    for (let s = 0; s < strands.length; s++) {
      const strand = strands[s];
      if (playing) {
        easeStrand(p, strand, now);
        strand.nz += strand.drift;
      }
      drawStrand(p, strand, hx, hy, hz, energy, earlyEnergy);
    }

    if (playing) p.t += 0.01;
  };

  p.executeTrack1 = (note) => {
    const { currentCue, midi: pitch } = note;
    p.applySongArc(currentCue);
    const durationSec = Math.max(EXPAND_MIN_SEC, note.duration || 0.5);

    const patternName = randomPatternName(p.patternName);
    p.patternName = patternName;
    p.patternTight = true;

    const locals = getPatternLocalAnchors(patternName, p.strands.length, {
      rx: HALO_RX,
      ry: HALO_RY,
      rz: HALO_RZ,
      scale: (p.haloScaleTarget || 1) * PATTERN_SCALE,
      spin: p.random(p.TWO_PI),
    });

    for (let i = 0; i < p.strands.length; i++) {
      const strand = p.strands[i];
      const local = locals[i];
      strand.localX = local.x;
      strand.localY = local.y;
      strand.localZ = local.z;
    }

    // Billboard with the current camera so the burst target is already face-on.
    const radius = p.cameraRadius + Math.sin(p.t * 0.3) * 25;
    const eyeX = Math.cos(p.cameraAngle) * radius;
    const eyeY = Math.sin(p.cameraAngle * 0.35) * 90;
    const eyeZ = Math.sin(p.cameraAngle) * radius;
    const lookX = Math.sin(p.t * 0.2) * 15;
    const lookY = Math.cos(p.t * 0.16) * 10;
    const lookZ = 0;
    syncPatternToCamera(p, cameraBasis(eyeX, eyeY, eyeZ, lookX, lookY, lookZ));

    const center = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < p.strands.length; i++) {
      const strand = p.strands[i];
      beginStrandExpand(
        p,
        strand,
        { x: strand.tx, y: strand.ty, z: strand.tz },
        center,
        pitch + p.random(-12, 12),
        durationSec
      );
    }

    // Fresh sky each cue so the field never freezes in one layout.
    p.seedStars(p.starCountForArc());
    p.starRefresh = { v: 0 };

    if (currentCue === PHRASE1_BARS + 1) {
      p.queueUniverseGradient({ bright: true, moveHalo: true });
    } else {
      p.queueUniverseGradient();
    }
  };

  p.resetAnimation = () => {
    p.t = 0;
    p.cameraAngle = 0;
    p.starShimmer = 0;
    p.starRefresh = null;
    p.patternName = null;
    p.patternTight = false;
    p.hasStarted = false;
    p.veilCurrent = p.veilOpacity;
    p.halo = { x: 0, y: 0, z: 0 };
    p.haloCss = { cx: 50, cy: 52 };
    p.haloCssTarget = { cx: 50, cy: 52 };
    p.haloScale = 0.7;
    p.haloScaleTarget = 0.7;
    p.hueFamily = 205;
    p.hueSeed = Math.floor(Math.random() * 360);
    p.auroraAmount = 0;
    p.bar = 0;
    p.applySongArc(1);
    p.applyUniverseGradient({ moveHalo: true });
    p.seedStrands(STRAND_COUNT);
    p.seedStars(p.starCountForArc());
    p.clear();
  };

  p.seedStrands = (count) => {
    p.strands = [];
    for (let i = 0; i < count; i++) {
      p.strands.push(createStrand(p));
    }
  };

  p.seedStars = (count = p.starCountForArc()) => {
    p.stars = [];
    for (let i = 0; i < count; i++) {
      p.stars.push(createStar(p));
    }
  };

  p.mousePressed = () => {
    p.togglePlayback();
    if (!p.hasStarted && p.song?.isPlaying()) {
      p.hasStarted = true;
      if (typeof window.dataLayer !== typeof undefined) {
        window.dataLayer.push({
          event: 'play-animation',
          animation: {
            title: document.title,
            location: window.location.href,
            action: 'start playing',
          },
        });
      }
    }
  };

  p.keyPressed = () => {
    p.saveSketchImage();
  };

  p.windowResized = () => {
    p.canvasWidth = window.innerWidth;
    p.canvasHeight = window.innerHeight;
    p.resizeCanvas(p.canvasWidth, p.canvasHeight);
    p.applyViewportFit();
    p.perspective(p.PI / 2.4, p.width / p.height, 1, 5000);
    // Re-apply arc so early field boost matches the new viewport.
    if (p.bar > 0) p.applySongArc(p.bar);
  };
};

function randomInHalo(p) {
  let x;
  let y;
  let z;
  do {
    x = p.random(-1, 1);
    y = p.random(-1, 1);
    z = p.random(-1, 1);
  } while (x * x + y * y + z * z > 1);
  const scale = p.haloScale ?? 1;
  return {
    x: x * HALO_RX * scale,
    y: y * HALO_RY * scale,
    z: z * HALO_RZ * scale,
  };
}

function randomHaloSpread(p) {
  const scale = p.haloScale ?? 1;
  const energy = p.arc?.energy ?? 0.3;
  // Tighter filaments so sacred-geometry silhouettes stay readable after the burst.
  const tight = p.patternTight ? 0.42 : 1;
  const lo = HALO_RX * p.lerp(0.12, 0.2, energy) * scale * tight;
  const hi = HALO_RX * p.lerp(0.28, 0.52, energy) * scale * tight;
  return p.random(lo, hi);
}

function centroidOf(points) {
  let x = 0;
  let y = 0;
  let z = 0;
  const n = points.length || 1;
  for (let i = 0; i < points.length; i++) {
    x += points[i].x;
    y += points[i].y;
    z += points[i].z;
  }
  return { x: x / n, y: y / n, z: z / n };
}

/** Map pattern-local anchors onto the camera view plane (billboard). */
function syncPatternToCamera(p, basis) {
  if (!p.patternTight) return;

  const { fx, fy, fz, rx, ry, rz, ux, uy, uz } = basis;
  const strands = p.strands;
  for (let i = 0; i < strands.length; i++) {
    const s = strands[i];
    if (s.localX == null) continue;
    const lx = s.localX;
    const ly = s.localY;
    const lz = s.localZ;
    s.tx = rx * lx + ux * ly + fx * lz;
    s.ty = ry * lx + uy * ly + fy * lz;
    s.tz = rz * lx + uz * ly + fz * lz;
  }
}

function createStrand(p) {
  const { x: ox, y: oy, z: oz } = randomInHalo(p);
  const family = p.hueFamily ?? 205;
  const hue = (family + p.random(-30, 30) + 360) % 360;
  const spread = randomHaloSpread(p);
  const energy = p.arc?.energy ?? 0.25;
  return {
    ox,
    oy,
    oz,
    tx: ox,
    ty: oy,
    tz: oz,
    fromX: ox,
    fromY: oy,
    fromZ: oz,
    expandStart: 0,
    expandDur: 0,
    nx: p.random(100),
    ny: p.random(100),
    nz: p.random(100),
    hue,
    thue: hue,
    fromHue: hue,
    spread,
    tspread: spread,
    fromSpread: spread,
    points: POINTS_PER_STRAND,
    pts: new Float32Array(POINTS_PER_STRAND * 3),
    drift: p.random(0.012, 0.022) * p.lerp(1.05, 1.75, energy),
    phase: p.random(p.TWO_PI),
    localX: ox,
    localY: oy,
    localZ: oz,
  };
}

function beginStrandExpand(p, strand, anchor, center, pitch = 60, durationSec = 0.5) {
  const energy = p.arc?.energy ?? 0.3;
  const family = p.hueFamily ?? 205;
  const pitchNudge = p.map(pitch % 24, 0, 24, -18, 18);
  const hueSpread = p.lerp(18, 50, energy);
  let hue = (family + pitchNudge + p.random(-hueSpread, hueSpread) + 360) % 360;
  // Introduce a complementary color burst at high energy (e.g. orange/gold against blue)
  if (energy > 0.6 && p.random() < (energy - 0.6) * 1.5) {
      hue = (hue + 180 + p.random(-20, 20)) % 360;
  }
  const spread = randomHaloSpread(p);

  strand.fromX = center.x;
  strand.fromY = center.y;
  strand.fromZ = center.z;
  strand.ox = center.x;
  strand.oy = center.y;
  strand.oz = center.z;
  strand.tx = anchor.x;
  strand.ty = anchor.y;
  strand.tz = anchor.z;
  strand.expandStart = p.getSongPlaybackTime?.() ?? p.millis() / 1000;
  strand.expandDur = durationSec;
  strand.nx = p.random(100);
  strand.ny = p.random(100);
  strand.nz = p.random(100);
  strand.fromHue = strand.hue;
  strand.thue = hue;
  strand.fromSpread = spread * p.lerp(0.18, 0.06, energy);
  strand.spread = strand.fromSpread;
  strand.tspread = spread;
  const driftMul = p.patternTight
    ? p.lerp(0.55, 0.95, energy)
    : p.lerp(1.05, 1.9, energy);
  strand.drift = p.random(0.012, 0.024) * driftMul;
  strand.phase = p.random(p.TWO_PI);
}

function easeStrand(p, strand, now) {
  const ease = p.motionEase ?? STRAND_EASE;
  const pow = p.expandPow ?? 1;
  if (strand.expandDur > 0) {
    const t = now ?? (p.getSongPlaybackTime?.() ?? p.millis() / 1000);
    const u = Math.min(1, Math.max(0, (t - strand.expandStart) / strand.expandDur));
    const shaped = Math.pow(u, pow);
    const e = shaped * shaped * (3 - 2 * shaped);
    strand.ox = p.lerp(strand.fromX, strand.tx, e);
    strand.oy = p.lerp(strand.fromY, strand.ty, e);
    strand.oz = p.lerp(strand.fromZ, strand.tz, e);
    strand.spread = p.lerp(strand.fromSpread, strand.tspread, e);
    strand.hue = lerpHue(strand.fromHue, strand.thue, e);
    if (u >= 1) strand.expandDur = 0;
    return;
  }

  strand.ox = p.lerp(strand.ox, strand.tx, ease);
  strand.oy = p.lerp(strand.oy, strand.ty, ease);
  strand.oz = p.lerp(strand.oz, strand.tz, ease);
  strand.spread = p.lerp(strand.spread, strand.tspread, ease);
  strand.hue = lerpHue(strand.hue, strand.thue, ease);
}

function lerpHue(from, to, amt) {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * amt + 360) % 360;
}

function createStar(p) {
  // Camera-local skybox coords — locked to view so orbit doesn't slide them all left.
  const energy = p.arc?.energy ?? 0.3;
  const theta = p.random(p.TWO_PI);
  // Edge-weighted hemisphere: more mass in the periphery / corners than dead-center.
  const edge = Math.pow(p.random(), 0.45);
  const cosPhi = p.lerp(0.92, -0.12, edge);
  const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
  const r = p.random(STAR_SHELL_MIN, STAR_SHELL_MAX);

  let dx = p.random(-1, 1);
  let dy = p.random(-1, 1);
  let dz = p.random(-1, 1);
  const dl = Math.hypot(dx, dy, dz) || 1;
  const speed = p.random(55, 120) * p.lerp(0.65, 1.25, energy);
  dx = (dx / dl) * speed;
  dy = (dy / dl) * speed;
  dz = (dz / dl) * speed;
  const noiseRate = p.random(0.22, 0.55) * p.lerp(0.7, 1.3, energy);
  const family = p.hueFamily ?? 220;
  return {
    lx: r * sinPhi * Math.cos(theta),
    ly: r * sinPhi * Math.sin(theta),
    lz: r * cosPhi,
    birth: p.t || 0,
    dx,
    dy,
    dz,
    amp: p.random(16, 36) * p.lerp(0.9, 1.25, energy),
    hue: (family + p.random(-40, 40) + 360) % 360,
    alpha: p.random(52, 88) * p.lerp(0.85, 1.35, energy),
    nx: p.random(100),
    ny: p.random(100),
    nz: p.random(100),
    dnx: p.random(-1, 1) > 0 ? noiseRate : -noiseRate,
    dny: p.random(-1, 1) > 0 ? noiseRate * p.random(0.7, 1.4) : -noiseRate * p.random(0.7, 1.4),
    dnz: p.random(-1, 1) > 0 ? noiseRate * p.random(0.7, 1.4) : -noiseRate * p.random(0.7, 1.4),
    phase: p.random(p.TWO_PI),
    phaseDrift: p.random(-0.45, 0.45),
    pts: new Float32Array(STAR_POINTS * 3),
  };
}

function drawStars(p, basis, lookX, lookY, lookZ) {
  const { fx, fy, fz, rx, ry, rz, ux, uy, uz } = basis;
  const stars = p.stars;
  const t = p.t;
  const shimmer = p.starShimmer;
  const vis = p.starRefresh ? Math.max(0, Math.min(1, p.starRefresh.v)) : 1;
  if (vis <= 0) return;
  p.strokeWeight(2.2);
  for (let s = 0; s < stars.length; s++) {
    const star = stars[s];
    const amp = star.amp;
    const amp2 = amp * 2;
    const pts = star.pts;
    const age = t - (star.birth || 0);
    const nx = star.nx + age * star.dnx;
    const ny = star.ny + age * star.dny;
    const nz = star.nz + age * star.dnz;
    const lx = star.lx + age * star.dx;
    const ly = star.ly + age * star.dy;
    const lz = star.lz + age * star.dz;
    const ox = lookX + rx * lx + ux * ly + fx * lz;
    const oy = lookY + ry * lx + uy * ly + fy * lz;
    const oz = lookZ + rz * lx + uz * ly + fz * lz;
    const phase = star.phase + age * star.phaseDrift;

    for (let i = 0; i < STAR_POINTS; i++) {
      const u = i * 0.11 + phase;
      const i3 = i * 3;
      pts[i3] = ox + p.noise(u, nx, nz) * amp2 - amp;
      pts[i3 + 1] = oy + p.noise(u, ny, nz + 10) * amp2 - amp;
      pts[i3 + 2] = oz + p.noise(u, nx + 20, nz + 20) * amp2 - amp;
    }

    const pulse = 0.88 + 0.12 * Math.sin(t * 1.7 + star.phase);
    const alpha = (star.alpha + shimmer * 40) * pulse * vis;
    // Low sat + full brightness so ADD blend reads as luminous threads.
    p.stroke(star.hue, 12, 100, alpha);
    p.beginShape();
    for (let i = 0; i < STAR_POINTS; i++) {
      const i3 = i * 3;
      p.vertex(pts[i3], pts[i3 + 1], pts[i3 + 2]);
    }
    p.endShape();
  }
  p.strokeWeight(2);
}

function drawStrand(p, strand, hx, hy, hz, energy, earlyEnergy) {
  const pts = strand.pts;
  const n = strand.points;
  const ox = strand.ox + hx;
  const oy = strand.oy + hy;
  const oz = strand.oz + hz;
  const nx = strand.nx;
  const ny = strand.ny;
  const nz = strand.nz;
  const spread = strand.spread;
  const spread2 = spread * 2;

  for (let i = 0; i < n; i++) {
    const u = i * 0.012;
    const i3 = i * 3;
    pts[i3] = ox + p.noise(u, nx, nz) * spread2 - spread;
    pts[i3 + 1] = oy + p.noise(u, ny, nz + 20) * spread2 - spread;
    pts[i3 + 2] = oz + p.noise(u, nx + 40, nz + 40) * spread2 - spread;
  }

  const hue = strand.hue;
  const e = earlyEnergy ?? 0.4;
  const en = energy ?? 0.3;

  // Soft glow — subsampled vertices (halo doesn't need full resolution).
  const glowW = p.lerp(4, 15, e);
  p.strokeWeight(glowW);
  p.stroke(hue, 45, 100, p.lerp(12, 28, e));
  p.beginShape();
  for (let i = 0; i < n; i += GLOW_POINT_STEP) {
    const i3 = i * 3;
    p.vertex(pts[i3], pts[i3 + 1], pts[i3 + 2]);
  }
  // Always include the last point so the tip doesn't clip.
  if ((n - 1) % GLOW_POINT_STEP !== 0) {
    const i3 = (n - 1) * 3;
    p.vertex(pts[i3], pts[i3 + 1], pts[i3 + 2]);
  }
  p.endShape();

  // Core line at full resolution.
  p.strokeWeight(p.lerp(1.4, 3.0, e));
  p.stroke(hue, p.lerp(25, 10, en), 100, p.lerp(70, 95, e));
  p.beginShape();
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    p.vertex(pts[i3], pts[i3 + 1], pts[i3 + 2]);
  }
  p.endShape();

  p.strokeWeight(2);
}

new p5(sketch);
