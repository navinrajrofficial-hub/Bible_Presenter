# Implementation Plan: Code Quality and Performance Improvements

## Overview

This implementation plan transforms the Bible Presenter application from a monolithic JavaScript codebase into a modular, type-safe, well-tested TypeScript application. The refactoring addresses critical performance bottlenecks, improves code quality, and establishes modern development practices while preserving all existing functionality.

**Key Improvements:**
- Modular architecture with ES6 modules and dependency injection
- TypeScript for type safety and better developer experience
- Performance optimizations (lazy loading, virtual scrolling, debouncing)
- Secure storage with IndexedDB and encrypted API key management
- Comprehensive testing infrastructure (unit, integration, E2E)
- Build pipeline with code splitting and optimization

## Tasks

- [-] 1. Set up project infrastructure and build pipeline
  - [x] 1.1 Initialize TypeScript configuration and build tools
    - Create `tsconfig.json` with strict type checking enabled
    - Set up Vite as the build tool with TypeScript support
    - Configure build scripts for development, staging, and production
    - Set up source maps for debugging
    - _Requirements: 2.2, 17.1, 17.2, 17.3, 17.4, 18.1_

  - [ ] 1.2 Create project directory structure and module organization
    - Create `src/` directory with subdirectories: `core/`, `data/`, `features/`, `ui/`, `utils/`, `types/`
    - Set up module index files for clean imports
    - Configure module resolution in TypeScript
    - _Requirements: 2.1, 16.1, 16.4, 16.5_

  - [-] 1.3 Set up testing infrastructure
    - Install and configure Jest with TypeScript support
    - Install Testing Library for component testing
    - Install Playwright for E2E testing
    - Create test directory structure (`tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/fixtures/`)
    - Configure test scripts and coverage reporting
    - Set up pre-push git hook to run tests
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.9_


- [ ] 2. Implement core infrastructure components
  - [ ] 2.1 Create TypeScript type definitions
    - Define `Slide`, `BibleBook`, `Song`, and `AppConfig` interfaces in `src/types/`
    - Define error types and enums (`ErrorType`, `ErrorSeverity`, `LogLevel`)
    - Export all types from `src/types/index.ts`
    - _Requirements: 18.1, 18.2, 18.6_

  - [ ] 2.2 Implement StateManager with history and validation
    - Create `IStateManager` interface in `src/core/state/StateManager.ts`
    - Implement state getter/setter methods with validation
    - Implement state change event emission
    - Implement undo/redo with 50-item history using LRU eviction
    - Implement state immutability with deep cloning
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11_

  - [ ]* 2.3 Write unit tests for StateManager
    - Test state get/set operations
    - Test validation and rejection of invalid state
    - Test event emission on state changes
    - Test undo/redo functionality
    - Test history limit enforcement
    - _Requirements: 6.1-6.11, 20.1_

  - [ ] 2.4 Implement EventBus for component communication
    - Create `IEventBus` interface in `src/core/events/EventBus.ts`
    - Implement publish/subscribe pattern with async notification
    - Implement weak reference tracking to prevent memory leaks
    - Implement event filtering by type and payload
    - Add development mode logging
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [ ]* 2.5 Write unit tests for EventBus
    - Test event publishing and subscription
    - Test async event notification
    - Test event filtering
    - Test unsubscribe and memory leak prevention
    - _Requirements: 14.1-14.7, 20.1_


  - [ ] 2.6 Implement Dependency Injection Container
    - Create `IDIContainer` interface in `src/core/di/Container.ts`
    - Implement service registration with singleton/transient support
    - Implement service resolution with constructor injection
    - Implement circular dependency detection
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 12.7_

  - [ ]* 2.7 Write unit tests for DI Container
    - Test service registration and resolution
    - Test singleton vs transient lifetimes
    - Test circular dependency detection
    - Test mock injection for testing
    - _Requirements: 12.1-12.7, 20.1_

  - [ ] 2.8 Implement Logger with structured logging
    - Create `ILogger` interface in `src/utils/logger.ts`
    - Implement log levels (DEBUG, INFO, WARN, ERROR) with filtering
    - Add ISO 8601 timestamps with milliseconds
    - Implement structured context logging
    - Add remote logging for ERROR level
    - Implement rate limiting (max 100 logs/minute)
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7_

  - [ ]* 2.9 Write unit tests for Logger
    - Test log level filtering
    - Test timestamp formatting
    - Test context inclusion
    - Test rate limiting
    - _Requirements: 25.1-25.7, 20.1_

  - [ ] 2.10 Implement Configuration Management
    - Create `AppConfig` interface in `src/core/config/Config.ts`
    - Implement environment-specific configuration loading (dev, staging, prod)
    - Implement configuration validation at startup
    - Implement default values for optional settings
    - Support runtime configuration updates
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7_


- [ ] 3. Checkpoint - Verify core infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement data access layer
  - [ ] 4.1 Implement StorageManager with IndexedDB
    - Create `IStorageManager` interface in `src/data/storage/StorageManager.ts`
    - Implement IndexedDB adapter for slide storage (supports >8MB)
    - Implement localStorage fallback with warning
    - Implement efficient serialization/deserialization
    - Implement migration from localStorage to IndexedDB
    - Display clear error when storage quota exceeded
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 4.2 Write integration tests for StorageManager
    - Test IndexedDB save and load operations
    - Test localStorage fallback
    - Test migration from localStorage to IndexedDB
    - Test quota exceeded error handling
    - Test large presentation storage (>8MB)
    - _Requirements: 3.1-3.7, 20.2_

  - [ ] 4.3 Implement ContentLoader with lazy loading
    - Create `IContentLoader` interface in `src/data/loaders/ContentLoader.ts`
    - Implement initial load of essential data (<2 seconds)
    - Implement idle loading after 500ms (Bible: 5 books/chunk, Songs: 50 songs/chunk)
    - Implement on-demand loading (Bible book <1s, Song <500ms)
    - Implement LRU cache with 50-item limit (cache hit <50ms)
    - Implement retry logic with exponential backoff (3 attempts: 1s, 2s, 4s)
    - Display error message after failed retries
    - Display ready indicator when all content loaded
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

  - [ ]* 4.4 Write integration tests for ContentLoader
    - Test initial load completes within 2 seconds
    - Test idle loading triggers after 500ms
    - Test on-demand loading for Bible books and songs
    - Test cache hit performance (<50ms)
    - Test retry logic with exponential backoff
    - Test error display after failed retries
    - _Requirements: 1.1-1.10, 20.2_


  - [ ] 4.5 Implement LRU Cache for content and thumbnails
    - Create `LRUCache` class in `src/data/cache/LRUCache.ts`
    - Implement cache with configurable size limit
    - Implement LRU eviction policy
    - Implement cache hit/miss tracking
    - _Requirements: 1.6, 1.7, 4.8, 26.4_

  - [ ]* 4.6 Write unit tests for LRU Cache
    - Test cache insertion and retrieval
    - Test LRU eviction when limit reached
    - Test cache hit/miss tracking
    - _Requirements: 1.6, 1.7, 20.1_

- [ ] 5. Implement validation and security layer
  - [ ] 5.1 Implement ValidationService with input sanitization
    - Create `IValidationService` interface in `src/utils/validation.ts`
    - Implement HTML validation (remove `<script>`, event handlers, `javascript:` URLs)
    - Implement file path validation (alphanumeric, `-`, `_`, `/`, `.` only; reject `..`)
    - Implement URL validation (http/https only, max 2048 chars)
    - Implement HTML entity escaping for special characters
    - Implement API response validation
    - Display validation errors within 100ms with field and rule info
    - Log validation failures with timestamp, field, rule, and sanitized sample
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11_

  - [ ]* 5.2 Write unit tests for ValidationService
    - Test HTML sanitization (script tags, event handlers, javascript: URLs)
    - Test file path validation (valid paths, reject .., reject absolute paths)
    - Test URL validation (http/https only, length limit)
    - Test HTML entity escaping
    - Test API response validation
    - Test error display timing and content
    - _Requirements: 9.1-9.11, 20.1_


  - [ ] 5.3 Implement APIKeyManager with secure storage
    - Create `IAPIKeyManager` interface in `src/core/config/APIKeyManager.ts`
    - Implement secure storage in IndexedDB with AES-256 encryption
    - Implement key masking (show only last 4 characters)
    - Implement key format validation before acceptance
    - Implement secure key rotation mechanism
    - Never store keys in source code or version control
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ]* 5.4 Write unit tests for APIKeyManager
    - Test key encryption and storage
    - Test key masking display
    - Test key format validation
    - Test key rotation
    - _Requirements: 10.1-10.7, 20.1_

- [ ] 6. Checkpoint - Verify data and security layers
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement error handling system
  - [ ] 7.1 Implement ErrorHandler with classification and reporting
    - Create `IErrorHandler` interface in `src/core/errors/ErrorHandler.ts`
    - Define `AppError` class with type, severity, context, timestamp, stackTrace
    - Implement error classification (recoverable vs fatal)
    - Implement error logging with full context
    - Display recoverable errors as toast (5s auto-dismiss) with actionable instructions
    - Display fatal errors as modal with reload/reset options
    - Send error reports to logging service (if configured)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 7.2 Write unit tests for ErrorHandler
    - Test error classification (recoverable vs fatal)
    - Test error logging with context
    - Test error display (toast vs modal)
    - Test error reporting to logging service
    - _Requirements: 7.1-7.7, 20.1_


  - [ ] 7.3 Implement retry logic with exponential backoff
    - Create retry utility in `src/utils/retry.ts`
    - Implement exponential backoff (immediate, 1s, 2s, 4s)
    - Support configurable retry attempts
    - Support timeout for async operations
    - _Requirements: 15.6, 15.7_

  - [ ]* 7.4 Write unit tests for retry logic
    - Test exponential backoff timing
    - Test retry attempt limits
    - Test timeout handling
    - _Requirements: 15.6, 15.7, 20.1_

- [ ] 8. Implement UI layer components
  - [ ] 8.1 Implement DOMManager with efficient DOM operations
    - Create `IDOMManager` interface in `src/ui/dom/DOMManager.ts`
    - Implement batched DOM reads and writes to minimize layout thrashing
    - Implement DocumentFragment for multiple insertions
    - Implement DOM element caching
    - Use CSS classes instead of inline styles
    - Use requestAnimationFrame for animations
    - Measure and log DOM operation performance
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7_

  - [ ]* 8.2 Write unit tests for DOMManager
    - Test batched read/write operations
    - Test DocumentFragment usage
    - Test element caching
    - Test CSS class manipulation
    - _Requirements: 13.2-13.5, 23.1-23.7, 20.1_

  - [ ] 8.3 Integrate Virtual DOM library (Preact)
    - Install and configure Preact
    - Create Virtual DOM wrapper in `src/ui/dom/VirtualDOM.ts`
    - Implement minimal DOM diff computation
    - Implement batched DOM updates
    - Prioritize visible UI updates over off-screen updates
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_


  - [ ] 8.4 Implement reusable UI components
    - Create Modal component in `src/ui/components/Modal.ts`
    - Create Toast component in `src/ui/components/Toast.ts`
    - Create Dropdown component in `src/ui/components/Dropdown.ts`
    - Implement keyboard navigation for all components
    - Add ARIA labels for accessibility
    - _Requirements: 28.1, 28.2, 28.3_

  - [ ]* 8.5 Write unit tests for UI components
    - Test Modal open/close functionality
    - Test Toast auto-dismiss timing
    - Test Dropdown selection
    - Test keyboard navigation
    - Test ARIA labels
    - _Requirements: 28.1-28.3, 20.1_

- [ ] 9. Implement slide rendering with virtual scrolling
  - [ ] 9.1 Implement SlideRenderer with virtual scrolling
    - Create `ISlideRenderer` interface in `src/features/slides/SlideRenderer.ts`
    - Implement virtual scrolling (render visible + 5-item buffer)
    - Implement render queue with max 3 concurrent renders
    - Prioritize visible thumbnails over buffer zone
    - Implement debouncing (150ms when scrolling >10 thumbnails/second)
    - Implement LRU cache for 50 rendered thumbnails (16ms cache hit)
    - Implement iframe reuse for off-screen thumbnails
    - Render thumbnails within 100ms when scrolling into view
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [ ]* 9.2 Write integration tests for SlideRenderer
    - Test virtual scrolling (only visible + buffer rendered)
    - Test render queue limits (max 3 concurrent)
    - Test debouncing during fast scrolling
    - Test cache hit performance (<16ms)
    - Test iframe reuse
    - Test render timing (<100ms)
    - _Requirements: 4.1-4.9, 20.2_


  - [ ] 9.3 Implement ThumbnailManager
    - Create `ThumbnailManager` class in `src/features/slides/ThumbnailManager.ts`
    - Implement thumbnail generation and caching
    - Implement lazy loading for off-screen thumbnails
    - Integrate with SlideRenderer for virtual scrolling
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 9.4 Write unit tests for ThumbnailManager
    - Test thumbnail generation
    - Test caching behavior
    - Test lazy loading
    - _Requirements: 4.1-4.3, 20.1_

- [ ] 10. Implement search functionality with debouncing
  - [ ] 10.1 Implement SearchHandler with debouncing
    - Create `ISearchHandler` interface in `src/features/search/SearchHandler.ts`
    - Implement 300ms debounce after last keystroke
    - Cancel pending search if new input arrives
    - Display results within 50ms when ready
    - Show loading indicator after 200ms
    - Limit initial results to 100 items
    - Load next 50 results when scrolling near end
    - Highlight matching text with distinct background
    - Display all items (up to 100) when search field is empty
    - Cancel search after 5 seconds with timeout error
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [ ]* 10.2 Write integration tests for SearchHandler
    - Test debouncing (300ms delay)
    - Test search cancellation on new input
    - Test result display timing (<50ms)
    - Test loading indicator (after 200ms)
    - Test progressive loading (100 initial, 50 more)
    - Test match highlighting
    - Test timeout handling (5 seconds)
    - _Requirements: 5.1-5.10, 20.2_


- [ ] 11. Checkpoint - Verify UI and rendering layers
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implement feature modules
  - [ ] 12.1 Implement SlideController for slide management
    - Create `SlideController` class in `src/features/slides/SlideController.ts`
    - Implement slide CRUD operations (create, read, update, delete)
    - Integrate with StateManager for state management
    - Integrate with StorageManager for persistence
    - Integrate with EventBus for component communication
    - Emit events on slide changes
    - _Requirements: 6.1-6.11, 14.1-14.7, 3.1-3.7_

  - [ ]* 12.2 Write integration tests for SlideController
    - Test slide creation, update, deletion
    - Test state management integration
    - Test storage persistence
    - Test event emission on changes
    - _Requirements: 6.1-6.11, 14.1-14.7, 3.1-3.7, 20.2_

  - [ ] 12.2 Implement BibleController for Bible feature
    - Create `BibleController` class in `src/features/bible/BibleController.ts`
    - Implement Bible book loading via ContentLoader
    - Implement verse search functionality
    - Implement verse insertion into slides
    - Integrate with EventBus for communication
    - _Requirements: 1.1-1.10, 5.1-5.10, 14.1-14.7_

  - [ ] 12.3 Implement SongController for song feature
    - Create `SongController` class in `src/features/songs/SongController.ts`
    - Implement song loading via ContentLoader
    - Implement song search functionality
    - Implement song insertion into slides
    - Integrate with EventBus for communication
    - _Requirements: 1.1-1.10, 5.1-5.10, 14.1-14.7_


  - [ ] 12.4 Implement AIController for AI extraction feature
    - Create `AIController` class in `src/features/ai/AIController.ts`
    - Implement voice control integration
    - Implement AI verse extraction
    - Integrate with APIKeyManager for secure key access
    - Integrate with EventBus for communication
    - _Requirements: 10.1-10.7, 14.1-14.7_

  - [ ]* 12.5 Write integration tests for feature controllers
    - Test BibleController book loading and verse search
    - Test SongController song loading and search
    - Test AIController voice control and extraction
    - Test EventBus communication between controllers
    - _Requirements: 1.1-1.10, 5.1-5.10, 10.1-10.7, 14.1-14.7, 20.2_

- [ ] 13. Implement code splitting and module loading
  - [ ] 13.1 Configure code splitting in build pipeline
    - Update Vite configuration for manual chunks (core, bible, songs, ai, vendor)
    - Configure dynamic imports for feature modules
    - Set chunk size warning limit to 500KB
    - _Requirements: 2.2, 2.3, 2.4_

  - [ ] 13.2 Implement dynamic module loading
    - Create module loader in `src/core/ModuleLoader.ts`
    - Implement lazy loading for Bible, Song, and AI features
    - Load core bundle within 30 seconds on startup
    - Load feature bundles within 10 seconds when accessed
    - Implement retry logic (2 additional attempts) on import failure
    - Display error message on import failure with feature name
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [ ]* 13.3 Write integration tests for module loading
    - Test core bundle loads within 30 seconds
    - Test feature bundles load within 10 seconds
    - Test retry logic on import failure
    - Test error display on import failure
    - _Requirements: 2.4-2.9, 20.2_


- [ ] 14. Implement performance monitoring
  - [ ] 14.1 Implement PerformanceMonitor
    - Create `IPerformanceMonitor` interface in `src/utils/PerformanceMonitor.ts`
    - Measure page load time using Navigation Timing API
    - Measure time to interactive using Performance Observer
    - Measure frame rate during scrolling using requestAnimationFrame
    - Measure memory usage using performance.memory API
    - Implement function profiling using Performance API
    - Send metrics to analytics service
    - Alert developers when performance degrades
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7_

  - [ ]* 14.2 Write unit tests for PerformanceMonitor
    - Test page load measurement
    - Test time to interactive measurement
    - Test frame rate measurement
    - Test memory usage tracking
    - Test function profiling
    - _Requirements: 22.1-22.7, 20.1_

- [ ] 15. Implement memory leak prevention
  - [ ] 15.1 Implement memory management utilities
    - Create memory management utilities in `src/utils/memory.ts`
    - Implement event listener cleanup on component destruction
    - Implement timer/interval cleanup utilities
    - Implement circular reference breaking
    - Implement memory profiling in development mode
    - _Requirements: 26.1, 26.2, 26.3, 26.5, 26.7_

  - [ ]* 15.2 Write unit tests for memory management
    - Test event listener cleanup
    - Test timer/interval cleanup
    - Test circular reference breaking
    - _Requirements: 26.1-26.3, 20.1_


- [ ] 16. Refactor existing code to use new architecture
  - [ ] 16.1 Extract utility functions and eliminate code duplication
    - Identify duplicate code in existing `app.js`
    - Extract common patterns into shared utility functions in `src/utils/`
    - Create base classes for common component patterns
    - Use composition over inheritance
    - Document utilities with JSDoc comments and usage examples
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 30.1, 30.5_

  - [ ] 16.2 Replace global variables with StateManager
    - Identify all global variables in existing `app.js`
    - Migrate global state to StateManager
    - Update all references to use StateManager getter/setter methods
    - Remove global variable declarations
    - _Requirements: 6.1-6.11_

  - [ ] 16.3 Replace callbacks with async/await
    - Identify callback-based async code in existing `app.js`
    - Refactor to async/await pattern
    - Add try/catch blocks for error handling
    - Use Promise.all for concurrent operations
    - Chain dependent operations with await
    - Set timeouts for all async operations
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [ ] 16.4 Replace magic numbers with named constants
    - Identify all magic numbers in existing code
    - Define named constants in configuration
    - Group related constants into configuration objects
    - Document purpose of each constant
    - Update all references to use named constants
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_


  - [ ] 16.5 Migrate existing features to new module structure
    - Break down monolithic `app.js` into feature modules
    - Migrate slide management to `src/features/slides/`
    - Migrate Bible feature to `src/features/bible/`
    - Migrate song feature to `src/features/songs/`
    - Migrate AI feature to `src/features/ai/`
    - Ensure each file is under 300 lines
    - _Requirements: 2.1, 16.1, 16.2, 16.3, 16.4, 16.5_

  - [ ]* 16.6 Write integration tests for refactored features
    - Test slide management workflows
    - Test Bible verse search and insertion
    - Test song search and insertion
    - Test AI extraction
    - Verify all existing functionality preserved
    - _Requirements: 20.2_

- [ ] 17. Checkpoint - Verify refactored code
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Implement Progressive Web App features
  - [ ] 18.1 Implement Service Worker for offline support
    - Create service worker in `public/sw.js`
    - Register service worker in main application
    - Implement caching strategy for essential assets
    - Implement caching strategy for user data
    - Display cached content when offline
    - Sync cached changes when online
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.7_

  - [ ] 18.2 Implement PWA manifest and install prompt
    - Create `manifest.json` with app metadata
    - Add install prompt for PWA installation
    - Configure app icons and theme colors
    - _Requirements: 27.6_


  - [ ]* 18.3 Write E2E tests for PWA features
    - Test offline functionality
    - Test data sync when online
    - Test install prompt
    - _Requirements: 27.1-27.7, 20.3_

- [ ] 19. Implement accessibility features
  - [ ] 19.1 Implement keyboard navigation
    - Add keyboard shortcuts for all features
    - Implement tab navigation for all interactive elements
    - Add focus indicators for keyboard navigation
    - Test with keyboard-only navigation
    - _Requirements: 28.1, 28.6_

  - [ ] 19.2 Implement ARIA labels and screen reader support
    - Add ARIA labels to all interactive elements
    - Add ARIA roles for semantic structure
    - Test with screen readers (NVDA, JAWS)
    - _Requirements: 28.2, 28.3_

  - [ ] 19.3 Implement color contrast and zoom support
    - Ensure WCAG AA color contrast (4.5:1 for text)
    - Test browser zoom up to 200%
    - Ensure responsive layout at all zoom levels
    - _Requirements: 28.4, 28.5_

  - [ ]* 19.4 Run automated accessibility audits
    - Run Lighthouse accessibility audit
    - Run axe-core accessibility tests
    - Fix all critical and serious issues
    - _Requirements: 28.7, 20.3_

- [ ] 20. Implement internationalization support
  - [ ] 20.1 Extract UI strings to language files
    - Create language files in `src/i18n/` (en.json, ta.json)
    - Extract all UI strings from components
    - Implement language file loading
    - _Requirements: 29.1, 29.2_


  - [ ] 20.2 Implement language switching
    - Detect browser language preference
    - Implement language switcher UI
    - Load language files on demand
    - Support Tamil and English languages
    - _Requirements: 29.2, 29.3, 29.4, 29.7_

  - [ ] 20.3 Implement locale-specific formatting
    - Format dates according to locale
    - Format numbers according to locale
    - Support right-to-left text direction
    - _Requirements: 29.5, 29.6_

- [ ] 21. Enhance Android native integration
  - [ ] 21.1 Implement native Android features
    - Use native Android file picker instead of web input
    - Use native Android share functionality
    - Support Android back button navigation
    - Persist state across Android app lifecycle events
    - Use native Android notifications
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_

  - [ ] 21.2 Optimize WebView settings
    - Configure WebView for optimal performance
    - Enable hardware acceleration
    - Configure caching strategy
    - Implement native splash screen
    - _Requirements: 21.6, 21.7_

  - [ ]* 21.3 Write E2E tests for Android features
    - Test file picker integration
    - Test share functionality
    - Test back button navigation
    - Test state persistence
    - _Requirements: 21.1-21.7, 20.3_


- [ ] 22. Implement comprehensive documentation
  - [ ] 22.1 Document code with JSDoc comments
    - Add JSDoc comments to all public functions
    - Document parameters, return types, and examples
    - Generate API documentation from JSDoc comments
    - _Requirements: 30.1, 30.4, 30.6_

  - [ ] 22.2 Create architecture documentation
    - Create `ARCHITECTURE.md` documenting layered architecture
    - Document module organization and responsibilities
    - Document data flow and component communication
    - Create architecture diagrams
    - _Requirements: 11.9, 30.3_

  - [ ] 22.3 Create module README files
    - Create README.md for each major module
    - Document module purpose and usage
    - Provide code examples
    - _Requirements: 16.6, 30.2_

  - [ ] 22.4 Create setup and deployment guides
    - Create `SETUP.md` with development environment setup
    - Create `DEPLOYMENT.md` with deployment instructions
    - Document build process and configuration
    - _Requirements: 30.5_

- [ ] 23. Optimize build output
  - [ ] 23.1 Optimize assets for production
    - Compress images with imagemin
    - Generate WebP versions of images
    - Minify CSS with cssnano
    - Remove unused CSS with PurgeCSS
    - Subset custom fonts to required characters
    - _Requirements: 17.3, 17.6_


  - [ ] 23.2 Configure production build optimization
    - Enable minification with terser
    - Generate source maps for debugging
    - Configure tree shaking for dead code elimination
    - Optimize bundle size with compression
    - _Requirements: 17.2, 17.4, 17.5_

  - [ ] 23.3 Verify build performance
    - Ensure incremental builds complete within 30 seconds
    - Measure and optimize bundle sizes
    - Verify code splitting effectiveness
    - _Requirements: 17.7_

- [ ] 24. Write comprehensive end-to-end tests
  - [ ]* 24.1 Write E2E tests for slide management
    - Test create, edit, delete slide workflows
    - Test slide reordering
    - Test slide bookmarking
    - Test import/export presentations
    - _Requirements: 20.3_

  - [ ]* 24.2 Write E2E tests for Bible feature
    - Test Bible book navigation
    - Test verse search
    - Test verse insertion into slides
    - _Requirements: 20.3_

  - [ ]* 24.3 Write E2E tests for song feature
    - Test song search
    - Test song insertion into slides
    - Test song filtering
    - _Requirements: 20.3_

  - [ ]* 24.4 Write E2E tests for presentation mode
    - Test presentation mode navigation
    - Test keyboard shortcuts
    - Test slide transitions
    - _Requirements: 20.3_


  - [ ]* 24.5 Write E2E tests for voice control
    - Test voice command recognition
    - Test AI verse extraction
    - Test voice-controlled navigation
    - _Requirements: 20.3_

- [ ] 25. Final checkpoint and verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 26. Performance verification and optimization
  - [ ] 26.1 Verify performance targets
    - Measure initial load time (target: <2 seconds)
    - Measure time to interactive (target: <3 seconds)
    - Measure frame rate during scrolling (target: 60fps)
    - Measure memory usage over time (target: stable)
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

  - [ ] 26.2 Profile and optimize bottlenecks
    - Use PerformanceMonitor to identify slow functions
    - Optimize identified bottlenecks
    - Re-measure performance after optimizations
    - _Requirements: 22.5_

  - [ ] 26.3 Verify code quality metrics
    - Run code duplication analysis (target: <5%)
    - Verify test coverage (target: >70%)
    - Run TypeScript type checking (target: 0 errors)
    - Run linting (target: 0 errors)
    - _Requirements: 18.4, 19.6, 20.7_


- [ ] 27. Deployment preparation
  - [ ] 27.1 Create deployment configuration
    - Configure environment-specific settings (dev, staging, prod)
    - Set up environment variables
    - Configure API endpoints for each environment
    - _Requirements: 24.1, 24.2_

  - [ ] 27.2 Create CI/CD pipeline configuration
    - Configure automated testing on commit
    - Configure build on merge to main
    - Configure deployment to staging/production
    - Set up coverage reporting
    - _Requirements: 20.9_

  - [ ] 27.3 Prepare Android build
    - Update Android WebView configuration
    - Update Android app version
    - Build and test Android APK
    - _Requirements: 21.1-21.7_

## Notes

- Tasks marked with `*` are optional test-related sub-tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout the refactoring process
- The refactoring preserves all existing functionality while improving code quality and performance
- TypeScript is used throughout for type safety and better developer experience
- The implementation follows a layered architecture with clear separation of concerns
- All async operations use async/await pattern instead of callbacks
- Performance targets: <2s initial load, 60fps scrolling, >70% test coverage


## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "1.2", "1.3"]
    },
    {
      "id": 1,
      "tasks": ["2.1", "2.2", "2.6", "2.8", "2.10"]
    },
    {
      "id": 2,
      "tasks": ["2.3", "2.4", "2.7", "2.9", "4.1", "5.1", "5.3", "7.1", "7.3"]
    },
    {
      "id": 3,
      "tasks": ["2.5", "4.2", "4.5", "5.2", "5.4", "7.2", "7.4", "8.1", "8.3", "8.4"]
    },
    {
      "id": 4,
      "tasks": ["4.3", "4.6", "8.2", "8.5"]
    },
    {
      "id": 5,
      "tasks": ["4.4", "9.1", "9.3", "10.1"]
    },
    {
      "id": 6,
      "tasks": ["9.2", "9.4", "10.2", "12.1", "12.2", "12.3", "12.4"]
    },
    {
      "id": 7,
      "tasks": ["12.2", "12.5", "13.1", "13.2", "14.1", "15.1"]
    },
    {
      "id": 8,
      "tasks": ["13.3", "14.2", "15.2", "16.1", "16.2", "16.3", "16.4"]
    },
    {
      "id": 9,
      "tasks": ["16.5"]
    },
    {
      "id": 10,
      "tasks": ["16.6", "18.1", "18.2", "19.1", "19.2", "19.3", "20.1", "20.2", "20.3"]
    },
    {
      "id": 11,
      "tasks": ["18.3", "19.4", "21.1", "21.2", "22.1", "22.2", "22.3", "22.4"]
    },
    {
      "id": 12,
      "tasks": ["21.3", "23.1", "23.2", "23.3", "24.1", "24.2", "24.3", "24.4", "24.5"]
    },
    {
      "id": 13,
      "tasks": ["26.1", "26.2", "26.3"]
    },
    {
      "id": 14,
      "tasks": ["27.1", "27.2", "27.3"]
    }
  ]
}
```
