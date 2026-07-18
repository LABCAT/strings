import p5 from "p5";
import "@lib/p5.audioReact.js";


const base = import.meta.env.BASE_URL || './';
const audio = base + 'audio/StringsNo1.mp3';
const midi = base + 'audio/StringsNo1.mid';

const sketch = (p) => {
  p.canvasWidth = window.innerWidth;
  p.canvasHeight = window.innerHeight;
  p.song = null;
  p.audioLoaded = false;
  p.creditsLogged = false;
  p.PPQ = 3840 * 4;
  p.bpm = 106;

  p.numOfStringLoops = 300;
  p.nx = p.random(100);
  p.ny = p.random(100);
  p.nz = 0;
  p.h = p.random(360);
  p.ox = p.random(p.canvasWidth);
  p.oy = p.random(p.canvasHeight);

  p.setup = async () => {
    p.createCanvas(p.canvasWidth, p.canvasHeight);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.background(0, 0, 0, 100);
    p.strokeWeight(1);
    p.noFill();
    p.blendMode(p.SCREEN);

    await p.loadSong(audio, midi, (midiData) => {
      if (midiData) {
        const noteSet = midiData.tracks[5].notes; // Combinator 5 - Touch Orchestra
        p.scheduleCueSet(noteSet, 'executeTrack1');
      }
    });
  };

  p.draw = () => {
    
    if (p.song && p.song.isPlaying()) {
      p.playStrings();
    }
  };

  p.executeTrack1 = (note) => {
    const currentCue = note.currentCue;
    console.log(currentCue);
    if (currentCue === 79 || currentCue === 96) {
      p.clear();
      p.blendMode(p.BLEND);
      p.background(0);
      p.blendMode(p.SCREEN);
    }
    p.numOfStringLoops = p.numOfStringLoops + 10;
    p.nz = 0;
    p.nx = p.random(100);
    p.ny = p.random(100);
    p.ox = p.random(p.width);
    p.oy = p.random(p.height);
    p.h = p.random(360);
    p.h++;
  };

  p.playStrings = () => {
    p.stroke(p.h % 360, 100, 100, 50);

    p.beginShape();
    const numOfLoops = p.numOfStringLoops;
    
    for (let i = 0; i < numOfLoops; i++) {
      let x = p.map(p.noise(i * 0.01, p.nx, p.nz), 0, 1, p.ox - numOfLoops, p.ox + numOfLoops);
      let y = p.map(p.noise(i * 0.01, p.ny, p.nz), 0, 1, p.oy - numOfLoops, p.oy + numOfLoops);
      p.splineVertex(x, y);
    }

    p.endShape();

    p.nz += 0.005;
  };

  p.resetAnimation = () => {
    p.numOfStringLoops = 300;
    p.nx = p.random(100);
    p.ny = p.random(100);
    p.nz = 0;
    p.h = p.random(360);
    p.ox = p.random(p.width);
    p.oy = p.random(p.height);
    p.clear();
    p.blendMode(p.BLEND);
    p.background(0);
    p.blendMode(p.SCREEN);
  };

  p.mousePressed = () => {
    p.togglePlayback();
  };

  p.keyPressed = () => {
    p.saveSketchImage();
  };

  p.windowResized = () => {
    p.canvasWidth = window.innerWidth;
    p.canvasHeight = window.innerHeight;
    p.resizeCanvas(p.canvasWidth, p.canvasHeight);
    p.ox = p.random(p.width);
    p.oy = p.random(p.height);
    p.blendMode(p.BLEND);
    p.background(0, 0, 0, 100);
    p.blendMode(p.SCREEN);
  };
};

new p5(sketch);
