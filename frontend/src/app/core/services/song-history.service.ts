import { Injectable, signal, computed, effect } from '@angular/core';
import { SongHistoryEntry, SongHistoryMap, SongHistoryFile, SongQueueItem } from '../models/song.model';

const STORAGE_KEY = 'bp_song_queue_history_v2';
const SOURCE_KEY = 'bp_active_history_source';
const LIMIT_PER_SONG = 25;

@Injectable({
  providedIn: 'root'
})
export class SongHistoryService {
  // Signals
  readonly historyMap = signal<SongHistoryMap>({});
  readonly activeSource = signal<string>('Default (song_history.json)');
  readonly isLoaded = signal<boolean>(false);
  readonly availableFiles = signal<string[]>(['Default (song_history.json)']);

  // Computed signals
  readonly totalSongsWithHistory = computed(() => Object.keys(this.historyMap()).length);
  
  readonly totalHistoryEntries = computed(() => {
    return Object.values(this.historyMap()).reduce((acc, entries) => acc + entries.length, 0);
  });

  constructor() {
    this.initHistory();

    // Auto-persist local storage
    effect(() => {
      const data = this.historyMap();
      const source = this.activeSource();
      if (this.isLoaded()) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          localStorage.setItem(SOURCE_KEY, source);
        } catch (e) {
          console.warn('Failed to persist song history:', e);
        }
      }
    });
  }

  private async initHistory(): Promise<void> {
    // 1. Try local storage first
    try {
      const savedSource = localStorage.getItem(SOURCE_KEY);
      if (savedSource) this.activeSource.set(savedSource);

      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.historyMap.set(this.normalizeHistory(parsed));
          this.isLoaded.set(true);
          return;
        }
      }
    } catch (e) {
      console.warn('Local history read failed:', e);
    }

    // 2. Fallback to fetching default bundled song_history.json
    try {
      const res = await fetch('data/song_history.json');
      if (res.ok) {
        const data = await res.json();
        this.historyMap.set(this.normalizeHistory(data));
        this.activeSource.set('Default (song_history.json)');
      }
    } catch (e) {
      console.log('Using empty history store:', e);
      this.historyMap.set({});
    } finally {
      this.isLoaded.set(true);
    }
  }

  normalizeHistory(rawMap: any): SongHistoryMap {
    const out: SongHistoryMap = {};
    if (!rawMap || typeof rawMap !== 'object') return out;

    const sourceObj = rawMap.history ? rawMap.history : rawMap;

    for (const [key, entries] of Object.entries(sourceObj)) {
      if (Array.isArray(entries)) {
        const valid = entries
          .filter((e: any) => e && Array.isArray(e.queue) && e.queue.length > 0)
          .map((e: any) => ({
            id: String(e.id || Date.now() + '-' + Math.random().toString(36).substring(2, 7)),
            createdAt: Number(e.createdAt || Date.now()),
            songId: key,
            songTitle: e.songTitle || '',
            queue: e.queue.map((item: any) => ({
              text: String(item.text || ''),
              name: String(item.name || ''),
              isChorus: Boolean(item.isChorus)
            }))
          }))
          .sort((a, b) => b.createdAt - a.createdAt);

        if (valid.length > 0) {
          out[key] = valid.slice(0, LIMIT_PER_SONG);
        }
      }
    }
    return out;
  }

  getHistoryForSong(songId: number | string): SongHistoryEntry[] {
    const key = String(songId ?? '');
    if (!key) return [];
    return this.historyMap()[key] || [];
  }

  addHistoryEntry(songId: number | string, songTitle: string, queue: SongQueueItem[]): void {
    if (!queue || queue.length === 0) return;
    const key = String(songId);

    const newEntry: SongHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: Date.now(),
      songId: key,
      songTitle,
      queue: queue.map(q => ({ ...q }))
    };

    this.historyMap.update(map => {
      const copy = { ...map };
      const list = copy[key] ? [...copy[key]] : [];

      // Avoid consecutive duplicate queues
      const last = list[0];
      if (last && JSON.stringify(last.queue) === JSON.stringify(newEntry.queue)) {
        // Just update timestamp
        last.createdAt = Date.now();
      } else {
        list.unshift(newEntry);
      }

      copy[key] = list.slice(0, LIMIT_PER_SONG);
      return copy;
    });
  }

  deleteHistoryEntry(songId: number | string, entryId: string): void {
    const key = String(songId);
    this.historyMap.update(map => {
      if (!map[key]) return map;
      const copy = { ...map };
      copy[key] = copy[key].filter(e => e.id !== entryId);
      if (copy[key].length === 0) delete copy[key];
      return copy;
    });
  }

  /**
   * Import or Switch to a custom song history JSON file
   */
  importHistoryFile(fileContent: string, fileName: string, mode: 'switch' | 'merge' = 'switch'): boolean {
    try {
      const parsed = JSON.parse(fileContent);
      const normalized = this.normalizeHistory(parsed);

      if (mode === 'switch') {
        this.historyMap.set(normalized);
        this.activeSource.set(fileName || 'Custom File');
      } else {
        // Merge mode
        this.historyMap.update(current => {
          const merged: SongHistoryMap = { ...current };
          for (const [key, entries] of Object.entries(normalized)) {
            const existing = merged[key] || [];
            const combined = [...entries, ...existing];
            // Deduplicate by queue fingerprint
            const seen = new Set<string>();
            const unique = combined.filter(e => {
              const fp = JSON.stringify(e.queue);
              if (seen.has(fp)) return false;
              seen.add(fp);
              return true;
            });
            merged[key] = unique.sort((a, b) => b.createdAt - a.createdAt).slice(0, LIMIT_PER_SONG);
          }
          return merged;
        });
        this.activeSource.set(`Merged: ${fileName}`);
      }

      // Add to available files list
      if (!this.availableFiles().includes(fileName)) {
        this.availableFiles.update(files => [...files, fileName]);
      }

      return true;
    } catch (e) {
      console.error('Failed to import song history file:', e);
      return false;
    }
  }

  exportHistoryJSON(): string {
    const data: SongHistoryFile = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      activeSource: this.activeSource(),
      history: this.historyMap()
    };
    return JSON.stringify(data, null, 2);
  }

  resetToDefault(): void {
    this.historyMap.set({});
    localStorage.removeItem(STORAGE_KEY);
    this.initHistory();
  }
}
