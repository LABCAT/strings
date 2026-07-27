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
const POINTS_PER_STRAND = 64;
/** Base ellipsoid size of the string field around the halo center. */
const HALO_RX = 220;
const HALO_RY = 140;
const HALO_RZ = 160;
const HALO_FOLLOW = 0.1;
/** Touch Orchestra timpani keyzone: midi <= 53. */
const TIMPANI_MIDI_MAX = 53;
const STRAND_EASE = 0.045;
const EXPAND_MIN_SEC = 0.2;
const STAR_POINTS = 10;
const STAR_SHELL_MIN = 580;
const STAR_SHELL_MAX = 1200;
/** Track1 fires once per bar: phrase1 = 16, phrase2 = 19 (last 4 held). */
const PHRASE1_BARS = 16;
const TOTAL_BARS = 35;
const HOLD_BARS = 4;
/** Pattern fill relative to halo ellipsoid — keep under 1 so shapes stay readable. */
const PATTERN_SCALE = 0.92;

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
  const isHold = b > TOTAL_BARS - HOLD_BARS;
  const dramaBars = TOTAL_BARS - HOLD_BARS;
  let progress = smooth01((b - 1) / Math.max(1, dramaBars - 1));
  if (isHold) {
    const holdI = (b - (dramaBars + 1)) / Math.max(1, HOLD_BARS - 1);
    progress = 1 - smooth01(holdI) * 0.55;
  }
  let energy = progress;
  if (phrase === 2 && !isHold) energy = Math.min(1, progress * 0.82 + 0.28);
  if (isHold) energy *= 0.55;
  return { bar: b, phrase, isHold, progress, energy };
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

function generateUniverseGradient(rng = Math.random, {
  bright = false,
  hueBase = 210,
  aurora = 0,
  hueSeed = 0,
} = {}) {
  // Radial-first background. "Aurora" here only means late-piece richness:
  // brighter core, wider falloff, and optional soft secondary radials — no linear bands.
  const base = (hueBase + hueSeed + 360) % 360;
  const a = Math.max(0, Math.min(1, aurora));
  const boost = bright ? 18 : 0;
  const satBoost = bright ? 10 : 0;

  const hue = (base + rng() * 40 - 12 + 360) % 360;
  const [r1, g1, b1] = hsbToRgb(hue, 55 + rng() * 25 + satBoost, Math.min(100, 58 + rng() * 28 + boost + a * 12));
  const [r2, g2, b2] = hsbToRgb((hue + 25 + rng() * 35) % 360, 50 + rng() * 25 + satBoost * 0.5, Math.min(100, 28 + rng() * 22 + boost * 0.5 + a * 8));
  const [r3, g3, b3] = hsbToRgb((hue + 170 + rng() * 40) % 360, 35 + rng() * 25, 4 + rng() * 10);

  const midStop = Math.round(38 + a * 12);
  const layers = [
    `radial-gradient(ellipse at var(--halo-cx, 50%) var(--halo-cy, 52%), rgb(${r1}, ${g1}, ${b1}) 0%, rgb(${r2}, ${g2}, ${b2}) ${midStop}%, rgb(${r3}, ${g3}, ${b3}) 100%)`,
  ];

  // Soft companion glow(s) — still radial, just off-center. Grows with the arc.
  const companions = a > 0.2 ? 1 + Math.floor(a * 2) : 0;
  for (let i = 0; i < companions; i++) {
    const ch = (hue + 50 + i * 70 + rng() * 40) % 360;
    const [cr, cg, cb] = hsbToRgb(ch, 60 + rng() * 25, Math.min(100, 55 + rng() * 30 + boost * 0.4));
    const alpha = (0.12 + rng() * 0.14) * a;
    const ox = 18 + rng() * 64;
    const oy = 16 + rng() * 68;
    const rx = 28 + rng() * 40;
    const ry = 18 + rng() * 28;
    layers.unshift(
      `radial-gradient(ellipse ${rx.toFixed(0)}% ${ry.toFixed(0)}% at ${ox.toFixed(0)}% ${oy.toFixed(0)}%, rgba(${cr}, ${cg}, ${cb}, ${alpha.toFixed(3)}) 0%, rgba(${cr}, ${cg}, ${cb}, 0) 70%)`
    );
  }

  return layers.join(', ');
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

function ensureTimpaniFlash() {
  const css = `
      #timpani-flash {
        position: fixed;
        inset: 0;
        z-index: 2;
        pointer-events: none;
        opacity: 0;
        background:
          radial-gradient(circle at 50% 45%, rgba(255,255,255,var(--timpani-peak, 0.45)) 0%, rgba(255,255,255,var(--timpani-mid, 0.1)) 32%, transparent 65%),
          radial-gradient(circle at 50% 50%, rgba(255,255,255,var(--timpani-soft, 0.16)) 0%, transparent 72%);
      }
      #timpani-flash.is-on {
        animation: timpaniFlash var(--timpani-dur, 1.4s) ease-out;
      }
      @keyframes timpaniFlash {
        0% { opacity: var(--timpani-opacity, 0.85); }
        25% { opacity: calc(var(--timpani-opacity, 0.85) * 0.55); }
        100% { opacity: 0; }
      }
    `;

  let style = document.getElementById("timpani-flash-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "timpani-flash-style";
    document.head.appendChild(style);
  }
  style.textContent = css;

  let flash = document.getElementById("timpani-flash");
  if (!flash) {
    flash = document.createElement("div");
    flash.id = "timpani-flash";
    document.body.prepend(flash);
  }

  // Remove leftover CSS filament sky if present.
  document.getElementById("css-string-sky")?.remove();
  document.getElementById("css-string-sky-style")?.remove();

  return flash;
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
  p.veilOpacity = 0.62;
  p.baseVeilOpacity = 0.62;
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

  p.setup = async () => {
    p.pixelDensity(1);
    p.frameRate(60);
    p.createCanvas(p.canvasWidth, p.canvasHeight, p.WEBGL);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noFill();
    p.strokeWeight(2);
    p.cameraRadius = Math.max(p.width, p.height) * 0.35;
    p.perspective(p.PI / 2.4, p.width / p.height, 1, 5000);
    ensureTimpaniFlash();
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
    const { energy, isHold, progress } = arc;

    // Cool → violet → warm across the piece, offset by a per-session seed.
    p.hueFamily = (205 + progress * 155 + (p.hueSeed || 0) + 360) % 360;
    // Aurora emerges mid–phrase 1 and swells toward the peak.
    p.auroraAmount = smooth01((progress - 0.12) / 0.75) * (isHold ? 0.85 : 1);

    if (isHold) {
      p.haloScaleTarget = 1.05;
      p.orbitRate = 0.0009;
      p.motionEase = 0.018;
      p.expandPow = 1.35;
      p.veilOpacity = p.baseVeilOpacity + 0.08;
    } else {
      p.haloScaleTarget = p.lerp(0.58, 1.15, energy);
      p.orbitRate = p.lerp(0.0012, 0.005, Math.pow(energy, 1.5));
      p.motionEase = p.lerp(0.02, 0.12, energy);
      p.expandPow = p.lerp(1.3, 0.4, energy);
      p.veilOpacity = p.baseVeilOpacity - energy * 0.22;
    }

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
    const { energy, isHold } = p.arc || getSongArc(1);
    if (isHold) return Math.floor(p.lerp(50, 70, energy));
    return Math.floor(p.lerp(45, 130, energy));
  };

  p.applyUniverseGradient = ({ bright = false, moveHalo = true } = {}) => {
    if (moveHalo) {
      p.haloCssTarget = pickHaloTarget(p);
    }
    const veil = `linear-gradient(rgba(0,0,0,${p.veilOpacity}), rgba(0,0,0,${p.veilOpacity}))`;
    const bg = `${veil}, ${generateUniverseGradient(Math.random, {
      bright,
      hueBase: p.hueFamily,
      aurora: p.auroraAmount || 0,
      hueSeed: p.hueSeed || 0,
    })}`;
    const root = document.documentElement.style;
    root.setProperty('--gradient-bg', bg);
    root.setProperty('--halo-cx', `${p.haloCss.cx}%`);
    root.setProperty('--halo-cy', `${p.haloCss.cy}%`);
    root.setProperty('--gradient-blend-mode', 'normal');
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

  p.triggerTimpaniFlash = (intensity = 0.55) => {
    const flash = ensureTimpaniFlash();
    const peak = 0.28 + intensity * 0.55;
    const root = document.documentElement.style;
    root.setProperty("--timpani-peak", `${peak}`);
    root.setProperty("--timpani-mid", `${0.06 + intensity * 0.16}`);
    root.setProperty("--timpani-soft", `${0.08 + intensity * 0.14}`);
    root.setProperty("--timpani-opacity", `${0.45 + intensity * 0.5}`);
    root.setProperty("--timpani-dur", `${p.lerp(1.8, 1.05, intensity)}s`);
    flash.classList.remove("is-on");
    void flash.offsetWidth;
    flash.classList.add("is-on");
    p.veilOpacity = Math.max(0.28, p.veilOpacity - intensity * 0.18);
    p.queueUniverseGradient({ bright: true, moveHalo: true });
  };

  p.executeTimpani = (note) => {
    // Intensity follows the latest Track1 bar arc (timpani cues have their own index).
    const arc = p.arc || p.applySongArc(p.bar || 1);
    const intensity = arc.isHold ? 0.35 : 0.4 + arc.energy * 0.6;
    p.triggerTimpaniFlash(intensity);
    p.starShimmer = 0.55 + intensity * 0.55;
    p.seedStars(p.starCountForArc());
    p.starRefresh = { v: 0 };

    // Late-piece timpani: brief outward kick on the string field.
    if (!arc.isHold && arc.energy > 0.45) {
      const kick = 1 + intensity * 0.45;
      for (let i = 0; i < p.strands.length; i++) {
        const s = p.strands[i];
        if (s.localX != null) {
          s.localX *= kick;
          s.localY *= kick;
          s.localZ *= kick;
        } else {
          s.tx *= kick;
          s.ty *= kick;
          s.tz *= kick;
        }
        s.tspread = Math.min(s.tspread * (1 + intensity * 0.2), HALO_RX * 0.7 * p.haloScale);
      }
    }
  };

  p.draw = () => {
    if (!(p.song && p.song.isPlaying())) return;

    p.clear();
    p.blendMode(p.ADD);
    p.noFill();
    p.strokeWeight(2);

    p.haloCss.cx = p.lerp(p.haloCss.cx, p.haloCssTarget.cx, HALO_FOLLOW);
    p.haloCss.cy = p.lerp(p.haloCss.cy, p.haloCssTarget.cy, HALO_FOLLOW);
    p.haloScale = p.lerp(p.haloScale, p.haloScaleTarget, 0.06);
    document.documentElement.style.setProperty('--halo-cx', `${p.haloCss.cx}%`);
    document.documentElement.style.setProperty('--halo-cy', `${p.haloCss.cy}%`);

    p.cameraAngle += p.orbitRate;
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

    p.starShimmer = Math.max(0, p.starShimmer - 0.012);
    if (p.starRefresh) {
      p.starRefresh.v += 0.045;
      if (p.starRefresh.v >= 1) p.starRefresh = null;
    }
    drawStars(p, eyeX, eyeY, eyeZ, lookX, lookY, lookZ);

    // Keep sacred-geometry destinations face-on as the camera orbits.
    syncPatternToCamera(p, eyeX, eyeY, eyeZ, lookX, lookY, lookZ);

    const strands = p.strands;
    const hx = p.halo.x;
    const hy = p.halo.y;
    const hz = p.halo.z;
    for (let s = 0; s < strands.length; s++) {
      const strand = strands[s];
      easeStrand(p, strand);
      drawStrand(p, strand, hx, hy, hz);
      strand.nz += strand.drift;
    }

    p.t += 0.01;
  };

  p.executeTrack1 = (note) => {
    const { currentCue, midi: pitch } = note;
    const arc = p.applySongArc(currentCue);
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
    syncPatternToCamera(p, eyeX, eyeY, eyeZ, lookX, lookY, lookZ);

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

    // Phrase-2 seam: wipe stars into a denser field.
    if (currentCue === PHRASE1_BARS + 1) {
      p.seedStars(p.starCountForArc());
      p.starRefresh = { v: 0 };
      p.queueUniverseGradient({ bright: true, moveHalo: true });
    } else if (arc.isHold && currentCue === TOTAL_BARS - HOLD_BARS + 1) {
      // Enter release: quieter starfield, locked drift.
      p.seedStars(p.starCountForArc());
      p.starRefresh = { v: 0 };
      p.queueUniverseGradient({ bright: false, moveHalo: false });
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
    if (typeof window.dataLayer !== typeof undefined && !p.hasStarted) {
      window.dataLayer.push({
        event: 'play-animation',
        animation: {
          title: document.title,
          location: window.location.href,
          action: 'start playing',
        },
      });
      p.hasStarted = true;
    }
  };

  p.keyPressed = () => {
    p.saveSketchImage();
  };

  p.windowResized = () => {
    p.canvasWidth = window.innerWidth;
    p.canvasHeight = window.innerHeight;
    p.resizeCanvas(p.canvasWidth, p.canvasHeight);
    p.cameraRadius = Math.max(p.width, p.height) * 0.35;
    p.perspective(p.PI / 2.4, p.width / p.height, 1, 5000);
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
function syncPatternToCamera(p, eyeX, eyeY, eyeZ, lookX, lookY, lookZ) {
  if (!p.patternTight) return;

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
  const isHold = !!p.arc?.isHold;
  const family = p.hueFamily ?? 205;
  const pitchNudge = p.map(pitch % 24, 0, 24, -18, 18);
  const hueSpread = p.lerp(18, 50, energy);
  let hue = (family + pitchNudge + p.random(-hueSpread, hueSpread) + 360) % 360;
  // Introduce a complementary color burst at high energy (e.g. orange/gold against blue)
  if (!isHold && energy > 0.6 && p.random() < (energy - 0.6) * 1.5) {
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
  strand.expandDur = isHold ? Math.max(durationSec * 1.35, 0.8) : durationSec;
  strand.nx = p.random(100);
  strand.ny = p.random(100);
  strand.nz = p.random(100);
  strand.fromHue = strand.hue;
  strand.thue = hue;
  strand.fromSpread = spread * p.lerp(0.18, 0.06, energy);
  strand.spread = strand.fromSpread;
  strand.tspread = spread;
  const driftMul = p.patternTight
    ? isHold
      ? 0.35
      : p.lerp(0.55, 0.95, energy)
    : isHold
      ? 0.55
      : p.lerp(1.05, 1.9, energy);
  strand.drift = p.random(0.012, 0.024) * driftMul;
  strand.phase = p.random(p.TWO_PI);
}

function easeStrand(p, strand) {
  const ease = p.motionEase ?? STRAND_EASE;
  const pow = p.expandPow ?? 1;
  if (strand.expandDur > 0) {
    const now = p.getSongPlaybackTime?.() ?? p.millis() / 1000;
    const u = Math.min(1, Math.max(0, (now - strand.expandStart) / strand.expandDur));
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
  const isHold = !!p.arc?.isHold;
  const u = p.random();
  const v = p.random();
  const theta = u * p.TWO_PI;
  // Bias into the far hemisphere (beyond the look point) so they read as background.
  const phi = Math.acos(p.random(0.15, 1));
  const r = p.random(STAR_SHELL_MIN, STAR_SHELL_MAX);
  const sinPhi = Math.sin(phi);
  let dx = p.random(-1, 1);
  let dy = p.random(-1, 1);
  let dz = p.random(-1, 1);
  const dl = Math.hypot(dx, dy, dz) || 1;
  const speed = p.random(55, 120) * (isHold ? 0.15 : p.lerp(0.65, 1.25, energy));
  dx = (dx / dl) * speed;
  dy = (dy / dl) * speed;
  dz = (dz / dl) * speed;
  const noiseRate = p.random(0.22, 0.55) * (isHold ? 0.2 : p.lerp(0.7, 1.3, energy));
  const family = p.hueFamily ?? 220;
  return {
    lx: r * sinPhi * Math.cos(theta),
    ly: r * sinPhi * Math.sin(theta) * 0.7,
    lz: r * Math.cos(phi),
    dx,
    dy,
    dz,
    amp: p.random(12, 30) * p.lerp(0.85, 1.2, energy),
    hue: (family + p.random(-40, 40) + 360) % 360,
    alpha: p.random(22, 48) * p.lerp(0.75, 1.35, energy),
    nx: p.random(100),
    ny: p.random(100),
    nz: p.random(100),
    dnx: p.random(-1, 1) > 0 ? noiseRate : -noiseRate,
    dny: p.random(-1, 1) > 0 ? noiseRate * p.random(0.7, 1.4) : -noiseRate * p.random(0.7, 1.4),
    dnz: p.random(-1, 1) > 0 ? noiseRate * p.random(0.7, 1.4) : -noiseRate * p.random(0.7, 1.4),
    phase: p.random(p.TWO_PI),
    phaseDrift: p.random(-0.45, 0.45) * (isHold ? 0.1 : 1),
    pts: new Float32Array(STAR_POINTS * 3),
  };
}

function drawStars(p, eyeX, eyeY, eyeZ, lookX, lookY, lookZ) {
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

  const stars = p.stars;
  const t = p.t;
  const shimmer = p.starShimmer;
  const vis = p.starRefresh ? Math.max(0, Math.min(1, p.starRefresh.v)) : 1;
  if (vis <= 0) return;
  p.strokeWeight(1.5);
  for (let s = 0; s < stars.length; s++) {
    const star = stars[s];
    const amp = star.amp;
    const amp2 = amp * 2;
    const pts = star.pts;
    const nx = star.nx + t * star.dnx;
    const ny = star.ny + t * star.dny;
    const nz = star.nz + t * star.dnz;
    const lx = star.lx + t * star.dx;
    const ly = star.ly + t * star.dy;
    const lz = star.lz + t * star.dz;
    const ox = lookX + rx * lx + ux * ly + fx * lz;
    const oy = lookY + ry * lx + uy * ly + fy * lz;
    const oz = lookZ + rz * lx + uz * ly + fz * lz;
    const phase = star.phase + t * star.phaseDrift;

    for (let i = 0; i < STAR_POINTS; i++) {
      const u = i * 0.11 + phase;
      const i3 = i * 3;
      pts[i3] = ox + p.noise(u, nx, nz) * amp2 - amp;
      pts[i3 + 1] = oy + p.noise(u, ny, nz + 10) * amp2 - amp;
      pts[i3 + 2] = oz + p.noise(u, nx + 20, nz + 20) * amp2 - amp;
    }

    const pulse = 0.85 + 0.15 * Math.sin(t * 1.7 + star.phase);
    const alpha = (star.alpha + shimmer * 28) * pulse * vis;
    p.stroke(star.hue, 22, 100, alpha);
    p.beginShape();
    for (let i = 0; i < STAR_POINTS; i++) {
      const i3 = i * 3;
      p.vertex(pts[i3], pts[i3 + 1], pts[i3 + 2]);
    }
    p.endShape();
  }
  p.strokeWeight(2);
}

function drawStrand(p, strand, hx, hy, hz) {
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
  const energy = p.arc?.energy ?? 0.3;

  // Ramps up quickly so the colors start popping sooner
  const earlyEnergy = Math.pow(energy, 0.5);

  // Base additive glow (halo)
  const glowW = p.lerp(4, 15, earlyEnergy);
  p.strokeWeight(glowW);
  p.stroke(hue, 45, 100, p.lerp(12, 28, earlyEnergy));
  p.beginShape();
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    p.vertex(pts[i3], pts[i3 + 1], pts[i3 + 2]);
  }
  p.endShape();

  // Core line - gets brighter and slightly thicker earlier
  p.strokeWeight(p.lerp(1.4, 3.0, earlyEnergy));
  p.stroke(hue, p.lerp(25, 10, energy), 100, p.lerp(70, 95, earlyEnergy));
  p.beginShape();
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    p.vertex(pts[i3], pts[i3 + 1], pts[i3 + 2]);
  }
  p.endShape();

  p.strokeWeight(2);
}

new p5(sketch);
