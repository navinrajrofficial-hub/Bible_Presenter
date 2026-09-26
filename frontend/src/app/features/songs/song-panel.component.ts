import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SongDataService } from '../../core/services/song-data.service';
import { SongHistoryService } from '../../core/services/song-history.service';
import { SlideStateService } from '../../core/services/slide-state.service';
import { Song, SongQueueItem } from '../../core/models/song.model';
import { Slide } from '../../core/models/slide.model';

@Component({
  selector: 'app-song-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="song-panel">
      <!-- Search Top Bar -->
      <div class="search-section">
        <input
          type="text"
          class="search-input"
          placeholder="🔍 Search 15,000+ Tamil Songs (e.g. கண்ணீர், நன்மைகள், Enna En)..."
          [ngModel]="searchQuery()"
          (ngModelChange)="searchQuery.set($event)"
        />
        <div class="search-meta">
          <span>{{ searchResults().length }} matches</span>
          <span *ngIf="songService.selectedSong()" class="current-song-tag">
            Active: {{ songService.selectedSong()?.title }}
          </span>
        </div>
      </div>

      <!-- 3-Column Song Workspace -->
      <div class="workspace-grid">
        <!-- 1. Songs List -->
        <div class="song-list-col">
          <div
            *ngFor="let song of searchResults()"
            class="song-item"
            [class.selected]="songService.selectedSong()?.id === song.id"
            (click)="songService.selectSong(song)"
          >
            <div class="song-title-row">
              <span class="song-title">{{ song.title }}</span>
              <span *ngIf="getHistoryCount(song.id) > 0" class="history-badge" title="Used in past services">
                📜 {{ getHistoryCount(song.id) }}
              </span>
            </div>
            <div *ngIf="song.artist" class="song-artist">{{ song.artist }}</div>
            <div class="song-snippet">{{ getSnippet(song.content) }}</div>
          </div>

          <div *ngIf="searchResults().length === 0" class="no-songs">
            No matching songs found.
          </div>
        </div>

        <!-- 2. Lyric Staging / Split Verses -->
        <div class="verse-split-col">
          <div *ngIf="songService.selectedSong() as song; else selectPrompt" class="verse-split-inner">
            <div class="split-header">
              <h3 class="split-song-title">{{ song.title }}</h3>
              <div class="split-actions">
                <button class="add-all-btn" (click)="songService.addAllToQueue()">
                  + Queue All
                </button>
              </div>
            </div>

            <!-- Verse Tiles -->
            <div class="verse-tiles-list">
              <div
                *ngFor="let verse of songService.currentSongVerses()"
                class="verse-tile"
                [class.chorus-tile]="verse.isChorus"
              >
                <div class="tile-header">
                  <span class="tile-tag">{{ verse.name }}</span>
                  <button class="tile-add-btn" (click)="songService.addToQueue(verse)" title="Add this verse to queue">
                    + Add
                  </button>
                </div>
                <div class="tile-text">{{ verse.text }}</div>
              </div>
            </div>
          </div>

          <ng-template #selectPrompt>
            <div class="select-prompt">
              <div class="prompt-icon">🎵</div>
              <p>Select a song from the list to view and split its lyrics.</p>
            </div>
          </ng-template>
        </div>

        <!-- 3. Final Staging Queue -->
        <div class="queue-col">
          <div class="queue-header">
            <div class="queue-title-group">
              <span class="queue-heading">Slide Queue</span>
              <span class="queue-count">({{ songService.stagingQueue().length }})</span>
            </div>
            <button
              *ngIf="songService.stagingQueue().length > 0"
              class="clear-queue-btn"
              (click)="songService.clearQueue()"
            >
              Clear
            </button>
          </div>

          <!-- Queue Items List -->
          <div class="queue-items-list">
            <div
              *ngFor="let item of songService.stagingQueue(); let idx = index"
              class="queue-item-card"
              [class.chorus-card]="item.isChorus"
            >
              <div class="queue-card-top">
                <span class="queue-item-index">{{ idx + 1 }}</span>
                <span class="queue-item-name">{{ item.name }}</span>
                <button class="remove-queue-btn" (click)="songService.removeFromQueue(idx)">✕</button>
              </div>
              <div class="queue-item-preview">{{ item.text }}</div>
            </div>

            <div *ngIf="songService.stagingQueue().length === 0" class="empty-queue">
              Queue is empty.<br />Click "+ Add" on any verse to arrange your slide order.
            </div>
          </div>

          <!-- Add to Slides CTA -->
          <div class="queue-footer">
            <button
              class="send-slides-btn"
              [disabled]="songService.stagingQueue().length === 0"
              (click)="generateSlidesFromQueue()"
            >
              🚀 Generate Slides ({{ songService.stagingQueue().length }})
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .song-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #0f172a;
      color: #f8fafc;
      overflow: hidden;
      font-family: 'Noto Serif Tamil', system-ui, sans-serif;
    }

    .search-section {
      padding: 12px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .search-input {
      width: 100%;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 8px 12px;
      color: #f8fafc;
      font-size: 13px;
      outline: none;
    }

    .search-input:focus {
      border-color: #38bdf8;
    }

    .search-meta {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #94a3b8;
    }

    .current-song-tag {
      color: #38bdf8;
      font-weight: 600;
    }

    .workspace-grid {
      display: grid;
      grid-template-columns: 280px 1fr 280px;
      flex: 1;
      overflow: hidden;
    }

    /* Column 1: Song List */
    .song-list-col {
      background: #111c30;
      border-right: 1px solid #334155;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .song-item {
      padding: 10px 12px;
      border-bottom: 1px solid #1e293b;
      cursor: pointer;
      transition: background 0.15s;
    }

    .song-item:hover {
      background: #1e293b;
    }

    .song-item.selected {
      background: #0369a1;
      border-left: 3px solid #38bdf8;
    }

    .song-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
    }

    .song-title {
      font-size: 14px;
      font-weight: 700;
      color: #f8fafc;
    }

    .history-badge {
      font-size: 10px;
      background: rgba(56, 189, 248, 0.2);
      color: #38bdf8;
      padding: 1px 5px;
      border-radius: 10px;
    }

    .song-artist {
      font-size: 11px;
      color: #94a3b8;
      font-family: system-ui, sans-serif;
    }

    .song-snippet {
      font-size: 11px;
      color: #64748b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 3px;
    }

    .no-songs {
      padding: 20px;
      text-align: center;
      color: #64748b;
      font-size: 12px;
    }

    /* Column 2: Verse Split */
    .verse-split-col {
      background: #0f172a;
      border-right: 1px solid #334155;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .verse-split-inner {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .split-header {
      padding: 10px 14px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .split-song-title {
      font-size: 15px;
      font-weight: 700;
      color: #38bdf8;
      margin: 0;
    }

    .add-all-btn {
      background: #0284c7;
      border: 1px solid #38bdf8;
      color: #fff;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .verse-tiles-list {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .verse-tile {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px 12px;
    }

    .chorus-tile {
      border-color: rgba(234, 179, 8, 0.4);
      background: rgba(234, 179, 8, 0.05);
    }

    .tile-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .tile-tag {
      font-size: 11px;
      font-weight: 700;
      color: #38bdf8;
    }

    .chorus-tile .tile-tag {
      color: #facc15;
    }

    .tile-add-btn {
      background: #0284c7;
      border: none;
      color: #fff;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    }

    .tile-text {
      font-size: 14px;
      line-height: 1.6;
      white-space: pre-wrap;
      color: #e2e8f0;
    }

    .select-prompt {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #64748b;
      text-align: center;
      padding: 20px;
    }

    .prompt-icon {
      font-size: 40px;
      margin-bottom: 8px;
    }

    /* Column 3: Queue */
    .queue-col {
      background: #111c30;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .queue-header {
      padding: 10px 12px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .queue-title-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .queue-heading {
      font-size: 13px;
      font-weight: 700;
      color: #f8fafc;
    }

    .queue-count {
      font-size: 12px;
      color: #38bdf8;
    }

    .clear-queue-btn {
      background: none;
      border: 1px solid #475569;
      color: #94a3b8;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      cursor: pointer;
    }

    .queue-items-list {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .queue-item-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 8px;
    }

    .chorus-card {
      border-color: rgba(234, 179, 8, 0.4);
    }

    .queue-card-top {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }

    .queue-item-index {
      font-size: 10px;
      background: #0f172a;
      color: #38bdf8;
      padding: 1px 5px;
      border-radius: 10px;
      font-weight: 700;
    }

    .queue-item-name {
      font-size: 11px;
      font-weight: 700;
      color: #cbd5e1;
      flex: 1;
    }

    .remove-queue-btn {
      background: none;
      border: none;
      color: #ef4444;
      cursor: pointer;
      font-size: 12px;
    }

    .queue-item-preview {
      font-size: 11px;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .empty-queue {
      color: #64748b;
      font-size: 11px;
      text-align: center;
      padding: 30px 10px;
      line-height: 1.6;
    }

    .queue-footer {
      padding: 10px;
      background: #1e293b;
      border-top: 1px solid #334155;
    }

    .send-slides-btn {
      width: 100%;
      background: linear-gradient(135deg, #0284c7, #0369a1);
      border: 1px solid #38bdf8;
      color: #fff;
      padding: 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .send-slides-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class SongPanelComponent {
  searchQuery = signal<string>('');

  searchResults = computed(() => {
    return this.songService.searchSongs(this.searchQuery(), 40);
  });

  constructor(
    public songService: SongDataService,
    private historyService: SongHistoryService,
    private slideState: SlideStateService
  ) {}

  getSnippet(content: string): string {
    return content.replace(/\n/g, ' ').slice(0, 60);
  }

  getHistoryCount(songId: number): number {
    return this.historyService.getHistoryForSong(songId).length;
  }

  generateSlidesFromQueue(): void {
    const queue = this.songService.stagingQueue();
    const song = this.songService.selectedSong();
    if (queue.length === 0 || !song) return;

    // 1. Record in Song History Service
    this.historyService.addHistoryEntry(song.id, song.title, queue);

    // 2. Generate Slides
    const slides: Slide[] = queue.map((item, idx) => {
      const ref = `${song.title} - ${item.name}`;
      const escaped = item.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      const html = `<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;background:linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%);color:#f8fafc;font-family:'Noto Serif Tamil',serif;padding:3vh 4vw;text-align:center;position:relative;">
        <div style="position:absolute;top:2vh;right:3vw;font-size:2vh;color:#94a3b8;font-style:italic;">${ref}</div>
        <div style="font-size:clamp(32px,5.2vw,76px);font-weight:900;line-height:1.25;white-space:pre-wrap;word-break:break-word;max-width:92vw;-webkit-text-stroke:0.04em currentColor;">${escaped}</div>
      </div>`;

      return {
        id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'song',
        name: `${song.title} (${idx + 1}/${queue.length})`,
        html,
        rawText: item.text,
        refText: ref,
        bookmarked: idx === 0
      };
    });

    this.slideState.addSlides(slides);
  }
}
