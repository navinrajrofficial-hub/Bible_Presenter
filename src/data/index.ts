/**
 * Data Access Layer
 * 
 * This module provides data access functionality including:
 * - Storage management (IndexedDB, localStorage)
 * - Content loading (Bible, songs)
 * - Caching (LRU cache)
 */

export * from './storage';
export * from './loaders';
export * from './cache';
