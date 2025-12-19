import p5 from "p5";
import "p5/lib/addons/p5.sound";
import { Midi } from '@tonejs/midi';

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

  p.loadMidi = () => {
    Midi.fromUrl(midi).then((result) => {
      console.log('MIDI loaded:', result);
      const noteSet = result.tracks[5].notes; // Combinator 5 - Touch Orchestra
      p.scheduleCueSet(noteSet, 'executeTrack1');
      p.audioLoaded = true;
      document.getElementById("loader").classList.add("loading--complete");
      document.getElementById("play-icon").classList.add("fade-in");
    });
  };

  p.preload = () => {
    p.song = p.loadSound(audio, (sound) => {
      p.loadMidi();
    });
    p.song.onended(() => {
      if (p.canvas) {
        p.canvas.classList.add('p5Canvas--cursor-play');
        p.canvas.classList.remove('p5Canvas--cursor-pause');
      }
      if (!p.creditsLogged){
        p.creditsLogged = true;
        console.log('Music By: https://github.com/LABCAT');
        console.log('Animation By: https://github.com/LABCAT');
        console.log('Code Inspiration: https://www.openprocessing.org/sketch/988880');
      }
    });
  };

  p.scheduleCueSet = (noteSet, callbackName, polyMode = false) => {
    let lastTicks = -1,
        currentCue = 1;
    for (let i = 0; i < noteSet.length; i++) {
      const note = noteSet[i],
          { ticks, time } = note;
      if(ticks !== lastTicks || polyMode){
        note.currentCue = currentCue;
        p.song.addCue(time, p[callbackName], note);
        lastTicks = ticks;
        currentCue++;
      }
    }
  };

  p.setup = () => {
    p.createCanvas(p.canvasWidth, p.canvasHeight);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.background(0);
    p.strokeWeight(1);
    p.noFill();
    p.blendMode(p.SCREEN);
  };

  p.draw = () => {
    if (p.song && p.song.isPlaying()) {
      p.playStrings();
    }
  };

  p.executeTrack1 = ({currentCue}) => {
    console.log(currentCue);
    if (currentCue === 79 || currentCue === 96) {
      p.clear();
      p.background(0);
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
      p.curveVertex(x, y);
    }

    p.endShape();

    p.nz += 0.005;
  };

  p.reset = () => {
    p.numOfStringLoops = 300;
    p.nx = p.random(100);
    p.ny = p.random(100);
    p.nz = 0;
    p.h = p.random(360);
    p.ox = p.random(p.width);
    p.oy = p.random(p.height);
    p.clear();
    p.background(0);
    p.song.stop();
    p.song.play();
  };

  p.mousePressed = () => {
    if(p.audioLoaded && p.song){
      if (p.song.isPlaying()) {
        p.song.pause();
        if (p.canvas) {
          p.canvas.classList.add('p5Canvas--cursor-play');
          p.canvas.classList.remove('p5Canvas--cursor-pause');
        }
      } else {
        if (parseInt(p.song.currentTime()) >= parseInt(p.song.buffer.duration)) {
          p.reset();
        }
        document.getElementById("play-icon").classList.remove("fade-in");
        p.song.play();
        if (p.canvas) {
          p.canvas.classList.add('p5Canvas--cursor-pause');
          p.canvas.classList.remove('p5Canvas--cursor-play');
        }
      }
    }
  };

  p.windowResized = () => {
    p.canvasWidth = window.innerWidth;
    p.canvasHeight = window.innerHeight;
    p.resizeCanvas(p.canvasWidth, p.canvasHeight);
    p.ox = p.random(p.width);
    p.oy = p.random(p.height);
  };
};

new p5(sketch);
