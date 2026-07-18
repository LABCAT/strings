import p5 from "p5";

const sketch = (p) => {
  p.setup = () => {
    p.createCanvas(window.innerWidth, window.innerHeight);
    // Background moved to draw loop
  };

  p.draw = () => {
    p.background(0);
  };
};

new p5(sketch);
