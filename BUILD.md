# Build Configuration Guide

This document describes the build configuration for the Bible Presenter application.

## Overview

The application uses **Vite** as the build tool with **TypeScript** for type safety. The build system supports multiple environments (development, staging, production) with environment-specific configurations.

## Prerequisites

- Node.js 18+ 
- npm or yarn

## Installation

```bash
npm install
```

## Development

Start the development server with hot module replacement (HMR):

```bash
npm run dev
```

The development server will start at `http://localhost:3000` with:
- Hot Module Replacement (HMR) enabled
- Source maps for debugging
- TypeScript type checking
- Fast refresh for instant updates

## Type Checking

Run TypeScript type checking without emitting files:

```bash
npm run type-check
```

## Building

### Development Build

Build for development environment with full source maps:

```bash
npm run build:dev
```

**Features:**
- Full source maps included
- Console logs preserved
- No minification
- Faster build time

### Staging Build

Build for staging environment with source maps:

```bash
npm run build:staging
```

**Features:**
- Source maps included
- Console logs preserved
- Minification enabled
- Optimized for testing

### Production Build

Build for production environment with optimized output:

```bash
npm run build:production
```

**Features:**
- Hidden source maps (not referenced in bundle)
- Console logs removed
- Full minification with Terser
- Optimized for performance
- Smallest bundle size

### Default Build

Build using the default mode (production):

```bash
npm run build
```

## Preview

Preview the production build locally:

```bash
npm run preview
```

The preview server will start at `http://localhost:4173`.

## Build Output

All builds output to the `dist/` directory with the following structure:

```
dist/
├── index.html
├── assets/
│   ├── images/
│   ├── fonts/
│   └── media/
└── js/
    ├── main-[hash].js
    ├── core-[hash].js
    ├── bible-[hash].js
    ├── songs-[hash].js
    ├── ai-[hash].js
    ├── vendor-[hash].js
    └── data-[hash].js
```

## Code Splitting

The build system automatically splits code into the following chunks:

- **main**: Entry point and initialization
- **core**: State management, event bus, DI container, configuration
- **bible**: Bible feature module (lazy loaded)
- **songs**: Songs feature module (lazy loaded)
- **ai**: AI feature module (lazy loaded)
- **vendor**: Third-party libraries (Preact, etc.)
- **data**: Storage, loaders, and cache managers

## Source Maps

Source maps are configured per environment:

| Environment | Source Map Type | Description |
|-------------|----------------|-------------|
| Development | `true` | Full source maps with references |
| Staging | `true` | Full source maps with references |
| Production | `'hidden'` | Source maps generated but not referenced |

## Environment Variables

Environment-specific variables are loaded from:

- `.env` - Default configuration (development)
- `.env.development` - Development environment
- `.env.staging` - Staging environment
- `.env.production` - Production environment
- `.env.local` - Local overrides (not committed to git)

All environment variables must be prefixed with `VITE_` to be exposed to the application.

### Available Variables

See `.env` file for the complete list of available environment variables.

## TypeScript Configuration

The project uses strict TypeScript configuration with:

- **Strict mode enabled**: All strict type checking options
- **No implicit any**: All types must be explicitly defined
- **Strict null checks**: Null and undefined must be handled explicitly
- **No unused locals/parameters**: Unused code is flagged as error
- **Path aliases**: Convenient imports using `@/`, `@core/`, etc.

### Path Aliases

```typescript
import { StateManager } from '@core/state/StateManager';
import { StorageManager } from '@data/storage/StorageManager';
import { BibleController } from '@features/bible/BibleController';
import { Modal } from '@ui/components/Modal';
import { debounce } from '@utils/debounce';
import { Slide } from '@types/Slide';
```

## Build Performance

### Development Build
- **Time**: ~2-5 seconds (incremental)
- **Size**: Unminified with source maps

### Production Build
- **Time**: ~10-30 seconds (full optimization)
- **Size**: Minified and compressed
- **Target**: < 30 seconds for incremental builds (Requirement 17.7)

## Optimization Features

1. **Tree Shaking**: Removes unused code
2. **Code Splitting**: Splits code into smaller chunks
3. **Minification**: Reduces file size with Terser
4. **Asset Optimization**: Optimizes images, fonts, and media
5. **CSS Code Splitting**: Separates CSS into individual files
6. **Dependency Pre-bundling**: Pre-bundles dependencies for faster dev server

## Troubleshooting

### Build Fails with Type Errors

Run type checking to see detailed errors:

```bash
npm run type-check
```

### Slow Build Times

1. Check if node_modules needs cleaning:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Clear Vite cache:
   ```bash
   rm -rf node_modules/.vite
   ```

### Source Maps Not Working

Ensure you're using the correct build command for your environment:
- Development: `npm run build:dev`
- Staging: `npm run build:staging`
- Production: Source maps are hidden by default

## Requirements Satisfied

This build configuration satisfies the following requirements:

- **Requirement 2.2**: Module system with ES6 modules and bundling
- **Requirement 17.1**: Transpile modern JavaScript to ES5 for compatibility
- **Requirement 17.2**: Minify JavaScript for production
- **Requirement 17.3**: Minify CSS for production
- **Requirement 17.4**: Generate source maps for debugging
- **Requirement 18.1**: TypeScript interfaces for all data structures

## Additional Resources

- [Vite Documentation](https://vitejs.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
- [Preact Documentation](https://preactjs.com/)
