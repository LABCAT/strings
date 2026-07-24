import p5 from "p5";
import "@lib/p5.audioReact.js";

const base = import.meta.env.BASE_URL || "./";
const audio = base + "audio/StringsNo3.mp3";
const midi = base + "audio/StringsNo3.mid";

const STRAND_COUNT = 28;
const STRAND_MAX = 28;
const POINTS_PER_STRAND = 64;
/** Ellipsoid size of the string field around the halo center. */
const HALO_RX = 220;
const HALO_RY = 140;
const HALO_RZ = 160;
const HALO_FOLLOW = 0.1;
/** Combinator keyzone guess: lowest Touch Orchestra pitches (48/52). Confirm by ear. */
const TIMPANI_MIDI_MAX = 52;
const STRAND_EASE = 0.045;
const EXPAND_MIN_SEC = 0.2;
const STAR_COUNT = 90;
const STAR_POINTS = 10;
const STAR_SHELL_MIN = 580;
const STAR_SHELL_MAX = 1200;
/** Bright tip / leading glow on main strings. Flip to compare. */
const GLOWING_HEAD = false;

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

function generateUniverseGradient(rng = Math.random, { bright = false } = {}) {
  const hue = rng() * 360;
  const boost = bright ? 18 : 0;
  const [r1, g1, b1] = hsbToRgb(hue, 70 + rng() * 25, Math.min(100, 70 + rng() * 30 + boost));
  const [r2, g2, b2] = hsbToRgb((hue + 30 + rng() * 40) % 360, 65 + rng() * 25, Math.min(100, 35 + rng() * 25 + boost * 0.5));
  const [r3, g3, b3] = hsbToRgb((hue + 180 + rng() * 40) % 360, 50 + rng() * 30, 6 + rng() * 12);
  return `radial-gradient(ellipse at var(--halo-cx, 50%) var(--halo-cy, 52%), rgb(${r1}, ${g1}, ${b1}) 0%, rgb(${r2}, ${g2}, ${b2}) 42%, rgb(${r3}, ${g3}, ${b3}) 100%)`;
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
  let ux = ry * fz - rz * fy;
  let uy = rz * fx - rx * fz;
  let uz = rx * fy - ry * fx;

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
  let style = document.getElementById("timpani-flash-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "timpani-flash-style";
    style.textContent = `
      #timpani-flash {
        position: fixed;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        opacity: 0;
        background:
          radial-gradient(circle at 50% 45%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.1) 32%, transparent 65%),
          radial-gradient(circle at 50% 50%, rgba(255,255,255,0.16) 0%, transparent 72%);
      }
      #timpani-flash.is-on {
        animation: timpaniFlash 1.4s ease-out;
      }
      @keyframes timpaniFlash {
        0% { opacity: 0.85; }
        25% { opacity: 0.5; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

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
  p.t = 0;
  p.cameraAngle = 0;
  p.cameraRadius = 900;
  p.veilOpacity = 0.62;
  p.baseVeilOpacity = 0.62;
  p.halo = { x: 0, y: 0, z: 0 };
  p.haloCss = { cx: 50, cy: 52 };
  p.haloCssTarget = { cx: 50, cy: 52 };

  p.setup = async () => {
    p.pixelDensity(1);
    p.frameRate(60);
    p.createCanvas(p.canvasWidth, p.canvasHeight, p.WEBGL);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noFill();
    p.strokeWeight(2);
    p.cameraRadius = Math.max(p.width, p.height) * 0.12;
    p.perspective(p.PI / 2.4, p.width / p.height, 1, 5000);
    ensureTimpaniFlash();
    p.applyUniverseGradient();
    document.documentElement.style.setProperty("--play-icon-color", "#ffffffcc");
    p.clear();
    p.seedStrands(STRAND_COUNT);
    p.seedStars(STAR_COUNT);

    await p.loadSong(audio, midi, (midiData) => {
      if (!midiData) return;

      console.log("StringsNo3 MIDI:", midiData);
      console.table(
        midiData.tracks.map((track, index) => ({
          index,
          name: track.name || "",
          notes: track.notes?.length ?? 0,
        }))
      );

      // Track names are source of truth — GM instrument metadata is wrong for Combinator.
      const touchOrchestra = midiData.tracks[6].notes;
      p.scheduleCueSet(touchOrchestra, "executeTrack1");

      const timpaniNotes = touchOrchestra.filter((n) => n.midi <= TIMPANI_MIDI_MAX);
      console.log(
        `Timpani candidates (midi <= ${TIMPANI_MIDI_MAX}):`,
        timpaniNotes.length,
        timpaniNotes.map((n) => ({ t: +n.time.toFixed(2), midi: n.midi, vel: +n.velocity.toFixed(2) }))
      );
      p.scheduleCueSet(timpaniNotes, "executeTimpani");
    });
  };

  p.applyUniverseGradient = ({ bright = false, moveHalo = true } = {}) => {
    if (moveHalo) {
      p.haloCssTarget = pickHaloTarget(p);
    }
    const veil = `linear-gradient(rgba(0,0,0,${p.veilOpacity}), rgba(0,0,0,${p.veilOpacity}))`;
    const bg = `${veil}, ${generateUniverseGradient(Math.random, { bright })}`;
    document.documentElement.style.setProperty("--gradient-bg", bg);
    document.documentElement.style.setProperty("--halo-cx", `${p.haloCss.cx}%`);
    document.documentElement.style.setProperty("--halo-cy", `${p.haloCss.cy}%`);
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

  p.triggerTimpaniFlash = () => {
    const flash = ensureTimpaniFlash();
    flash.classList.remove("is-on");
    requestAnimationFrame(() => {
      flash.classList.add("is-on");
    });
    p.queueUniverseGradient({ bright: true, moveHalo: true });
  };

  p.draw = () => {
    if (!(p.song && p.song.isPlaying())) return;

    p.clear();
    p.blendMode(p.ADD);
    p.noFill();
    p.strokeWeight(2);

    p.haloCss.cx = p.lerp(p.haloCss.cx, p.haloCssTarget.cx, HALO_FOLLOW);
    p.haloCss.cy = p.lerp(p.haloCss.cy, p.haloCssTarget.cy, HALO_FOLLOW);
    document.documentElement.style.setProperty("--halo-cx", `${p.haloCss.cx}%`);
    document.documentElement.style.setProperty("--halo-cy", `${p.haloCss.cy}%`);

    p.cameraAngle += 0.0022;
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
    drawStars(p, eyeX, eyeY, eyeZ, lookX, lookY, lookZ);

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
    const durationSec = Math.max(EXPAND_MIN_SEC, note.duration || 0.5);

    const batch = [];
    for (let i = 0; i < p.strands.length; i++) {
      batch.push({
        strand: p.strands[i],
        pitch: pitch + p.random(-12, 12),
        anchor: randomInHalo(p),
      });
    }

    const center = centroidOf(batch.map((b) => b.anchor));
    for (const item of batch) {
      beginStrandExpand(p, item.strand, item.anchor, center, item.pitch, durationSec);
    }

    if (currentCue % 24 === 0 && p.strands.length < STRAND_MAX) {
      p.strands.push(createStrand(p));
    }

    p.queueUniverseGradient();
  };

  p.executeTimpani = (note) => {
    p.triggerTimpaniFlash();
    p.starShimmer = 1;
  };

  p.resetAnimation = () => {
    p.t = 0;
    p.cameraAngle = 0;
    p.starShimmer = 0;
    p.halo = { x: 0, y: 0, z: 0 };
    p.haloCss = { cx: 50, cy: 52 };
    p.haloCssTarget = { cx: 50, cy: 52 };
    p.applyUniverseGradient({ moveHalo: true });
    p.seedStrands(STRAND_COUNT);
    p.seedStars(STAR_COUNT);
    p.clear();
  };

  p.seedStrands = (count) => {
    p.strands = [];
    for (let i = 0; i < count; i++) {
      p.strands.push(createStrand(p));
    }
  };

  p.seedStars = (count) => {
    p.stars = [];
    for (let i = 0; i < count; i++) {
      p.stars.push(createStar(p));
    }
  };

  p.mousePressed = () => {
    p.togglePlayback();
    if (typeof window.dataLayer !== typeof undefined && !p.hasStarted) {
      window.dataLayer.push({
        event: "play-animation",
        animation: {
          title: document.title,
          location: window.location.href,
          action: "start playing",
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
    p.cameraRadius = Math.max(p.width, p.height) * 0.52;
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
  return {
    x: x * HALO_RX,
    y: y * HALO_RY,
    z: z * HALO_RZ,
  };
}

function randomHaloSpread(p) {
  return p.random(HALO_RX * 0.18, HALO_RX * 0.42);
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

function createStrand(p) {
  const { x: ox, y: oy, z: oz } = randomInHalo(p);
  const hue = p.random(160, 320);
  const spread = randomHaloSpread(p);
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
    drift: p.random(0.01, 0.018),
    phase: p.random(p.TWO_PI),
  };
}

function beginStrandExpand(p, strand, anchor, center, pitch = 60, durationSec = 0.5) {
  const hue = p.map(pitch % 24, 0, 24, 160, 330) + p.random(-25, 25);
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
  strand.fromSpread = spread * 0.12;
  strand.spread = strand.fromSpread;
  strand.tspread = spread;
  strand.drift = p.random(0.01, 0.02);
  strand.phase = p.random(p.TWO_PI);
}

function easeStrand(p, strand) {
  if (strand.expandDur > 0) {
    const now = p.getSongPlaybackTime?.() ?? p.millis() / 1000;
    const u = Math.min(1, Math.max(0, (now - strand.expandStart) / strand.expandDur));
    const e = u * u * (3 - 2 * u);
    strand.ox = p.lerp(strand.fromX, strand.tx, e);
    strand.oy = p.lerp(strand.fromY, strand.ty, e);
    strand.oz = p.lerp(strand.fromZ, strand.tz, e);
    strand.spread = p.lerp(strand.fromSpread, strand.tspread, e);
    strand.hue = lerpHue(strand.fromHue, strand.thue, e);
    if (u >= 1) strand.expandDur = 0;
    return;
  }

  strand.ox = p.lerp(strand.ox, strand.tx, STRAND_EASE);
  strand.oy = p.lerp(strand.oy, strand.ty, STRAND_EASE);
  strand.oz = p.lerp(strand.oz, strand.tz, STRAND_EASE);
  strand.spread = p.lerp(strand.spread, strand.tspread, STRAND_EASE);
  strand.hue = lerpHue(strand.hue, strand.thue, STRAND_EASE);
}

function lerpHue(from, to, amt) {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * amt + 360) % 360;
}

function createStar(p) {
  // Camera-local skybox coords — locked to view so orbit doesn't slide them all left.
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
  const speed = p.random(55, 120);
  dx = (dx / dl) * speed;
  dy = (dy / dl) * speed;
  dz = (dz / dl) * speed;
  const noiseRate = p.random(0.22, 0.55);
  return {
    lx: r * sinPhi * Math.cos(theta),
    ly: r * sinPhi * Math.sin(theta) * 0.7,
    lz: r * Math.cos(phi),
    dx,
    dy,
    dz,
    amp: p.random(12, 30),
    hue: p.random(180, 300),
    alpha: p.random(28, 55),
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

  let ux = ry * fz - rz * fy;
  let uy = rz * fx - rx * fz;
  let uz = rx * fy - ry * fx;

  const stars = p.stars;
  const t = p.t;
  const shimmer = p.starShimmer;
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
    const alpha = (star.alpha + shimmer * 28) * pulse;
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
  if (GLOWING_HEAD) {
    // Soft full string body
    p.strokeWeight(1.4);
    p.stroke(hue, 28, 100, 36);
    p.beginShape();
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      p.vertex(pts[i3], pts[i3 + 1], pts[i3 + 2]);
    }
    p.endShape();

    // Brighter leading half
    const mid = Math.max(10, Math.floor(n * 0.4));
    p.strokeWeight(1.9);
    p.stroke(hue, 18, 100, 68);
    p.beginShape();
    for (let i = 0; i < mid; i++) {
      const i3 = i * 3;
      p.vertex(pts[i3], pts[i3 + 1], pts[i3 + 2]);
    }
    p.endShape();

    // Glowing head
    const tip = Math.max(5, Math.floor(n * 0.12));
    p.strokeWeight(2.6);
    p.stroke(hue, 6, 100, 95);
    p.beginShape();
    for (let i = 0; i < tip; i++) {
      const i3 = i * 3;
      p.vertex(pts[i3], pts[i3 + 1], pts[i3 + 2]);
    }
    p.endShape();
    p.strokeWeight(2);
    return;
  }

  p.strokeWeight(2);
  p.stroke(hue, 30, 100, 70);
  p.beginShape();
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    p.vertex(pts[i3], pts[i3 + 1], pts[i3 + 2]);
  }
  p.endShape();
}

new p5(sketch);
