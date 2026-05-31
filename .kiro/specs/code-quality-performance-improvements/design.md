# Design Document: Code Quality and Performance Improvements

## Overview

This design document outlines a comprehensive refactoring strategy for the Bible Presenter application to address critical performance bottlenecks, improve code quality, and establish modern development practices. The refactoring will transform the current monolithic JavaScript application into a modular, type-safe, well-tested system while preserving all existing functionality.

### Current State Analysis

The Bible Presenter is a Tamil Bible/Song presentation tool consisting of:
- **Web Application**: Single-page application with ~6,174 lines of JavaScript in `app.js`
- **Android Wrapper**: WebView-based Android application
- **Large Data Files**: `bible_content.js` and `song_content.js` containing all Bible books and songs
- **Architecture**: Monolithic structure with global state, direct DOM manipulation, and no module system

### Key Problems Addressed

1. **Performance Issues**: Blocking main thread during startup, inefficient thumbnail rendering, no lazy loading
2. **Code Quality**: Global variables, magic numbers, callback hell, code duplication
3. **Maintainability**: Monolithic file structure, no type safety, poor separation of concerns
4. **Testing**: No automated testing infrastructure
5. **Security**: Hardcoded API keys, insufficient input validation
6. **Developer Experience**: No build pipeline, no module system, difficult debugging

### Design Goals

1. **Performance**: Sub-2-second initial load, smooth 60fps scrolling, efficient memory usage
2. **Modularity**: Clear separation of concerns with ES6 modules and dependency injection
3. **Type Safety**: TypeScript integration for compile-time error detection
4. **Testability**: Comprehensive test coverage with unit, integration, and E2E tests
5. **Security**: Secure API key management, robust input validation and sanitization
6. **Maintainability**: DRY code, clear architecture, comprehensive documentation
7. **Progressive Enhancement**: PWA features, offline support, accessibility compliance


## Components and Interfaces

### Core Components

#### StateManager
```typescript
interface IStateManager {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): boolean;
  subscribe(key: string, callback: StateChangeCallback): UnsubscribeFunction;
  undo(): boolean;
  redo(): boolean;
  getHistory(): StateHistory[];
}

interface StateChangeCallback {
  (key: string, newValue: any, oldValue: any): void;
}

interface StateHistory {
  timestamp: number;
  key: string;
  value: any;
}
```

**Implementation Details**:
- Maximum 50 state changes in history (LRU eviction)
- Validation against defined constraints before applying changes
- Synchronous event emission to all subscribers
- Immutable state updates (deep cloning)

#### EventBus
```typescript
interface IEventBus {
  publish(event: string, payload?: any): void;
  subscribe(event: string, handler: EventHandler): UnsubscribeFunction;
  unsubscribe(event: string, handler: EventHandler): void;
  clear(): void;
}

interface EventHandler {
  (payload: any): void | Promise<void>;
}
```

**Implementation Details**:
- Async event notification (Promise.resolve().then())
- Weak reference tracking to prevent memory leaks
- Event filtering by type and payload properties
- Development mode logging for debugging


## Architecture

### High-Level Architecture

The refactored application follows a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ UI Components│  │ Event Handlers│  │ View Managers│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Business Logic Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │State Manager │  │ Event Bus    │  │ Controllers  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Content Loader│  │Slide Renderer│  │Search Handler│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Access Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Storage Manager│  │ API Clients  │  │ Cache Manager│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Module Organization

The application will be organized into the following modules:


#### ContentLoader (Lazy Loading)
```typescript
interface IContentLoader {
  loadBibleBook(bookName: string): Promise<BibleBook>;
  loadSongBatch(startIndex: number, count: number): Promise<Song[]>;
  preloadNextBatch(): Promise<void>;
  getCachedBook(bookName: string): BibleBook | null;
  getCachedSong(songId: number): Song | null;
}

interface BibleBook {
  name: string;
  chapters: { [chapter: number]: { [verse: number]: string } };
}

interface Song {
  id: number;
  title: string;
  artist: string;
  content: string;
}
```

**Loading Strategy**:
- **Initial Load**: Essential UI only (< 2 seconds)
- **Idle Loading**: After 500ms idle, load Bible (5 books/chunk) and Songs (50 songs/chunk)
- **On-Demand**: Load specific book/song when requested (< 1 second)
- **Caching**: LRU cache with 50-item limit
- **Retry Logic**: 3 attempts with exponential backoff (1s, 2s, 4s)

#### StorageManager (IndexedDB)
```typescript
interface IStorageManager {
  saveSlides(slides: Slide[]): Promise<void>;
  loadSlides(): Promise<Slide[]>;
  exportSlides(slides: Slide[]): Promise<Blob>;
  importSlides(file: File): Promise<Slide[]>;
  migrateFromLocalStorage(): Promise<boolean>;
}

interface Slide {
  id: string | number;
  type: 'simple' | 'html' | 'media';
  name: string;
  bookmarked: boolean;
  // Type-specific fields
  [key: string]: any;
}
```

**Storage Strategy**:
- **Primary**: IndexedDB (supports >8MB, structured data)
- **Fallback**: localStorage (with warning if IndexedDB unavailable)
- **Migration**: Automatic one-time migration from localStorage to IndexedDB
- **Quota Management**: Display clear error when quota exceeded


```
src/
├── core/                    # Core application logic
│   ├── state/              # State management
│   │   ├── StateManager.ts
│   │   ├── StateHistory.ts
│   │   └── StateValidator.ts
│   ├── events/             # Event bus system
│   │   ├── EventBus.ts
│   │   └── EventTypes.ts
│   ├── di/                 # Dependency injection
│   │   ├── Container.ts
│   │   └── Injectable.ts
│   └── config/             # Configuration management
│       ├── Config.ts
│       └── constants.ts
├── data/                    # Data access layer
│   ├── storage/            # Storage management
│   │   ├── StorageManager.ts
│   │   ├── IndexedDBAdapter.ts
│   │   └── LocalStorageAdapter.ts
│   ├── loaders/            # Content loaders
│   │   ├── ContentLoader.ts
│   │   ├── BibleLoader.ts
│   │   └── SongLoader.ts
│   └── cache/              # Caching system
│       ├── CacheManager.ts
│       └── LRUCache.ts
├── features/                # Feature modules
│   ├── slides/             # Slide management
│   │   ├── SlideController.ts
│   │   ├── SlideRenderer.ts
│   │   └── ThumbnailManager.ts
│   ├── bible/              # Bible feature
│   │   ├── BibleController.ts
│   │   └── BiblePanel.ts
│   ├── songs/              # Song feature
│   │   ├── SongController.ts
│   │   └── SongPanel.ts
│   └── ai/                 # AI integration
│       ├── AIController.ts
│       └── VoiceHandler.ts
├── ui/                      # UI components
│   ├── components/         # Reusable components
│   │   ├── Modal.ts
│   │   ├── Toast.ts
│   │   └── Dropdown.ts
│   ├── dom/                # DOM management
│   │   ├── DOMManager.ts
│   │   └── VirtualDOM.ts
│   └── views/              # View managers
│       ├── EditorView.ts
│       ├── PreviewView.ts
│       └── PresentView.ts
├── utils/                   # Utility functions
│   ├── validation.ts       # Input validation
│   ├── sanitization.ts     # HTML sanitization
│   ├── debounce.ts         # Debouncing utilities
│   └── logger.ts           # Logging system
└── types/                   # TypeScript type definitions
    ├── Slide.ts
    ├── Bible.ts
    └── Song.ts
```

#### SlideRenderer (Virtual Scrolling)
```typescript
interface ISlideRenderer {
  renderThumbnail(slide: Slide, container: HTMLElement): Promise<void>;
  renderPreview(slide: Slide, iframe: HTMLIFrameElement): Promise<void>;
  updateVisibleRange(startIndex: number, endIndex: number): void;
  clearCache(): void;
}

interface RenderOptions {
  priority: 'high' | 'normal' | 'low';
  useCache: boolean;
  timeout: number;
}
```

**Rendering Strategy**:
- **Virtual Scrolling**: Render only visible thumbnails + 5-item buffer zone
- **Render Queue**: Maximum 3 concurrent renders, prioritize visible items
- **Debouncing**: 150ms debounce when scrolling > 10 thumbnails/second
- **Caching**: LRU cache for 50 rendered thumbnails (16ms cache hit time)
- **Iframe Reuse**: Recycle iframe elements for off-screen thumbnails

#### SearchHandler (Debounced Search)
```typescript
interface ISearchHandler {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  filter(items: any[], predicate: FilterPredicate): any[];
  clearSearch(): void;
}

interface SearchOptions {
  debounceMs: number;
  maxResults: number;
  highlightMatches: boolean;
}

interface SearchResult {
  item: any;
  matches: Match[];
  score: number;
}

interface Match {
  field: string;
  start: number;
  end: number;
}
```

**Search Strategy**:
- **Debouncing**: 300ms delay after last keystroke
- **Progressive Loading**: Initial 100 results, load 50 more when scrolling near end
- **Loading Indicator**: Show after 200ms if search not complete
- **Timeout**: Cancel search after 5 seconds with error message
- **Highlighting**: Wrap matches in `<span class="highlight">` with distinct background

#### DOMManager (Efficient DOM Operations)
```typescript
interface IDOMManager {
  batchRead(operations: ReadOperation[]): any[];
  batchWrite(operations: WriteOperation[]): void;
  createElement(tag: string, props?: ElementProps): HTMLElement;
  updateElement(element: HTMLElement, props: ElementProps): void;
  removeElement(element: HTMLElement): void;
}

interface ReadOperation {
  element: HTMLElement;
  property: string;
}

interface WriteOperation {
  element: HTMLElement;
  property: string;
  value: any;
}
```

**DOM Optimization Strategy**:
- **Read/Write Batching**: Separate DOM reads and writes to minimize layout thrashing
- **DocumentFragment**: Use for multiple insertions
- **Element Caching**: Cache frequently accessed DOM elements
- **CSS Classes**: Prefer class manipulation over inline styles
- **requestAnimationFrame**: Use for animations and visual updates
- **Virtual DOM**: Use Preact or similar lightweight library for complex UI updates

#### APIKeyManager (Secure Storage)
```typescript
interface IAPIKeyManager {
  setKey(service: string, key: string): Promise<boolean>;
  getKey(service: string): Promise<string | null>;
  validateKey(service: string, key: string): boolean;
  maskKey(key: string): string;
  rotateKey(service: string, newKey: string): Promise<boolean>;
}

interface APIKeyConfig {
  service: string;
  format: RegExp;
  minLength: number;
  maxLength: number;
}
```

**Security Strategy**:
- **Storage**: Browser secure storage (IndexedDB with encryption)
- **Never in Source**: No API keys in source code or version control
- **Encryption**: AES-256 encryption before storage
- **Masking**: Display only last 4 characters (e.g., "••••••••1234")
- **Validation**: Format validation before accepting keys
- **Rotation**: Secure key rotation mechanism with old key invalidation

#### ValidationService
```typescript
interface IValidationService {
  validateHTML(html: string): ValidationResult;
  validateURL(url: string): ValidationResult;
  validateFilePath(path: string): ValidationResult;
  sanitizeHTML(html: string): string;
  escapeHTML(text: string): string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  sanitized?: string;
}

interface ValidationError {
  field: string;
  rule: string;
  message: string;
}
```

**Validation Rules**:
- **HTML**: Remove `<script>`, event handlers (`on*`), `javascript:` URLs
- **File Paths**: Allow only alphanumeric, `-`, `_`, `/`, `.`; reject `..` and absolute paths
- **URLs**: Allow only `http://` and `https://`; max 2048 characters
- **Special Characters**: Convert `<`, `>`, `&`, `"`, `'` to HTML entities
- **API Responses**: Validate expected data types and required fields
- **Error Display**: Show within 100ms with field and rule information
- **Logging**: Log timestamp, field, rule, and sanitized sample (max 100 chars)

#### PerformanceMonitor
```typescript
interface IPerformanceMonitor {
  measurePageLoad(): PerformanceMetrics;
  measureTimeToInteractive(): number;
  measureFrameRate(): number;
  measureMemoryUsage(): MemoryMetrics;
  profileFunction(fn: Function): ProfileResult;
  logMetrics(): void;
}

interface PerformanceMetrics {
  loadTime: number;
  domContentLoaded: number;
  firstPaint: number;
  firstContentfulPaint: number;
}

interface MemoryMetrics {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}
```

**Monitoring Strategy**:
- **Page Load**: Measure using Navigation Timing API
- **Time to Interactive**: Measure using Performance Observer
- **Frame Rate**: Measure during scrolling using requestAnimationFrame
- **Memory**: Track using performance.memory API
- **Profiling**: Use Performance API for slow function identification
- **Analytics**: Send metrics to configured logging service
- **Alerts**: Notify developers when performance degrades below thresholds



### Dependency Injection Container

```typescript
interface IDIContainer {
  register<T>(token: string, factory: Factory<T>, singleton?: boolean): void;
  resolve<T>(token: string): T;
  registerSingleton<T>(token: string, instance: T): void;
  has(token: string): boolean;
}

interface Factory<T> {
  (container: IDIContainer): T;
}
```

**DI Strategy**:
- **Constructor Injection**: All dependencies injected through constructor parameters
- **Interface-Based**: Define interfaces for all injectable dependencies
- **Singleton Support**: Support both singleton and transient lifetimes
- **Circular Detection**: Detect and prevent circular dependencies at registration time
- **Mock Support**: Easy mock injection for testing

### Logger

```typescript
interface ILogger {
  debug(message: string, context?: any): void;
  info(message: string, context?: any): void;
  warn(message: string, context?: any): void;
  error(message: string, context?: any): void;
  setLevel(level: LogLevel): void;
  setFilter(filter: LogFilter): void;
}

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: any;
  stackTrace?: string;
}
```

**Logging Strategy**:
- **Levels**: DEBUG, INFO, WARN, ERROR with filtering
- **Timestamps**: ISO 8601 format with milliseconds
- **Context**: Structured context data (user action, component, etc.)
- **Remote Logging**: Send ERROR logs to configured service
- **Volume Limiting**: Rate limiting in production (max 100 logs/minute)
- **Development Mode**: Log viewer with filtering and search

## Data Models

### Slide Data Model

```typescript
type SlideType = 'simple' | 'html' | 'media';

interface BaseSlide {
  id: string | number;
  type: SlideType;
  name: string;
  bookmarked: boolean;
  _rev?: number;
}

interface SimpleSlide extends BaseSlide {
  type: 'simple';
  title: string;
  body: string;
  bg: string;
  color: string;
  layout: 'center' | 'left';
  font: string;
}

interface HTMLSlide extends BaseSlide {
  type: 'html';
  html: string;
}

interface MediaSlide extends BaseSlide {
  type: 'media';
  mediaKind: 'image' | 'video';
  mediaSrc: string;
}

type Slide = SimpleSlide | HTMLSlide | MediaSlide;
```

### Bible Data Model

```typescript
interface BibleContent {
  books: BibleBook[];
  metadata: BibleMetadata;
}

interface BibleBook {
  id: string;
  name: string;
  tamilName: string;
  testament: 'old' | 'new';
  chapters: BibleChapter[];
}

interface BibleChapter {
  number: number;
  verses: BibleVerse[];
}

interface BibleVerse {
  number: number;
  text: string;
}

interface BibleMetadata {
  version: string;
  language: string;
  lastUpdated: string;
}
```

### Song Data Model

```typescript
interface SongContent {
  songs: Song[];
  metadata: SongMetadata;
}

interface Song {
  id: number;
  title: string;
  tamilTitle: string;
  artist?: string;
  content: string;
  verses: SongVerse[];
  metadata?: SongItemMetadata;
}

interface SongVerse {
  type: 'main' | 'sub' | 'stanza';
  text: string;
  order: number;
}

interface SongItemMetadata {
  category?: string;
  tags?: string[];
  addedDate?: string;
}

interface SongMetadata {
  totalSongs: number;
  lastUpdated: string;
}
```

### Configuration Data Model

```typescript
interface AppConfig {
  environment: 'development' | 'staging' | 'production';
  features: FeatureFlags;
  performance: PerformanceConfig;
  storage: StorageConfig;
  logging: LoggingConfig;
  api: APIConfig;
}

interface FeatureFlags {
  enablePWA: boolean;
  enableOfflineMode: boolean;
  enableVoiceControl: boolean;
  enableAIExtraction: boolean;
}

interface PerformanceConfig {
  lazyLoadDelay: number;
  bibleChunkSize: number;
  songChunkSize: number;
  thumbnailCacheSize: number;
  searchDebounceMs: number;
  maxConcurrentRenders: number;
}

interface StorageConfig {
  preferIndexedDB: boolean;
  maxStorageSize: number;
  enableMigration: boolean;
}

interface LoggingConfig {
  level: LogLevel;
  enableRemote: boolean;
  remoteEndpoint?: string;
  maxLogsPerMinute: number;
}

interface APIConfig {
  services: {
    [serviceName: string]: APIServiceConfig;
  };
}

interface APIServiceConfig {
  endpoint: string;
  timeout: number;
  retryAttempts: number;
}
```



## Error Handling

### Error Classification

The application categorizes errors into two main types:

1. **Recoverable Errors**: Allow continued operation with partial functionality
   - Network timeouts
   - Content loading failures
   - Search timeouts
   - Cache misses
   - Validation failures

2. **Fatal Errors**: Prevent further application use
   - Storage quota exceeded (cannot save)
   - Critical module loading failure
   - State corruption
   - Unrecoverable API errors

### Error Handling Strategy

```typescript
interface IErrorHandler {
  handleError(error: AppError): void;
  registerHandler(errorType: string, handler: ErrorHandlerFunction): void;
  reportError(error: AppError): Promise<void>;
}

interface AppError extends Error {
  type: ErrorType;
  severity: ErrorSeverity;
  context: ErrorContext;
  timestamp: number;
  stackTrace: string;
  recoverable: boolean;
}

enum ErrorType {
  NETWORK = 'network',
  STORAGE = 'storage',
  VALIDATION = 'validation',
  RENDERING = 'rendering',
  STATE = 'state',
  MODULE = 'module',
  API = 'api',
  UNKNOWN = 'unknown'
}

enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  slideId?: string;
  additionalData?: any;
}
```

### Error Display Guidelines

**Recoverable Errors**:
- Display toast notification with error type and affected operation
- Provide actionable instructions (e.g., "Check network connection and try again")
- Auto-dismiss after 5 seconds or allow manual dismissal
- Log to console in development mode

**Fatal Errors**:
- Display modal dialog with error details
- Provide options: "Reload Application" or "Reset to Default State"
- Do not auto-dismiss
- Send error report to logging service (if configured)

### Error Logging

All errors SHALL be logged with:
- **Timestamp**: ISO 8601 format with milliseconds
- **Error Type**: Classification from ErrorType enum
- **Severity**: Classification from ErrorSeverity enum
- **Stack Trace**: Full stack trace for debugging
- **Context**: User action, component, and relevant IDs
- **User Agent**: Browser and OS information
- **Application State**: Relevant state snapshot (sanitized)

### Retry Logic

For transient errors (network, loading), implement exponential backoff:
- **Attempt 1**: Immediate retry
- **Attempt 2**: 1 second delay
- **Attempt 3**: 2 seconds delay
- **Attempt 4**: 4 seconds delay
- **After 3-4 attempts**: Display error to user

## Testing Strategy

### Testing Pyramid

The application follows the testing pyramid approach:

```
        /\
       /  \
      / E2E \          10% - End-to-End Tests
     /______\
    /        \
   /Integration\       30% - Integration Tests
  /____________\
 /              \
/   Unit Tests   \     60% - Unit Tests
/________________\
```

### Unit Tests

**Scope**: Individual functions and classes in isolation

**Tools**: Jest + Testing Library

**Coverage Target**: 70% minimum

**Test Categories**:
- Pure functions (utilities, validators, formatters)
- State management logic
- Event bus functionality
- Data transformations
- Validation rules
- Sanitization logic

**Example Test Structure**:
```typescript
describe('ValidationService', () => {
  describe('validateHTML', () => {
    it('should remove script tags', () => {
      const input = '<div>Hello<script>alert("xss")</script></div>';
      const result = validationService.validateHTML(input);
      expect(result.valid).toBe(false);
      expect(result.sanitized).not.toContain('<script>');
    });

    it('should remove event handlers', () => {
      const input = '<button onclick="alert()">Click</button>';
      const result = validationService.validateHTML(input);
      expect(result.sanitized).not.toContain('onclick');
    });
  });
});
```

### Integration Tests

**Scope**: Interactions between multiple components

**Tools**: Jest + Testing Library + MSW (Mock Service Worker)

**Test Categories**:
- Component communication via EventBus
- State changes triggering UI updates
- Storage operations (IndexedDB/localStorage)
- Content loading with caching
- Search with debouncing
- Slide rendering pipeline

**Example Test Structure**:
```typescript
describe('Slide Management Integration', () => {
  it('should save slide and update UI', async () => {
    const slide = createTestSlide();
    await slideController.addSlide(slide);
    
    // Verify state updated
    expect(stateManager.get('slides')).toContainEqual(slide);
    
    // Verify storage persisted
    const stored = await storageManager.loadSlides();
    expect(stored).toContainEqual(slide);
    
    // Verify UI updated
    expect(screen.getByText(slide.name)).toBeInTheDocument();
  });
});
```

### End-to-End Tests

**Scope**: Complete user workflows from UI to data persistence

**Tools**: Playwright or Cypress

**Test Categories**:
- Create, edit, delete slides
- Import/export presentations
- Bible verse search and insertion
- Song search and insertion
- Presentation mode navigation
- Offline functionality
- Voice control

**Example Test Structure**:
```typescript
test('should create and present a slide', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // Create slide
  await page.click('button:has-text("+ Text Slide")');
  await page.fill('#s-title', 'Test Slide');
  await page.fill('#s-body', 'Test content');
  await page.click('.apply-btn');
  
  // Verify slide appears
  await expect(page.locator('.thumb')).toHaveCount(1);
  
  // Enter presentation mode
  await page.click('button:has-text("▶ Present")');
  await expect(page.locator('#present-overlay')).toBeVisible();
  
  // Verify slide content
  const iframe = page.frameLocator('#present-iframe');
  await expect(iframe.locator('text=Test Slide')).toBeVisible();
});
```

### Property-Based Testing

For critical algorithms and data transformations, use property-based testing:

**Tools**: fast-check (JavaScript property testing library)

**Test Categories**:
- Serialization/deserialization round-trips
- State transitions maintain invariants
- Search results always match query
- Validation rules are consistent

**Example**:
```typescript
import fc from 'fast-check';

describe('Slide Serialization', () => {
  it('should round-trip any valid slide', () => {
    fc.assert(
      fc.property(slideArbitrary, (slide) => {
        const serialized = serializeSlide(slide);
        const deserialized = deserializeSlide(serialized);
        expect(deserialized).toEqual(slide);
      })
    );
  });
});
```

### Test Execution

**Local Development**:
```bash
npm test              # Run all tests
npm test:unit         # Run unit tests only
npm test:integration  # Run integration tests only
npm test:e2e          # Run E2E tests only
npm test:watch        # Run tests in watch mode
npm test:coverage     # Generate coverage report
```

**CI/CD Pipeline**:
- Run all tests on every commit
- Fail build if coverage < 70%
- Run E2E tests on staging environment
- Generate and publish coverage reports

### Test Data Management

**Fixtures**: Store test data in `tests/fixtures/`
- `slides.json`: Sample slide data
- `bible.json`: Sample Bible content
- `songs.json`: Sample song data

**Factories**: Use factory functions for test data generation
```typescript
function createTestSlide(overrides?: Partial<Slide>): Slide {
  return {
    id: Math.random(),
    type: 'simple',
    name: 'Test Slide',
    bookmarked: false,
    title: 'Test Title',
    body: 'Test Body',
    bg: '#3c096c',
    color: '#ffd700',
    layout: 'center',
    font: 'Noto Serif Tamil',
    ...overrides
  };
}
```



## Build Pipeline and Bundling Strategy

### Build Tools

**Primary Build Tool**: Vite
- Fast HMR (Hot Module Replacement)
- Native ES modules support
- Optimized production builds
- Built-in TypeScript support
- Plugin ecosystem

**Alternative**: Webpack (if more control needed)

### Build Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    target: 'es2015',
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks: {
          'core': ['./src/core/index.ts'],
          'bible': ['./src/features/bible/index.ts'],
          'songs': ['./src/features/songs/index.ts'],
          'ai': ['./src/features/ai/index.ts'],
          'vendor': ['preact', 'idb']
        }
      }
    },
    chunkSizeWarningLimit: 500
  },
  optimizeDeps: {
    include: ['preact', 'idb']
  }
});
```

### Code Splitting Strategy

**Entry Point**: `src/main.ts` (core bundle)
- State management
- Event bus
- Storage manager
- Basic UI components
- Configuration

**Dynamic Imports**: Feature bundles loaded on demand
```typescript
// Lazy load Bible feature
async function loadBibleFeature() {
  const { BibleController } = await import('./features/bible');
  return new BibleController(container);
}

// Lazy load Song feature
async function loadSongFeature() {
  const { SongController } = await import('./features/songs');
  return new SongController(container);
}

// Lazy load AI feature
async function loadAIFeature() {
  const { AIController } = await import('./features/ai');
  return new AIController(container);
}
```

**Vendor Splitting**: Separate bundle for third-party libraries
- Preact (or React)
- idb (IndexedDB wrapper)
- DOMPurify (HTML sanitization)

### Asset Optimization

**Images**:
- Compress with imagemin
- Generate WebP versions
- Lazy load off-screen images

**CSS**:
- Minify with cssnano
- Remove unused CSS with PurgeCSS
- Extract critical CSS for above-the-fold content

**Fonts**:
- Use system font stacks where possible
- Subset custom fonts to required characters
- Preload critical fonts

### Build Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "build:staging": "tsc && vite build --mode staging",
    "build:production": "tsc && vite build --mode production",
    "preview": "vite preview",
    "analyze": "vite-bundle-visualizer",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx",
    "format": "prettier --write src/**/*.{ts,tsx,css}"
  }
}
```

### Build Performance Targets

- **Development Build**: < 5 seconds
- **Incremental Build**: < 2 seconds
- **Production Build**: < 30 seconds
- **Bundle Size**: 
  - Core bundle: < 100KB (gzipped)
  - Feature bundles: < 50KB each (gzipped)
  - Total initial load: < 150KB (gzipped)

### Environment Configuration

```typescript
// .env.development
VITE_ENV=development
VITE_API_ENDPOINT=http://localhost:8123
VITE_LOG_LEVEL=debug
VITE_ENABLE_PWA=false

// .env.staging
VITE_ENV=staging
VITE_API_ENDPOINT=https://staging-api.example.com
VITE_LOG_LEVEL=info
VITE_ENABLE_PWA=true

// .env.production
VITE_ENV=production
VITE_API_ENDPOINT=https://api.example.com
VITE_LOG_LEVEL=error
VITE_ENABLE_PWA=true
```

## TypeScript Integration

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "node",
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./src",
    "paths": {
      "@core/*": ["core/*"],
      "@features/*": ["features/*"],
      "@ui/*": ["ui/*"],
      "@utils/*": ["utils/*"],
      "@types/*": ["types/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```

### Type Safety Guidelines

1. **No `any` type**: Use `unknown` or proper types
2. **Strict null checks**: Handle `null` and `undefined` explicitly
3. **Type guards**: Use type guards for runtime type checking
4. **Discriminated unions**: Use for polymorphic data (e.g., Slide types)
5. **Readonly properties**: Use `readonly` for immutable data
6. **Type inference**: Let TypeScript infer types when obvious

### Migration Strategy

**Phase 1**: Add TypeScript to build pipeline
- Install TypeScript and type definitions
- Configure tsconfig.json
- Rename `.js` files to `.ts` incrementally

**Phase 2**: Add type annotations
- Start with interfaces and type definitions
- Add types to function signatures
- Add types to class properties

**Phase 3**: Enable strict mode
- Enable `strict: true` in tsconfig.json
- Fix type errors incrementally
- Remove `any` types

**Phase 4**: Generate declaration files
- Enable `declaration: true`
- Publish type definitions for modules
- Document public API types

## Progressive Web App (PWA) Features

### Service Worker Strategy

```typescript
// service-worker.ts
const CACHE_NAME = 'bible-presenter-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/dist/core.js',
  '/dist/vendor.js'
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Fetch: Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request);
      })
  );
});
```

### Offline Support

**Cached Resources**:
- Static assets (HTML, CSS, JS)
- Core application code
- UI components
- System fonts

**Offline Functionality**:
- View cached slides
- Edit slides (saved to IndexedDB)
- Navigate presentation mode
- Search cached Bible/song content

**Sync Strategy**:
- Detect online/offline status
- Queue changes when offline
- Sync to server when online (if applicable)
- Display sync status to user

### Install Prompt

```typescript
let deferredPrompt: any;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallButton();
});

function showInstallButton() {
  const installBtn = document.getElementById('install-btn');
  installBtn.style.display = 'block';
  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User ${outcome} the install prompt`);
      deferredPrompt = null;
    }
  });
}
```

### Web App Manifest

```json
{
  "name": "Bible Presenter",
  "short_name": "Presenter",
  "description": "Tamil Bible and Song Presentation Tool",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0e0e10",
  "theme_color": "#f5a623",
  "orientation": "landscape",
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```



## Accessibility Compliance

### WCAG 2.1 Level AA Compliance

#### Keyboard Navigation

**Requirements**:
- All interactive elements accessible via Tab key
- Logical tab order following visual layout
- Visible focus indicators (2px outline, high contrast)
- Keyboard shortcuts for common actions
- Escape key to close modals/panels

**Implementation**:
```typescript
// Focus management
class FocusManager {
  private focusStack: HTMLElement[] = [];

  trapFocus(container: HTMLElement) {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    container.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    });
  }

  pushFocus(element: HTMLElement) {
    this.focusStack.push(document.activeElement as HTMLElement);
    element.focus();
  }

  popFocus() {
    const element = this.focusStack.pop();
    if (element) element.focus();
  }
}
```

#### ARIA Labels and Roles

**Requirements**:
- Semantic HTML elements where possible
- ARIA roles for custom components
- ARIA labels for icon-only buttons
- ARIA live regions for dynamic content
- ARIA expanded/collapsed states

**Implementation Examples**:
```html
<!-- Button with icon -->
<button aria-label="Add new slide" class="add-btn">
  <span aria-hidden="true">+</span>
</button>

<!-- Modal dialog -->
<div role="dialog" aria-labelledby="modal-title" aria-modal="true">
  <h2 id="modal-title">Export Slides</h2>
  <!-- Modal content -->
</div>

<!-- Live region for status updates -->
<div role="status" aria-live="polite" aria-atomic="true">
  Slide saved successfully
</div>

<!-- Expandable panel -->
<button aria-expanded="false" aria-controls="bible-panel">
  Open Bible Panel
</button>
<div id="bible-panel" hidden>
  <!-- Panel content -->
</div>
```

#### Color Contrast

**Requirements**:
- Text contrast ratio ≥ 4.5:1 (normal text)
- Text contrast ratio ≥ 3:1 (large text ≥18pt)
- UI component contrast ratio ≥ 3:1
- Focus indicators contrast ratio ≥ 3:1

**Color Palette** (WCAG AA compliant):
```css
:root {
  /* Background colors */
  --bg-primary: #0e0e10;      /* Dark background */
  --bg-secondary: #18181b;    /* Slightly lighter */
  --bg-tertiary: #2a2a2e;     /* Border/separator */

  /* Text colors */
  --text-primary: #f0ede8;    /* High contrast (15.8:1) */
  --text-secondary: #a0a0a8;  /* Medium contrast (7.2:1) */
  --text-muted: #6b6b75;      /* Low contrast (4.6:1) */

  /* Accent colors */
  --accent-primary: #f5a623;  /* Orange (4.8:1 on dark) */
  --accent-success: #34d399;  /* Green (5.2:1 on dark) */
  --accent-error: #ff6b6b;    /* Red (4.9:1 on dark) */
  --accent-info: #60a5fa;     /* Blue (5.1:1 on dark) */
}
```

#### Screen Reader Support

**Requirements**:
- Descriptive link text (no "click here")
- Alt text for images
- Form labels associated with inputs
- Error messages announced
- Loading states announced

**Implementation**:
```typescript
// Announce to screen readers
function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const liveRegion = document.getElementById('sr-live-region');
  if (liveRegion) {
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.textContent = message;
    
    // Clear after announcement
    setTimeout(() => {
      liveRegion.textContent = '';
    }, 1000);
  }
}

// Usage
announce('Slide added successfully', 'polite');
announce('Error: Failed to save slide', 'assertive');
```

#### Zoom Support

**Requirements**:
- Support browser zoom up to 200%
- No horizontal scrolling at 200% zoom
- Text reflows without loss of content
- Interactive elements remain accessible

**Implementation**:
```css
/* Use relative units */
body {
  font-size: 16px; /* Base size */
}

.button {
  font-size: 0.875rem; /* 14px at base */
  padding: 0.5rem 1rem; /* Scales with zoom */
}

/* Responsive breakpoints for zoom */
@media (max-width: 1920px) {
  /* Layout adjustments for 200% zoom on 960px viewport */
  #slide-list {
    width: 160px;
  }
  #editor-panel {
    width: 280px;
  }
}
```

### Accessibility Testing

**Automated Tools**:
- axe DevTools (browser extension)
- Lighthouse accessibility audit
- WAVE (Web Accessibility Evaluation Tool)

**Manual Testing**:
- Keyboard-only navigation
- Screen reader testing (NVDA, JAWS, VoiceOver)
- Color contrast verification
- Zoom testing (100%, 150%, 200%)

## Internationalization (i18n)

### i18n Architecture

```typescript
interface II18nService {
  setLanguage(lang: string): Promise<void>;
  translate(key: string, params?: Record<string, any>): string;
  formatDate(date: Date, format: string): string;
  formatNumber(num: number, options?: NumberFormatOptions): string;
  getLanguage(): string;
  getSupportedLanguages(): string[];
}

interface TranslationData {
  [key: string]: string | TranslationData;
}
```

### Language Files

**Structure**: `src/i18n/locales/{lang}.json`

```json
// en.json
{
  "app": {
    "title": "Bible Presenter",
    "subtitle": "Tamil Bible and Song Presentation Tool"
  },
  "slides": {
    "add": "Add Slide",
    "delete": "Delete Slide",
    "export": "Export",
    "import": "Import"
  },
  "bible": {
    "title": "Holy Bible",
    "book": "Book",
    "chapter": "Chapter",
    "verse": "Verse"
  },
  "errors": {
    "loadFailed": "Failed to load {resource}",
    "saveFailed": "Failed to save {resource}",
    "networkError": "Network error. Please check your connection."
  }
}

// ta.json (Tamil)
{
  "app": {
    "title": "பரிசுத்த வேதாகமம் வழங்குபவர்",
    "subtitle": "தமிழ் பரிசுத்த வேதாகமம் மற்றும் பாடல் வழங்கல் கருவி"
  },
  "slides": {
    "add": "ஸ்லைடு சேர்க்கவும்",
    "delete": "ஸ்லைடு நீக்கவும்",
    "export": "ஏற்றுமதி",
    "import": "இறக்குமதி"
  },
  // ...
}
```

### Translation Usage

```typescript
// In components
const i18n = container.resolve<II18nService>('i18n');

// Simple translation
const title = i18n.translate('app.title');

// Translation with parameters
const error = i18n.translate('errors.loadFailed', { resource: 'Bible content' });

// Date formatting
const formattedDate = i18n.formatDate(new Date(), 'short');

// Number formatting
const formattedNumber = i18n.formatNumber(1234.56, { style: 'decimal' });
```

### Language Detection

```typescript
function detectLanguage(): string {
  // 1. Check user preference (stored in localStorage)
  const stored = localStorage.getItem('preferred-language');
  if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
    return stored;
  }

  // 2. Check browser language
  const browserLang = navigator.language.split('-')[0];
  if (SUPPORTED_LANGUAGES.includes(browserLang)) {
    return browserLang;
  }

  // 3. Default to Tamil (primary audience)
  return 'ta';
}
```

### RTL Support

```typescript
// Detect RTL languages
const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

function setTextDirection(lang: string) {
  const isRTL = RTL_LANGUAGES.includes(lang);
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}
```

```css
/* RTL-aware styles */
[dir="rtl"] .slide-list {
  border-right: none;
  border-left: 1px solid var(--border);
}

[dir="rtl"] .editor-panel {
  border-left: none;
  border-right: 1px solid var(--border);
}

/* Logical properties (automatically flip in RTL) */
.button {
  margin-inline-start: 1rem;
  padding-inline: 1rem;
}
```

## Security Improvements

### Input Validation and Sanitization

#### HTML Sanitization

```typescript
import DOMPurify from 'dompurify';

class HTMLSanitizer {
  private config: DOMPurify.Config = {
    ALLOWED_TAGS: [
      'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'em', 'u', 'br', 'ul', 'ol', 'li',
      'img', 'video', 'audio', 'source'
    ],
    ALLOWED_ATTR: [
      'class', 'id', 'style', 'src', 'alt', 'width', 'height',
      'controls', 'autoplay', 'loop', 'muted'
    ],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
  };

  sanitize(html: string): string {
    return DOMPurify.sanitize(html, this.config);
  }

  sanitizeAndValidate(html: string): ValidationResult {
    const sanitized = this.sanitize(html);
    const valid = sanitized === html;
    
    return {
      valid,
      sanitized,
      errors: valid ? [] : [{
        field: 'html',
        rule: 'no-malicious-content',
        message: 'HTML contains potentially malicious content that was removed'
      }]
    };
  }
}
```

#### URL Validation

```typescript
class URLValidator {
  private allowedProtocols = ['http:', 'https:'];
  private maxLength = 2048;

  validate(url: string): ValidationResult {
    const errors: ValidationError[] = [];

    // Check length
    if (url.length > this.maxLength) {
      errors.push({
        field: 'url',
        rule: 'max-length',
        message: `URL exceeds maximum length of ${this.maxLength} characters`
      });
    }

    // Parse URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (e) {
      errors.push({
        field: 'url',
        rule: 'valid-format',
        message: 'Invalid URL format'
      });
      return { valid: false, errors };
    }

    // Check protocol
    if (!this.allowedProtocols.includes(parsed.protocol)) {
      errors.push({
        field: 'url',
        rule: 'allowed-protocol',
        message: `Only ${this.allowedProtocols.join(', ')} protocols are allowed`
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

#### File Path Validation

```typescript
class FilePathValidator {
  private allowedPattern = /^[a-zA-Z0-9\-_\/\.]+$/;

  validate(path: string): ValidationResult {
    const errors: ValidationError[] = [];

    // Check for parent directory references
    if (path.includes('..')) {
      errors.push({
        field: 'path',
        rule: 'no-parent-refs',
        message: 'File path cannot contain parent directory references (..)'
      });
    }

    // Check for absolute paths
    if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
      errors.push({
        field: 'path',
        rule: 'no-absolute-paths',
        message: 'Absolute file paths are not allowed'
      });
    }

    // Check allowed characters
    if (!this.allowedPattern.test(path)) {
      errors.push({
        field: 'path',
        rule: 'allowed-characters',
        message: 'File path contains invalid characters'
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

### API Key Management

```typescript
import { AES, enc } from 'crypto-js';

class APIKeyManager implements IAPIKeyManager {
  private encryptionKey: string;
  private storage: IDBDatabase;

  constructor(encryptionKey: string) {
    this.encryptionKey = encryptionKey;
  }

  async setKey(service: string, key: string): Promise<boolean> {
    // Validate key format
    if (!this.validateKey(service, key)) {
      throw new Error(`Invalid API key format for ${service}`);
    }

    // Encrypt key
    const encrypted = AES.encrypt(key, this.encryptionKey).toString();

    // Store in IndexedDB
    const tx = this.storage.transaction('api-keys', 'readwrite');
    const store = tx.objectStore('api-keys');
    await store.put({ service, key: encrypted });

    return true;
  }

  async getKey(service: string): Promise<string | null> {
    const tx = this.storage.transaction('api-keys', 'readonly');
    const store = tx.objectStore('api-keys');
    const result = await store.get(service);

    if (!result) return null;

    // Decrypt key
    const decrypted = AES.decrypt(result.key, this.encryptionKey);
    return decrypted.toString(enc.Utf8);
  }

  validateKey(service: string, key: string): boolean {
    const configs: Record<string, APIKeyConfig> = {
      'google-ai': {
        service: 'google-ai',
        format: /^AIza[0-9A-Za-z\-_]{35}$/,
        minLength: 39,
        maxLength: 39
      },
      'openai': {
        service: 'openai',
        format: /^sk-[a-zA-Z0-9]{48}$/,
        minLength: 51,
        maxLength: 51
      }
    };

    const config = configs[service];
    if (!config) return false;

    return config.format.test(key) &&
           key.length >= config.minLength &&
           key.length <= config.maxLength;
  }

  maskKey(key: string): string {
    if (key.length <= 4) return '••••';
    return '••••••••' + key.slice(-4);
  }

  async rotateKey(service: string, newKey: string): Promise<boolean> {
    // Validate new key
    if (!this.validateKey(service, newKey)) {
      throw new Error(`Invalid API key format for ${service}`);
    }

    // Set new key
    await this.setKey(service, newKey);

    // Log rotation event
    logger.info(`API key rotated for service: ${service}`);

    return true;
  }
}
```

### Content Security Policy

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: https:;
  media-src 'self' blob: https:;
  connect-src 'self' http://localhost:8123 https://generativelanguage.googleapis.com;
  frame-src 'self' blob:;
">
```

**Note**: `unsafe-inline` and `unsafe-eval` are required for iframe-based slide rendering. Consider using nonces for production.



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Essential Data Load Time

*For any* application startup, the Content_Loader SHALL complete loading essential data within 2 seconds.

**Validates: Requirements 1.1**

### Property 2: Bible Lazy Loading Initiation

*For any* application state after startup, when the application has been idle for 500 milliseconds, the Content_Loader SHALL begin loading bible_content.js in chunks of 5 books per chunk.

**Validates: Requirements 1.2**

### Property 3: Song Lazy Loading Initiation

*For any* application state after startup, when the application has been idle for 500 milliseconds, the Content_Loader SHALL begin loading song_content.js in chunks of 50 songs per chunk.

**Validates: Requirements 1.3**

### Property 4: On-Demand Bible Book Load Time

*For any* Bible book request where the book is not already loaded, the Content_Loader SHALL load the requested book within 1 second.

**Validates: Requirements 1.4**

### Property 5: On-Demand Song Load Time

*For any* song request where the song is not already loaded, the Content_Loader SHALL load the requested song within 500 milliseconds.

**Validates: Requirements 1.5**

### Property 6: Cached Bible Book Retrieval Time

*For any* Bible book that is already loaded in memory, the Content_Loader SHALL return the cached content within 50 milliseconds.

**Validates: Requirements 1.6**

### Property 7: Cached Song Retrieval Time

*For any* song that is already loaded in memory, the Content_Loader SHALL return the cached content within 50 milliseconds.

**Validates: Requirements 1.7**

### Property 8: Bible Book Load Failure Error Message

*For any* Bible book where loading fails after 3 retry attempts, the Content_Loader SHALL display an error message that contains the book name and suggests checking network connectivity.

**Validates: Requirements 1.8**

### Property 9: Content Load Completion Indicator

*For any* set of Bible and song content, when all content has been loaded, the Application SHALL display a ready indicator visible to the user.

**Validates: Requirements 1.9**

### Property 10: Chunk Load Retry Logic

*For any* content chunk where loading fails, the Content_Loader SHALL retry loading that chunk exactly 3 times before displaying an error.

**Validates: Requirements 1.10**

### Property 11: Core Bundle Load Time

*For any* application initial load, the Module_System SHALL load only the core bundle within 30 seconds.

**Validates: Requirements 2.4**

### Property 12: Dynamic Feature Import Time

*For any* feature access by clicking its UI control or navigating to its panel, the Module_System SHALL dynamically import the feature bundle within 10 seconds.

**Validates: Requirements 2.5**

### Property 13: Global Namespace Isolation

*For any* module load, the Module_System SHALL not add any undocumented properties to the window object.

**Validates: Requirements 2.7**

### Property 14: Dynamic Import Failure Error Message

*For any* feature where dynamic import fails after 10 seconds, the Module_System SHALL display an error message that contains the feature name and suggests checking network connectivity.

**Validates: Requirements 2.8**

### Property 15: Dynamic Import Retry Logic

*For any* feature import failure, the Module_System SHALL retry the import exactly 2 additional times before displaying the error message.

**Validates: Requirements 2.9**

### Property 16: Large Presentation Storage

*For any* presentation larger than 8MB, the Storage_Manager SHALL successfully store the presentation.

**Validates: Requirements 3.2**

### Property 17: IndexedDB Fallback Behavior

*For any* application state where IndexedDB is unavailable, the Storage_Manager SHALL fall back to localStorage and display a warning.

**Validates: Requirements 3.5**

### Property 18: Storage Migration Round-Trip

*For any* slide data stored in localStorage, the Storage_Manager SHALL successfully migrate the data to IndexedDB, and the migrated data SHALL be equivalent to the original data.

**Validates: Requirements 3.6**

### Property 19: Storage Quota Exceeded Error

*For any* storage operation where the quota is exceeded, the Storage_Manager SHALL display a clear error message.

**Validates: Requirements 3.7**

### Property 20: Virtual Scrolling Window Size

*For any* scroll position, the Slide_Renderer SHALL render only the visible thumbnails plus a buffer zone of 5 thumbnails in each direction.

**Validates: Requirements 4.2**

### Property 21: Thumbnail Render Time

*For any* thumbnail scrolling into view, the Slide_Renderer SHALL render it within 100 milliseconds.

**Validates: Requirements 4.3**

### Property 22: Iframe Element Reuse

*For any* thumbnail going off-screen, the Slide_Renderer SHALL reuse the iframe element for a new thumbnail.

**Validates: Requirements 4.4**

### Property 23: Concurrent Render Limit

*For any* render queue state, the Slide_Renderer SHALL limit concurrent thumbnail renders to a maximum of 3 at a time.

**Validates: Requirements 4.5**

### Property 24: Fast Scroll Debouncing

*For any* scrolling at a rate exceeding 10 thumbnails per second, the Slide_Renderer SHALL debounce render requests by 150 milliseconds.

**Validates: Requirements 4.6**

### Property 25: Thumbnail Cache Size and LRU Eviction

*For any* sequence of thumbnail renders, the Slide_Renderer SHALL maintain a cache of up to 50 rendered thumbnails and SHALL evict the least recently used thumbnail when the cache is full.

**Validates: Requirements 4.7**

### Property 26: Cached Thumbnail Render Time

*For any* cached thumbnail, the Slide_Renderer SHALL render it within 16 milliseconds.

**Validates: Requirements 4.8**

### Property 27: Render Queue Prioritization

*For any* render queue exceeding 10 pending thumbnails, the Slide_Renderer SHALL prioritize visible thumbnails over buffer zone thumbnails.

**Validates: Requirements 4.9**

### Property 28: Search Debounce Delay

*For any* keystroke sequence in a search field, the Search_Handler SHALL wait 300 milliseconds after the last keystroke before executing the search.

**Validates: Requirements 5.1**

### Property 29: Search Debounce Cancellation

*For any* rapid keystroke sequence where new input arrives before the 300ms delay expires, the Search_Handler SHALL cancel the pending search and restart the 300ms timer.

**Validates: Requirements 5.2**

### Property 30: Search Result Display Time

*For any* search results that are ready, the Search_Handler SHALL display them within 50 milliseconds.

**Validates: Requirements 5.3**

### Property 31: Search Loading Indicator

*For any* search operation exceeding 200 milliseconds, the Search_Handler SHALL display a loading indicator.

**Validates: Requirements 5.4**

### Property 32: Initial Search Result Limit

*For any* search with more than 100 results, the Search_Handler SHALL limit the initial display to 100 items.

**Validates: Requirements 5.5**

### Property 33: Search Result Infinite Scroll

*For any* scroll position within 10 items of the end of search results, the Search_Handler SHALL load the next 50 results.

**Validates: Requirements 5.6**

### Property 34: Search Result Highlighting

*For any* search results, the Search_Handler SHALL highlight matching text by wrapping it in a span element with a distinct background color.

**Validates: Requirements 5.7**

### Property 35: Empty Search Display

*For any* empty search field, the Search_Handler SHALL display all available items up to the 100-item limit.

**Validates: Requirements 5.8**

### Property 36: Search Loading Indicator Removal

*For any* search completion, the Search_Handler SHALL remove the loading indicator within 50 milliseconds.

**Validates: Requirements 5.9**

### Property 37: Search Timeout

*For any* search operation exceeding 5 seconds, the Search_Handler SHALL cancel the search and display an error message indicating search timeout.

**Validates: Requirements 5.10**

### Property 38: State Manager Encapsulation

*For any* module attempting to access State_Manager internal state without using provided getter or setter methods, the State_Manager SHALL reject the access and maintain the current state unchanged.

**Validates: Requirements 6.4**

### Property 39: State Change Event Emission

*For any* state change, the State_Manager SHALL emit an event containing the state property name and the new value.

**Validates: Requirements 6.5**

### Property 40: Synchronous State Change Notification

*For any* state change, the State_Manager SHALL notify all subscribed components within the same execution cycle.

**Validates: Requirements 6.6**

### Property 41: State Change Validation

*For any* state change request, the State_Manager SHALL validate the change against defined constraints before applying it.

**Validates: Requirements 6.7**

### Property 42: State Validation Failure Handling

*For any* invalid state change request, the State_Manager SHALL reject the change, maintain the previous state value, and return an indication that validation failed.

**Validates: Requirements 6.8**

### Property 43: State History Size Limit

*For any* sequence of more than 50 state changes, the State_Manager SHALL maintain a history of exactly the most recent 50 state changes.

**Validates: Requirements 6.9**

### Property 44: State Undo Round-Trip

*For any* state change followed by an undo request, the State_Manager SHALL restore the state to the value it had before the change.

**Validates: Requirements 6.10**

### Property 45: State Redo Round-Trip

*For any* undo followed by a redo request, the State_Manager SHALL restore the state to the value it had after the original change.

**Validates: Requirements 6.11**

### Property 46: Error Catching Coverage

*For any* error originating from user interactions, data operations, or external service calls, the Application SHALL catch the error.

**Validates: Requirements 7.1**

### Property 47: Error Logging Completeness

*For any* error that occurs, the Application SHALL log the error type, timestamp, stack trace, and user action that triggered the error.

**Validates: Requirements 7.2**

### Property 48: Error Display Timing and Content

*For any* error that occurs, the Application SHALL display an error message within 2 seconds containing the error type and affected operation.

**Validates: Requirements 7.3**

### Property 49: Error Categorization

*For any* error that occurs, the Application SHALL categorize it as either recoverable (allowing continued operation) or fatal (preventing further use).

**Validates: Requirements 7.4**

### Property 50: Recoverable Error Instructions

*For any* recoverable error, the Application SHALL display actionable instructions describing the next step the user can take.

**Validates: Requirements 7.5**

### Property 51: Fatal Error Options

*For any* fatal error, the Application SHALL display options to reload the application or reset to default state.

**Validates: Requirements 7.6**

### Property 52: Error Report Transmission

*For any* error when error reporting is configured, the Application SHALL send an error report containing error type, timestamp, and stack trace to the configured logging service.

**Validates: Requirements 7.7**

### Property 53: HTML Sanitization

*For any* HTML content input by a user, the Application SHALL remove all script tags, event handler attributes, and javascript: protocol URLs.

**Validates: Requirements 9.1**

### Property 54: HTML Sanitization Error Handling

*For any* HTML input containing malicious content, the Application SHALL reject the input and display an error message indicating invalid HTML content.

**Validates: Requirements 9.2**

### Property 55: File Path Character Validation

*For any* file path input by a user, the Application SHALL validate that the path contains only alphanumeric characters, hyphens, underscores, forward slashes, and periods.

**Validates: Requirements 9.3**

### Property 56: File Path Security Validation

*For any* file path containing parent directory references (..) or absolute path indicators, the Application SHALL reject the input and display an error message indicating invalid path format.

**Validates: Requirements 9.4**

### Property 57: URL Scheme and Length Validation

*For any* URL input by a user, the Application SHALL validate that it uses http or https scheme and does not exceed 2048 characters in length.

**Validates: Requirements 9.5**

### Property 58: URL Validation Error Handling

*For any* URL that fails validation, the Application SHALL reject the input and display an error message indicating invalid URL format.

**Validates: Requirements 9.6**

### Property 59: HTML Entity Escaping

*For any* user-provided content being displayed, the Application SHALL convert special characters (<, >, &, ", ') to their HTML entity equivalents.

**Validates: Requirements 9.7**

### Property 60: API Response Validation

*For any* API response received, the Application SHALL validate that the response contains expected data types and required fields.

**Validates: Requirements 9.8**

### Property 61: API Response Validation Failure Handling

*For any* API response that fails validation, the Application SHALL discard the response and display an error message indicating data retrieval failure.

**Validates: Requirements 9.9**

### Property 62: Validation Error Display Timing

*For any* validation failure, the Application SHALL display an error message within 100 milliseconds that identifies the input field and validation rule violated.

**Validates: Requirements 9.10**

### Property 63: Validation Error Logging

*For any* validation failure, the Application SHALL log the timestamp, input field identifier, validation rule violated, and a sanitized input sample not exceeding 100 characters.

**Validates: Requirements 9.11**

### Property 64: API Key Secure Storage

*For any* API key, the API_Key_Manager SHALL store it in browser secure storage with AES-256 encryption.

**Validates: Requirements 10.1, 10.2, 10.4**

### Property 65: API Key Masking

*For any* API key being displayed, the API_Key_Manager SHALL mask all but the last 4 characters.

**Validates: Requirements 10.3**

### Property 66: API Key Format Validation

*For any* API key, the API_Key_Manager SHALL validate the key format before accepting it.

**Validates: Requirements 10.5**

### Property 67: Event Bus Asynchronous Notification

*For any* event published to the EventBus, all subscribed handlers SHALL be notified asynchronously.

**Validates: Requirements 14.4**

### Property 68: DOM Update Batching

*For any* sequence of DOM operations, the DOM_Manager SHALL batch DOM reads separately from DOM writes to minimize layout thrashing.

**Validates: Requirements 23.1**

### Property 69: Memory Leak Prevention - Event Listeners

*For any* component that is destroyed, the Application SHALL remove all event listeners associated with that component.

**Validates: Requirements 26.1**

### Property 70: Memory Leak Prevention - Timers

*For any* timer or interval that is no longer needed, the Application SHALL clear it.

**Validates: Requirements 26.2**



## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)

**Goals**: Establish build pipeline, module system, and TypeScript integration

**Tasks**:
1. Set up Vite build configuration
2. Configure TypeScript with strict mode
3. Create module structure (core, features, ui, utils, types)
4. Implement dependency injection container
5. Set up testing infrastructure (Jest, Testing Library)
6. Configure linting and formatting (ESLint, Prettier)

**Deliverables**:
- Working build pipeline with dev and production modes
- TypeScript compilation with no errors
- Module structure with clear boundaries
- DI container with basic functionality
- Test framework ready for use

### Phase 2: Core Refactoring (Weeks 4-7)

**Goals**: Refactor core application logic with proper architecture

**Tasks**:
1. Implement StateManager with validation and history
2. Implement EventBus for component communication
3. Refactor slide management into SlideController
4. Implement StorageManager with IndexedDB and localStorage fallback
5. Implement ContentLoader with lazy loading
6. Add comprehensive unit tests for core components

**Deliverables**:
- StateManager with undo/redo functionality
- EventBus with subscription management
- SlideController with CRUD operations
- StorageManager supporting >8MB presentations
- ContentLoader with chunked loading
- 70%+ test coverage for core modules

### Phase 3: Performance Optimization (Weeks 8-10)

**Goals**: Implement performance improvements for rendering and search

**Tasks**:
1. Implement virtual scrolling for thumbnails
2. Implement thumbnail caching with LRU eviction
3. Implement debounced search with progressive loading
4. Optimize DOM manipulation with batching
5. Implement performance monitoring
6. Add performance tests

**Deliverables**:
- Virtual scrolling with 60fps performance
- Thumbnail cache with <16ms cache hits
- Debounced search with <300ms response
- Performance monitoring dashboard
- Performance benchmarks and tests

### Phase 4: Security and Validation (Weeks 11-12)

**Goals**: Implement security improvements and input validation

**Tasks**:
1. Implement HTML sanitization with DOMPurify
2. Implement URL and file path validation
3. Implement API key manager with encryption
4. Add input validation to all user inputs
5. Implement error handling with categorization
6. Add security tests

**Deliverables**:
- HTML sanitization preventing XSS
- Comprehensive input validation
- Secure API key storage
- Error handling with user-friendly messages
- Security test suite

### Phase 5: Feature Modules (Weeks 13-15)

**Goals**: Refactor feature modules with code splitting

**Tasks**:
1. Refactor Bible feature into separate module
2. Refactor Song feature into separate module
3. Refactor AI feature into separate module
4. Implement dynamic imports for features
5. Optimize bundle sizes
6. Add integration tests for features

**Deliverables**:
- Bible module with dynamic loading
- Song module with dynamic loading
- AI module with dynamic loading
- Core bundle <100KB, feature bundles <50KB each
- Integration tests for all features

### Phase 6: Progressive Enhancement (Weeks 16-18)

**Goals**: Add PWA features, accessibility, and i18n

**Tasks**:
1. Implement service worker for offline support
2. Add PWA manifest and install prompt
3. Implement accessibility features (keyboard nav, ARIA, screen reader)
4. Implement i18n system with Tamil and English
5. Add accessibility and i18n tests
6. Conduct accessibility audit

**Deliverables**:
- Service worker with offline functionality
- PWA installable on mobile devices
- WCAG 2.1 Level AA compliance
- i18n system with 2 languages
- Accessibility audit report

### Phase 7: Android Integration (Weeks 19-20)

**Goals**: Enhance Android native integration

**Tasks**:
1. Implement native file picker
2. Implement native share functionality
3. Implement back button handling
4. Optimize WebView settings
5. Add native splash screen
6. Test on Android devices

**Deliverables**:
- Native Android features integrated
- Optimized WebView performance
- Tested on multiple Android versions
- Android-specific documentation

### Phase 8: Documentation and Polish (Weeks 21-22)

**Goals**: Complete documentation and final polish

**Tasks**:
1. Write comprehensive API documentation
2. Write architecture documentation
3. Write setup and deployment guides
4. Write developer onboarding guide
5. Conduct final testing and bug fixes
6. Performance optimization pass

**Deliverables**:
- Complete API documentation
- Architecture documentation (ARCHITECTURE.md)
- Setup and deployment guides
- Developer onboarding guide
- Bug-free application ready for production

### Migration Strategy

**Incremental Migration Approach**:
1. **Parallel Development**: Build new architecture alongside existing code
2. **Feature Flags**: Use feature flags to toggle between old and new implementations
3. **Gradual Rollout**: Migrate features one at a time, starting with least critical
4. **Rollback Plan**: Maintain ability to rollback to old implementation if issues arise
5. **User Testing**: Conduct user testing at each phase to ensure no functionality loss

**Data Migration**:
1. **localStorage to IndexedDB**: Automatic one-time migration on first load
2. **Slide Format**: Maintain backward compatibility with existing slide format
3. **Backup**: Create backup of localStorage data before migration
4. **Validation**: Validate migrated data integrity

**Rollout Plan**:
1. **Alpha**: Internal testing with development team (2 weeks)
2. **Beta**: Limited release to trusted users (2 weeks)
3. **Staged Rollout**: Gradual rollout to all users (25%, 50%, 75%, 100%)
4. **Monitoring**: Monitor error rates and performance metrics during rollout
5. **Rollback Trigger**: Automatic rollback if error rate exceeds 5%

## Success Metrics

### Performance Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Initial Load Time | ~8s | <2s | Time to interactive |
| Bible Book Load | ~3s | <1s | Time to content display |
| Song Load | ~2s | <500ms | Time to content display |
| Thumbnail Render | ~200ms | <100ms | Time to visible thumbnail |
| Cached Thumbnail | ~50ms | <16ms | Time to cached thumbnail |
| Search Response | ~500ms | <300ms | Time to first result |
| Frame Rate (Scrolling) | ~30fps | 60fps | requestAnimationFrame |
| Memory Usage | Growing | Stable | performance.memory |

### Code Quality Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Test Coverage | 0% | 70% | Jest coverage report |
| Code Duplication | ~15% | <5% | jscpd analysis |
| TypeScript Coverage | 0% | 100% | TypeScript compiler |
| Linting Errors | Many | 0 | ESLint report |
| File Size | 6,174 lines | <300 lines/file | Line count |
| Bundle Size | ~500KB | <150KB (initial) | Webpack bundle analyzer |

### User Experience Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Accessibility Score | >90 | Lighthouse audit |
| PWA Score | >90 | Lighthouse audit |
| Error Rate | <1% | Error logging service |
| Crash Rate | <0.1% | Error logging service |
| User Satisfaction | >4.5/5 | User surveys |

## Risks and Mitigation

### Technical Risks

**Risk 1: Performance Regression**
- **Impact**: High
- **Probability**: Medium
- **Mitigation**: 
  - Comprehensive performance testing before each release
  - Performance monitoring in production
  - Rollback plan if performance degrades

**Risk 2: Data Loss During Migration**
- **Impact**: Critical
- **Probability**: Low
- **Mitigation**:
  - Automatic backup before migration
  - Validation of migrated data
  - Rollback to localStorage if migration fails
  - User notification of migration status

**Risk 3: Breaking Changes**
- **Impact**: High
- **Probability**: Medium
- **Mitigation**:
  - Maintain backward compatibility where possible
  - Comprehensive integration testing
  - Beta testing with real users
  - Staged rollout with monitoring

**Risk 4: Browser Compatibility**
- **Impact**: Medium
- **Probability**: Low
- **Mitigation**:
  - Target ES2015 for broad compatibility
  - Polyfills for missing features
  - Testing on multiple browsers
  - Graceful degradation for unsupported features

### Project Risks

**Risk 5: Scope Creep**
- **Impact**: Medium
- **Probability**: High
- **Mitigation**:
  - Clear requirements and acceptance criteria
  - Regular scope reviews
  - Prioritization of must-have vs nice-to-have features
  - Time-boxed phases

**Risk 6: Resource Constraints**
- **Impact**: Medium
- **Probability**: Medium
- **Mitigation**:
  - Realistic timeline with buffer
  - Prioritization of critical features
  - Incremental delivery approach
  - Clear communication of trade-offs

## Conclusion

This design document outlines a comprehensive refactoring strategy for the Bible Presenter application that addresses critical performance, code quality, and architectural issues. The refactoring will transform the application from a monolithic, hard-to-maintain codebase into a modular, type-safe, well-tested system that follows modern development best practices.

Key improvements include:
- **Performance**: Sub-2-second load times, 60fps scrolling, efficient memory usage
- **Architecture**: Clear separation of concerns, dependency injection, event-driven communication
- **Code Quality**: TypeScript type safety, 70%+ test coverage, <5% code duplication
- **Security**: Input validation, HTML sanitization, secure API key storage
- **User Experience**: PWA features, offline support, accessibility compliance, internationalization

The implementation will follow an incremental migration approach over 22 weeks, with careful attention to data migration, backward compatibility, and user testing. Success will be measured through performance metrics, code quality metrics, and user experience metrics, with clear rollback plans if issues arise.

This refactoring will establish a solid foundation for future development, making the application easier to maintain, extend, and scale while providing users with a faster, more reliable, and more accessible experience.

