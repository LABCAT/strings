import p5 from "p5";

const sketch = (p) => {
  p.setup = () => {
    p.createCanvas(window.innerWidth, window.innerHeight);
  };

  p.draw = () => {
    p.background(255);
    p.fill(0);
    p.circle(p.width / 2, p.height / 2, 100);
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
};

new p5(sketch);

