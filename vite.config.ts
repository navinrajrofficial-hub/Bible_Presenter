import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import preact from '@preact/preset-vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  const isDevelopment = mode === 'development';
  const isStaging = mode === 'staging';
  const isProduction = mode === 'production';

  return {
    plugins: [preact()],
    
    // Path resolution
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        '@core': resolve(__dirname, './src/core'),
        '@data': resolve(__dirname, './src/data'),
        '@features': resolve(__dirname, './src/features'),
        '@ui': resolve(__dirname, './src/ui'),
        '@utils': resolve(__dirname, './src/utils'),
        '@types': resolve(__dirname, './src/types'),
      },
    },

    // Development server configuration
    server: {
      port: 3000,
      strictPort: false,
      host: true,
      open: true,
      cors: true,
      hmr: {
        overlay: true,
      },
    },

    // Preview server configuration
    preview: {
      port: 4173,
      strictPort: false,
      host: true,
      open: true,
    },

    // Build configuration
    build: {
      // Output directory
      outDir: 'dist',
      
      // Generate source maps for debugging
      // 'hidden' generates source maps but doesn't reference them in the bundle
      // 'inline' embeds source maps in the bundle (larger file size)
      // true generates separate .map files and references them
      sourcemap: isDevelopment ? true : isStaging ? true : 'hidden',
      
      // Target browsers
      target: 'es2015',
      
      // Minification
      minify: isProduction ? 'terser' : false,
      
      // Terser options for production
      terserOptions: isProduction ? {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
        },
        format: {
          comments: false,
        },
      } : undefined,
      
      // Chunk size warning limit (in KB)
      chunkSizeWarningLimit: 500,
      
      // Rollup options for advanced bundling
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
        },
        output: {
          // Manual chunk splitting for better caching
          manualChunks: {
            // Core application bundle
            'core': [
              './src/core/state/StateManager',
              './src/core/events/EventBus',
              './src/core/di/Container',
              './src/core/config/Config',
            ],
            // Bible feature bundle
            'bible': [
              './src/features/bible/BibleController',
              './src/features/bible/BiblePanel',
            ],
            // Songs feature bundle
            'songs': [
              './src/features/songs/SongController',
              './src/features/songs/SongPanel',
            ],
            // AI feature bundle
            'ai': [
              './src/features/ai/AIController',
              './src/features/ai/VoiceHandler',
            ],
            // Vendor libraries
            'vendor': [
              'preact',
              'preact/hooks',
            ],
            // Storage and data utilities
            'data': [
              './src/data/storage/StorageManager',
              './src/data/loaders/ContentLoader',
              './src/data/cache/CacheManager',
            ],
          },
          // Asset file naming
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name?.split('.') || [];
            const ext = info[info.length - 1];
            
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext || '')) {
              return `assets/images/[name]-[hash][extname]`;
            } else if (/woff2?|ttf|otf|eot/i.test(ext || '')) {
              return `assets/fonts/[name]-[hash][extname]`;
            } else if (/mp4|webm|ogg|mp3|wav|flac|aac/i.test(ext || '')) {
              return `assets/media/[name]-[hash][extname]`;
            }
            
            return `assets/[name]-[hash][extname]`;
          },
          // Chunk file naming
          chunkFileNames: 'js/[name]-[hash].js',
          // Entry file naming
          entryFileNames: 'js/[name]-[hash].js',
        },
      },
      
      // CSS code splitting
      cssCodeSplit: true,
      
      // Report compressed size
      reportCompressedSize: !isDevelopment,
      
      // Emit assets during build
      emptyOutDir: true,
    },

    // Dependency optimization
    optimizeDeps: {
      include: [
        'preact',
        'preact/hooks',
      ],
      exclude: [],
    },

    // CSS configuration
    css: {
      devSourcemap: isDevelopment,
      preprocessorOptions: {},
    },

    // Define global constants
    define: {
      __APP_VERSION__: JSON.stringify(env.npm_package_version || '1.0.0'),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __DEV__: isDevelopment,
      __STAGING__: isStaging,
      __PROD__: isProduction,
    },

    // Environment variables prefix
    envPrefix: 'VITE_',

    // Log level
    logLevel: isDevelopment ? 'info' : 'warn',

    // Clear screen on rebuild
    clearScreen: true,
  };
});
