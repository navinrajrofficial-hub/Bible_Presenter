export interface Song {
  id: number;
  title: string;
  artist?: string;
  content: string;
}

export interface SongQueueItem {
  text: string;
  name: string;
  isChorus?: boolean;
}

export interface SongHistoryEntry {
  id: string;
  createdAt: number;
  songId?: string | number;
  songTitle?: string;
  queue: SongQueueItem[];
}

export type SongHistoryMap = Record<string, SongHistoryEntry[]>;

export interface SongHistoryFile {
  version: string;
  exportedAt: string;
  activeSource?: string;
  history: SongHistoryMap;
}
