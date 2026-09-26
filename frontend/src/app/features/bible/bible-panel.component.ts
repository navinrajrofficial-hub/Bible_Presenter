import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BibleDataService } from '../../core/services/bible-data.service';
import { SlideStateService } from '../../core/services/slide-state.service';
import { BibleBookInfo } from '../../core/models/bible.model';
import { Slide } from '../../core/models/slide.model';

@Component({
  selector: 'app-bible-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bible-panel">
      <!-- Search & Testament Filter -->
      <div class="top-controls">
        <div class="search-box">
          <input
            type="text"
            class="search-input"
            placeholder="🔍 Search Book (e.g. மத்தேயு, John, Gen 1:1)..."
            [ngModel]="bookQuery()"
            (ngModelChange)="onBookQueryChange($event)"
          />
        </div>

        <div class="testament-tabs">
          <button
            class="tab-btn"
            [class.active]="selectedTestament() === 'ALL'"
            (click)="selectedTestament.set('ALL')"
          >
            All (66)
          </button>
          <button
            class="tab-btn"
            [class.active]="selectedTestament() === 'OT'"
            (click)="selectedTestament.set('OT')"
          >
            பழைய ஏற்பாடு (39)
          </button>
          <button
            class="tab-btn"
            [class.active]="selectedTestament() === 'NT'"
            (click)="selectedTestament.set('NT')"
          >
            புதிய ஏற்பாடு (27)
          </button>
        </div>
      </div>

      <!-- Main Columns: Book Grid & Chapter/Verse View -->
      <div class="content-columns">
        <!-- Books List -->
        <div class="books-column">
          <div
            *ngFor="let book of filteredBooks()"
            class="book-item"
            [class.active]="bibleService.selectedBook().name === book.name"
            (click)="bibleService.selectBook(book)"
          >
            <div class="book-name-ta">{{ book.name }}</div>
            <div class="book-name-en">{{ book.en }} • {{ book.chapters }} ch</div>
          </div>
        </div>

        <!-- Chapters & Verses View -->
        <div class="verses-column">
          <!-- Chapter Selector Bar -->
          <div class="chapter-selector">
            <span class="section-label">அதிகாரம் (Chapter):</span>
            <div class="chapter-chips">
              <button
                *ngFor="let ch of chapterList()"
                class="chapter-chip"
                [class.active]="bibleService.selectedChapter() === ch"
                (click)="bibleService.selectChapter(ch)"
              >
                {{ ch }}
              </button>
            </div>
          </div>

          <!-- Verse Action Bar -->
          <div class="verse-actions-bar">
            <div class="selection-status">
              <strong>{{ bibleService.selectedBook().name }} {{ bibleService.selectedChapter() }}</strong>
              <span *ngIf="bibleService.selectedVerses().length > 0" class="selected-count">
                ({{ bibleService.selectedVerses().length }} selected)
              </span>
            </div>

            <div class="btn-group">
              <button class="small-btn" (click)="bibleService.selectAllVersesInChapter()">Select All</button>
              <button class="small-btn" (click)="bibleService.clearVerseSelection()">Clear</button>
              <button
                class="primary-btn"
                [disabled]="bibleService.selectedVerses().length === 0"
                (click)="addSelectedVersesToSlides()"
              >
                + Add to Slides
              </button>
            </div>
          </div>

          <!-- Verses Grid / List -->
          <div class="verses-list">
            <div
              *ngFor="let verse of currentChapterVerses()"
              class="verse-row"
              [class.selected]="bibleService.selectedVerses().includes(verse.verse)"
              (click)="bibleService.toggleVerseSelection(verse.verse)"
            >
              <span class="verse-num">{{ verse.verse }}</span>
              <span class="verse-text">{{ verse.text }}</span>
            </div>

            <div *ngIf="currentChapterVerses().length === 0" class="no-verses">
              No verses loaded for this chapter.
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .bible-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #0f172a;
      color: #f8fafc;
      overflow: hidden;
      font-family: 'Noto Serif Tamil', system-ui, sans-serif;
    }

    .top-controls {
      padding: 12px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      display: flex;
      flex-direction: column;
      gap: 8px;
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

    .testament-tabs {
      display: flex;
      gap: 6px;
    }

    .tab-btn {
      flex: 1;
      background: #0f172a;
      border: 1px solid #334155;
      color: #94a3b8;
      padding: 5px 8px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }

    .tab-btn.active {
      background: #0284c7;
      border-color: #38bdf8;
      color: #fff;
    }

    .content-columns {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .books-column {
      width: 180px;
      background: #111c30;
      border-right: 1px solid #334155;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .book-item {
      padding: 8px 12px;
      border-bottom: 1px solid #1e293b;
      cursor: pointer;
      transition: background 0.15s;
    }

    .book-item:hover {
      background: #1e293b;
    }

    .book-item.active {
      background: #0369a1;
      border-left: 3px solid #38bdf8;
    }

    .book-name-ta {
      font-size: 13px;
      font-weight: 700;
      color: #f8fafc;
    }

    .book-name-en {
      font-size: 10px;
      color: #94a3b8;
      font-family: system-ui, sans-serif;
    }

    .verses-column {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #0f172a;
    }

    .chapter-selector {
      padding: 8px 12px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
    }

    .section-label {
      font-size: 11px;
      color: #94a3b8;
      white-space: nowrap;
    }

    .chapter-chips {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .chapter-chip {
      background: #0f172a;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      min-width: 28px;
    }

    .chapter-chip.active {
      background: #0284c7;
      border-color: #38bdf8;
      color: #fff;
    }

    .verse-actions-bar {
      padding: 8px 12px;
      background: #111c30;
      border-bottom: 1px solid #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: system-ui, sans-serif;
    }

    .selection-status {
      font-size: 13px;
      color: #38bdf8;
    }

    .selected-count {
      color: #fbbf24;
      font-size: 12px;
      margin-left: 4px;
    }

    .btn-group {
      display: flex;
      gap: 6px;
    }

    .small-btn {
      background: #1e293b;
      border: 1px solid #475569;
      color: #cbd5e1;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    }

    .small-btn:hover {
      background: #334155;
    }

    .primary-btn {
      background: #0284c7;
      border: 1px solid #38bdf8;
      color: #fff;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }

    .primary-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .verses-list {
      flex: 1;
      overflow-y: auto;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .verse-row {
      display: flex;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: background 0.15s;
      line-height: 1.5;
    }

    .verse-row:hover {
      background: #1e293b;
    }

    .verse-row.selected {
      background: rgba(2, 132, 199, 0.2);
      border-color: #0284c7;
    }

    .verse-num {
      color: #38bdf8;
      font-weight: 900;
      font-size: 14px;
      min-width: 24px;
    }

    .verse-text {
      color: #f1f5f9;
      font-size: 15px;
    }

    .no-verses {
      color: #64748b;
      text-align: center;
      padding: 20px;
      font-size: 13px;
    }
  `]
})
export class BiblePanelComponent {
  bookQuery = signal<string>('');
  selectedTestament = signal<'ALL' | 'OT' | 'NT'>('ALL');

  filteredBooks = computed(() => {
    const q = this.bookQuery().trim().toLowerCase();
    const testament = this.selectedTestament();

    return this.bibleService.books().filter(b => {
      if (testament !== 'ALL' && b.testament !== testament) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.en.toLowerCase().includes(q) ||
        b.tg.toLowerCase().includes(q)
      );
    });
  });

  chapterList = computed(() => {
    const count = this.bibleService.selectedBook().chapters;
    return Array.from({ length: count }, (_, i) => i + 1);
  });

  currentChapterVerses = computed(() => {
    return this.bibleService.getVersesForCurrentChapter();
  });

  constructor(
    public bibleService: BibleDataService,
    private slideState: SlideStateService
  ) {}

  onBookQueryChange(val: string): void {
    this.bookQuery.set(val);
  }

  addSelectedVersesToSlides(): void {
    const book = this.bibleService.selectedBook();
    const ch = this.bibleService.selectedChapter();
    const selectedNums = this.bibleService.selectedVerses();
    if (selectedNums.length === 0) return;

    const slides: Slide[] = selectedNums.map((vNum, idx) => {
      const text = this.bibleService.getVerseText(book.name, ch, vNum);
      const ref = `${book.name} ${ch}:${vNum}`;
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

      const html = `<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;background:linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%);color:#ffffff;font-family:'Noto Serif Tamil',serif;padding:3vh 4vw;text-align:center;position:relative;">
        <div class="verse-ref" style="position:absolute;top:2vh;right:3vw;font-size:2.2vh;color:#cbd5e1;font-style:italic;font-weight:900;">— ${ref}</div>
        <div class="verse-text" style="font-size:clamp(36px,5.8vw,80px);font-weight:900;line-height:1.25;white-space:pre-wrap;word-break:break-word;max-width:92vw;-webkit-text-stroke:0.04em currentColor;">${escaped}</div>
      </div>`;

      return {
        id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'bible',
        name: ref,
        html,
        rawText: text,
        refText: ref,
        bookmarked: idx === 0
      };
    });

    this.slideState.addSlides(slides);
    this.bibleService.clearVerseSelection();
  }
}
