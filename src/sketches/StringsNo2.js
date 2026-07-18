import p5 from "p5";
import "@lib/p5.audioReact.js";


const base = import.meta.env.BASE_URL || './';
const audio = base + 'audio/StringsNo2.mp3';
const midi = base + 'audio/StringsNo2.mid';

const sketch = (p) => {
  p.canvasWidth = window.innerWidth;
  p.canvasHeight = window.innerHeight;
  p.audioLoaded = false;
  p.song = null;
  p.PPQ = 3840 * 4;
  p.hasStarted = false;
  p.creditsLogged = false;

  p.noiseMax = 1;
  p.zoff = 0;
  p.ca = 0;
  p.cb = 0;
  p.ox = 0;
  p.oy = 0;
  p.max = 0;
  p.scaleMultiplier = 4;

  p.setup = async () => {
    await p.loadSong(audio, midi, (midiData) => {
      if (midiData) {
        console.log(midiData);
        const noteSet1 = midiData.tracks[7].notes;
        p.scheduleCueSet(noteSet1, 'executeCueSet1');
        const noteSet2 = midiData.tracks[2].notes;
        p.scheduleCueSet(noteSet2, 'executeCueSet2');
      }
    });

    p.createCanvas(p.canvasWidth, p.canvasHeight);
    p.colorMode(p.HSB);
    p.angleMode(p.DEGREES);
    p.noFill();
    p.ca = p.color("#0CCBCFAA");
    p.cb = p.color("#FE68B5AA");
    p.ox = p.width / 2;
    p.oy = p.height / 2;
    p.max = p.width > p.height ? p.width : p.height;
  };

  p.draw = () => {
    if(p.audioLoaded && p.song.isPlaying()){
      p.stroke(
        p.lerpColor(p.ca, p.cb, p.abs(p.sin(p.zoff * 100)))
      );
      p.push();
      p.translate(p.ox, p.oy);
      p.scale(1/p.scaleMultiplier);
      p.beginShape();
      for (let t = 0; t < 720; t++) {
        let xoff = p.map(p.cos(t), -1, 1, 0, p.noiseMax);
        let yoff = p.map(p.sin(t), -1, 1, 0, p.noiseMax);

        let n = p.noise(xoff, yoff, p.zoff);

        let r = p.map(n, 0, 1, 0, p.height * 1.5);
        let x = r * p.cos(t);
        let y = r * p.sin(t);
        p.vertex(x, y);
      }
      p.endShape(p.CLOSE);
      p.scale(p.scaleMultiplier);
      p.translate(-p.ox, -p.oy);

      p.zoff += 0.005;
    }
  };

  p.executeCueSet1 = (note) => {
    const { midi, durationTicks, ticks } = note;
    if(midi < 62 && durationTicks > 30000) {
      console.log(note);
      p.ca = p.color(
        p.random(0, 360),
        100,
        100
      );

      p.cb = p.color(
        p.random(0, 360),
        100,
        100
      );

      if(ticks % 122880 === 0) {
        p.ox = p.random(
          p.width / 8,
          p.width - p.width / 8
        );

        p.oy = p.random(
          p.height / 8,
          p.height - p.height / 8
        );
      }
    }
  };

  p.executeCueSet2 = (note) => {
    const { midi, currentCue } = note;
    if(midi < 50) {
      p.background(0, 0, 0, 0.5);
      p.scaleMultiplier = p.scaleMultiplier - 0.2;
      
      if(currentCue > 20) {
        p.blendMode(p.SCREEN);
      }
    }
  };

  p.resetAnimation = () => {
    p.zoff = 0;
    p.scaleMultiplier = 4;
    p.ox = p.width / 2;
    p.oy = p.height / 2;
    p.background(0);
  };

  p.mousePressed = () => {
    p.togglePlayback();
    if (typeof window.dataLayer !== typeof undefined && !p.hasStarted){
      window.dataLayer.push(
        { 
          'event': 'play-animation',
          'animation': {
            'title': document.title,
            'location': window.location.href,
            'action': 'start playing'
          }
        }
      );
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
    p.max = p.width > p.height ? p.width : p.height;
    p.ox = p.width / 2;
    p.oy = p.height / 2;
  };
};

new p5(sketch);
