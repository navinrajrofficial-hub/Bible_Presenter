import { Injectable, signal, computed } from '@angular/core';
import { Song, SongQueueItem } from '../models/song.model';

@Injectable({
  providedIn: 'root'
})
export class SongDataService {
  readonly songs = signal<Song[]>([]);
  readonly isLoaded = signal<boolean>(false);
  readonly selectedSong = signal<Song | null>(null);
  readonly searchQuery = signal<string>('');
  readonly stagingQueue = signal<SongQueueItem[]>([]);

  // Split verses for currently selected song
  readonly currentSongVerses = signal<SongQueueItem[]>([]);

  constructor() {
    this.initSongData();
  }

  private async initSongData(): Promise<void> {
    try {
      if ((window as any).songContent) {
        this.extractSongs((window as any).songContent);
        this.isLoaded.set(true);
        return;
      }

      await this.loadScript('data/song_content.js');
      if ((window as any).songContent) {
        this.extractSongs((window as any).songContent);
      }
    } catch (e) {
      console.warn('Could not load song content script:', e);
    } finally {
      this.isLoaded.set(true);
    }
  }

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
  }

  private extractSongs(rawContent: Record<string | number, { title: string; artist?: string; content: string }>): void {
    const list: Song[] = [];
    for (const [idStr, s] of Object.entries(rawContent)) {
      const id = Number(idStr);
      if (s && s.title && s.content) {
        list.push({
          id: isNaN(id) ? list.length : id,
          title: s.title.trim(),
          artist: s.artist ? s.artist.trim() : '',
          content: s.content.trim()
        });
      }
    }
    this.songs.set(list);
  }

  selectSong(song: Song): void {
    this.selectedSong.set(song);
    this.parseVerses(song);
  }

  searchSongs(query: string, limit = 50): Song[] {
    if (!query || !query.trim()) return this.songs().slice(0, limit);
    const q = query.trim().toLowerCase();
    const all = this.songs();

    // 1. Exact title matches first
    const titleMatches: Song[] = [];
    const contentMatches: Song[] = [];

    for (const s of all) {
      const t = s.title.toLowerCase();
      if (t.includes(q)) {
        titleMatches.push(s);
        if (titleMatches.length >= limit) break;
      } else if (s.content.toLowerCase().includes(q)) {
        if (titleMatches.length + contentMatches.length < limit) {
          contentMatches.push(s);
        }
      }
    }

    return [...titleMatches, ...contentMatches].slice(0, limit);
  }

  parseVerses(song: Song): void {
    const raw = song.content.replace(/\r\n/g, '\n').trim();
    // Split by double blank lines
    const blocks = raw.split(/\n\s*\n+/).map(b => b.trim()).filter(b => b.length > 0);

    let chorusFound = false;
    const items: SongQueueItem[] = blocks.map((block, idx) => {
      const isChorus = /பல்லவி|chorus|pallavi/i.test(block) || (!chorusFound && idx === 0);
      if (isChorus) chorusFound = true;

      const name = isChorus
        ? 'பல்லவி (Chorus)'
        : `சரணம் ${idx + 1}`;

      return {
        text: block,
        name,
        isChorus
      };
    });

    this.currentSongVerses.set(items);
  }

  addToQueue(item: SongQueueItem): void {
    this.stagingQueue.update(q => [...q, { ...item }]);
  }

  addAllToQueue(): void {
    const verses = this.currentSongVerses();
    this.stagingQueue.update(q => [...q, ...verses.map(v => ({ ...v }))]);
  }

  removeFromQueue(index: number): void {
    this.stagingQueue.update(q => q.filter((_, i) => i !== index));
  }

  clearQueue(): void {
    this.stagingQueue.set([]);
  }

  reorderQueue(fromIndex: number, toIndex: number): void {
    this.stagingQueue.update(q => {
      const copy = [...q];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return copy;
    });
  }
}
