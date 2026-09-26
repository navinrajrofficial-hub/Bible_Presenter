import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SongHistoryService } from '../../core/services/song-history.service';
import { SongDataService } from '../../core/services/song-data.service';
import { SlideStateService } from '../../core/services/slide-state.service';
import { SongHistoryEntry, SongQueueItem } from '../../core/models/song.model';
import { Slide } from '../../core/models/slide.model';

@Component({
  selector: 'app-song-history-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="history-manager">
      <!-- Top Source Badge & Actions -->
      <div class="header-card">
        <div class="source-info">
          <div class="source-label">Active History File / Source:</div>
          <div class="source-badge">
            <span class="pulse-dot"></span>
            {{ historyService.activeSource() }}
          </div>
        </div>

        <div class="header-stats">
          <div class="stat-pill">
            <strong>{{ historyService.totalSongsWithHistory() }}</strong> Songs Recorded
          </div>
          <div class="stat-pill">
            <strong>{{ historyService.totalHistoryEntries() }}</strong> Queue Snapshots
          </div>
        </div>
      </div>

      <!-- File Manager Actions -->
      <div class="action-grid">
        <!-- Choose / Upload Custom History File -->
        <label class="action-btn file-upload-btn" title="Choose an external JSON history file">
          <input type="file" accept=".json" (change)="onFileSelected($event)" hidden #fileInput />
          <span>📁 Choose / Load History File</span>
        </label>

        <!-- Export Current History -->
        <button class="action-btn export-btn" (click)="exportHistory()" title="Download active history as JSON">
          <span>⬇ Export History JSON</span>
        </button>

        <!-- Reset to Default Bundled History -->
        <button class="action-btn reset-btn" (click)="resetHistory()" title="Restore default church history">
          <span>🔄 Reset to Default</span>
        </button>
      </div>

      <!-- Search History -->
      <div class="search-bar">
        <input
          type="text"
          class="search-input"
          placeholder="🔍 Search history by song title or lyrics..."
          [ngModel]="searchQuery()"
          (ngModelChange)="searchQuery.set($event)"
        />
        <button *ngIf="searchQuery()" class="clear-search-btn" (click)="searchQuery.set('')">✕</button>
      </div>

      <!-- History Content List -->
      <div class="history-list-container">
        <div *ngIf="filteredSongList().length === 0" class="empty-state">
          <div class="empty-icon">📜</div>
          <h3>No Song History Found</h3>
          <p>You can choose an existing <code>song_history.json</code> file or add songs from the song book.</p>
        </div>

        <div *ngFor="let songItem of filteredSongList()" class="song-history-card">
          <div class="song-card-header">
            <div class="song-title-group">
              <span class="song-icon">🎵</span>
              <h3 class="song-title">{{ songItem.title }}</h3>
              <span class="entry-count">{{ songItem.entries.length }} snapshot(s)</span>
            </div>
            <button class="quick-load-btn" (click)="loadLatestQueue(songItem.entries[0])" title="Load latest verse sequence into slide queue">
              ⚡ Use Latest Queue
            </button>
          </div>

          <!-- Timeline Snapshots for this song -->
          <div class="snapshots-timeline">
            <div *ngFor="let entry of songItem.entries; let idx = index" class="snapshot-row">
              <div class="snapshot-meta">
                <span class="snapshot-time">
                  📅 {{ entry.createdAt | date:'mediumDate' }} • {{ entry.createdAt | date:'shortTime' }}
                </span>
                <span class="queue-length-badge">{{ entry.queue.length }} verse(s)</span>
              </div>

              <!-- Verses in this queue snapshot -->
              <div class="queue-chips">
                <span
                  *ngFor="let item of entry.queue"
                  class="queue-chip"
                  [class.chorus-chip]="item.isChorus"
                >
                  {{ item.name }}
                </span>
              </div>

              <!-- Action buttons for this snapshot -->
              <div class="snapshot-actions">
                <button class="use-queue-btn" (click)="applyQueueToSlides(songItem.title, entry.queue)">
                  + Add to Main Slides
                </button>
                <button class="stage-queue-btn" (click)="loadToStaging(entry.queue)">
                  ➔ Load to Staging
                </button>
                <button class="delete-entry-btn" (click)="deleteEntry(songItem.id, entry.id)" title="Delete snapshot">
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Import Mode Modal (Switch vs Merge) -->
      <div *ngIf="pendingImportData()" class="modal-backdrop">
        <div class="modal-card">
          <h3 class="modal-title">📂 Choose History Import Mode</h3>
          <p class="modal-desc">
            File <strong>{{ pendingImportFileName() }}</strong> contains valid song history. How would you like to apply it?
          </p>

          <div class="modal-options">
            <button class="modal-opt-btn switch-opt" (click)="confirmImport('switch')">
              <div class="opt-title">🔄 Switch Completely</div>
              <div class="opt-desc">Replace current history and use this file as the active history.</div>
            </button>

            <button class="modal-opt-btn merge-opt" (click)="confirmImport('merge')">
              <div class="opt-title">🔀 Merge with Existing</div>
              <div class="opt-desc">Combine new file's history with current history without losing past records.</div>
            </button>
          </div>

          <button class="modal-cancel-btn" (click)="pendingImportData.set(null)">Cancel</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .history-manager {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #0f172a;
      color: #f8fafc;
      padding: 16px;
      gap: 14px;
      overflow: hidden;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .header-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }

    .source-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #94a3b8;
      margin-bottom: 3px;
    }

    .source-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #0f172a;
      border: 1px solid #38bdf8;
      color: #38bdf8;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #38bdf8;
      box-shadow: 0 0 8px #38bdf8;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .header-stats {
      display: flex;
      gap: 8px;
    }

    .stat-pill {
      background: #0f172a;
      border: 1px solid #334155;
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 12px;
      color: #cbd5e1;
    }

    .stat-pill strong {
      color: #f1f5f9;
    }

    .action-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
    }

    .action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: #1e293b;
      border: 1px solid #475569;
      color: #f1f5f9;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .action-btn:hover {
      background: #334155;
      border-color: #64748b;
    }

    .file-upload-btn {
      background: #0369a1;
      border-color: #0ea5e9;
      color: #fff;
    }

    .file-upload-btn:hover {
      background: #0284c7;
    }

    .export-btn {
      background: #065f46;
      border-color: #10b981;
    }

    .export-btn:hover {
      background: #047857;
    }

    .reset-btn:hover {
      background: #451a03;
      border-color: #f59e0b;
      color: #fbbf24;
    }

    .search-bar {
      position: relative;
      width: 100%;
    }

    .search-input {
      width: 100%;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 9px 36px 9px 12px;
      color: #f8fafc;
      font-size: 13px;
      outline: none;
    }

    .search-input:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
    }

    .clear-search-btn {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 14px;
    }

    .history-list-container {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-right: 4px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      text-align: center;
      color: #94a3b8;
    }

    .empty-icon {
      font-size: 40px;
      margin-bottom: 8px;
    }

    .song-history-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .song-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #334155;
      padding-bottom: 8px;
    }

    .song-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .song-title {
      font-size: 15px;
      font-weight: 700;
      color: #38bdf8;
      font-family: 'Noto Serif Tamil', serif;
      margin: 0;
    }

    .entry-count {
      font-size: 11px;
      background: #0f172a;
      padding: 2px 6px;
      border-radius: 12px;
      color: #94a3b8;
    }

    .quick-load-btn {
      background: linear-gradient(135deg, #0284c7, #0369a1);
      border: none;
      color: #fff;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .quick-load-btn:hover {
      opacity: 0.9;
    }

    .snapshots-timeline {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .snapshot-row {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .snapshot-meta {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #64748b;
    }

    .queue-length-badge {
      color: #38bdf8;
      font-weight: 600;
    }

    .queue-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .queue-chip {
      background: #1e293b;
      border: 1px solid #334155;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 11px;
      color: #cbd5e1;
      font-family: 'Noto Serif Tamil', serif;
    }

    .chorus-chip {
      background: rgba(234, 179, 8, 0.15);
      border-color: rgba(234, 179, 8, 0.4);
      color: #facc15;
    }

    .snapshot-actions {
      display: flex;
      gap: 6px;
      margin-top: 2px;
    }

    .use-queue-btn, .stage-queue-btn {
      background: #1e293b;
      border: 1px solid #475569;
      color: #e2e8f0;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }

    .use-queue-btn {
      background: #0284c7;
      border-color: #38bdf8;
      color: #fff;
    }

    .use-queue-btn:hover {
      background: #0369a1;
    }

    .stage-queue-btn:hover {
      background: #334155;
      border-color: #94a3b8;
    }

    .delete-entry-btn {
      margin-left: auto;
      background: none;
      border: none;
      color: #ef4444;
      cursor: pointer;
      font-size: 12px;
      padding: 0 4px;
    }

    .delete-entry-btn:hover {
      color: #f87171;
    }

    /* Modal Backdrop */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 16px;
    }

    .modal-card {
      background: #1e293b;
      border: 1px solid #475569;
      border-radius: 14px;
      padding: 24px;
      max-width: 460px;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }

    .modal-title {
      font-size: 18px;
      font-weight: 700;
      color: #f8fafc;
      margin: 0 0 8px 0;
    }

    .modal-desc {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
      margin-bottom: 16px;
    }

    .modal-options {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 16px;
    }

    .modal-opt-btn {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s;
    }

    .modal-opt-btn:hover {
      border-color: #38bdf8;
      background: #1e293b;
    }

    .opt-title {
      font-weight: 700;
      font-size: 14px;
      color: #38bdf8;
      margin-bottom: 2px;
    }

    .opt-desc {
      font-size: 12px;
      color: #94a3b8;
    }

    .modal-cancel-btn {
      width: 100%;
      background: transparent;
      border: 1px solid #475569;
      color: #94a3b8;
      padding: 8px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
    }

    .modal-cancel-btn:hover {
      color: #f8fafc;
      border-color: #64748b;
    }
  `]
})
export class SongHistoryManagerComponent {
  searchQuery = signal<string>('');
  pendingImportData = signal<string | null>(null);
  pendingImportFileName = signal<string>('');

  filteredSongList = computed(() => {
    const map = this.historyService.historyMap();
    const q = this.searchQuery().trim().toLowerCase();
    const songs = this.songService.songs();
    const songTitleById = new Map<string, string>();
    songs.forEach(s => songTitleById.set(String(s.id), s.title));

    const list = Object.entries(map).map(([id, entries]) => {
      const title = songTitleById.get(id) || entries[0]?.songTitle || `Song #${id}`;
      return { id, title, entries };
    });

    if (!q) return list;

    return list.filter(item => {
      if (item.title.toLowerCase().includes(q)) return true;
      return item.entries.some(e => e.queue.some(v => v.text.toLowerCase().includes(q) || v.name.toLowerCase().includes(q)));
    });
  });

  constructor(
    public historyService: SongHistoryService,
    private songService: SongDataService,
    private slideState: SlideStateService
  ) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        this.pendingImportData.set(content);
        this.pendingImportFileName.set(file.name);
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  confirmImport(mode: 'switch' | 'merge'): void {
    const data = this.pendingImportData();
    const name = this.pendingImportFileName();
    if (data) {
      this.historyService.importHistoryFile(data, name, mode);
      this.pendingImportData.set(null);
    }
  }

  exportHistory(): void {
    const json = this.historyService.exportHistoryJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `song_history_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  resetHistory(): void {
    if (confirm('Reset song history to default bundle?')) {
      this.historyService.resetToDefault();
    }
  }

  deleteEntry(songId: string, entryId: string): void {
    this.historyService.deleteHistoryEntry(songId, entryId);
  }

  loadLatestQueue(entry: SongHistoryEntry): void {
    if (!entry) return;
    this.songService.stagingQueue.set(entry.queue.map(q => ({ ...q })));
  }

  loadToStaging(queue: SongQueueItem[]): void {
    this.songService.stagingQueue.set(queue.map(q => ({ ...q })));
  }

  applyQueueToSlides(songTitle: string, queue: SongQueueItem[]): void {
    const slides: Slide[] = queue.map((item, idx) => {
      const ref = `${songTitle} - ${item.name}`;
      const escaped = item.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      const html = `<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;background:linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%);color:#f8fafc;font-family:'Noto Serif Tamil',serif;padding:3vh 4vw;text-align:center;position:relative;">
        <div style="position:absolute;top:2vh;right:2vw;font-size:1.8vh;color:#94a3b8;font-style:italic;">${ref}</div>
        <div style="font-size:clamp(32px,5vw,72px);font-weight:900;line-height:1.3;white-space:pre-wrap;word-break:break-word;max-width:90vw;">${escaped}</div>
      </div>`;

      return {
        id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'song',
        name: `${songTitle} (${idx + 1}/${queue.length})`,
        html,
        bookmarked: idx === 0
      };
    });

    this.slideState.addSlides(slides);
  }
}
