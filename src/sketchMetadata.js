export const sketchMetadata = {
  'number-1': {
    title: '#StringsNo1',
    description: 'An exploration into generative animations inspired by strings.',
    sketch: 'StringsNo1.js',
  },
};

export function getAllSketches() {
  return Object.keys(sketchMetadata).map(id => ({
    id,
    ...sketchMetadata[id]
  }));
}
  
export function getSketchById(id) {
  return sketchMetadata[id] || null;
}
