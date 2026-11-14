// @ts-check
import { defineConfig } from 'astro/config';
import { astroAnimationsScssPrepend } from '@labcat2020/animation-lab/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://strings.labcat.nz',
  devToolbar: {
    enabled: false
  },
  base: '/',
  vite: {
    resolve: {
      alias: {
        '@sketches': '/src/sketches',
        '@layouts': '/src/layouts',
        '@styles': '/src/styles',
        '@lib': '/src/lib',
        '@templates': '/src/templates',
        '@components': '/src/components',
        '@pages': '/src/pages',
        '@': '/src',
      },
    },
    optimizeDeps: {
      exclude: ['p5.sound']
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: astroAnimationsScssPrepend(),
          silenceDeprecations: ['import', 'global-builtin']
        }
      }
    }
  },
});
