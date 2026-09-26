import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { SlideStateService } from '../../core/services/slide-state.service';
import { PresentationService } from '../../core/services/presentation.service';

@Component({
  selector: 'app-slide-list',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  template: `
    <div class="slide-list-panel">
      <!-- Panel Header -->
      <div class="panel-header">
        <div class="header-title">
          <span>Slides</span>
          <span class="slide-count">({{ slideState.totalSlides() }})</span>
        </div>
        <div class="header-actions">
          <button class="icon-btn" (click)="slideState.clearAllSlides()" title="Clear All Slides">🗑</button>
        </div>
      </div>

      <!-- Drag and Drop Slide List -->
      <div
        cdkDropList
        class="slides-scroll"
        (cdkDropListDropped)="onDrop($event)"
      >
        <div
          *ngFor="let slide of slideState.slides(); let idx = index"
          cdkDrag
          class="slide-card"
          [class.active]="slideState.currentIdx() === idx"
          (click)="selectSlide(idx)"
        >
          <!-- Drag Handle / Index -->
          <div class="card-left">
            <span class="slide-num">{{ idx + 1 }}</span>
            <span cdkDragHandle class="drag-handle" title="Drag to reorder">⋮⋮</span>
          </div>

          <!-- Slide Content Info -->
          <div class="card-center">
            <div class="slide-name">{{ slide.name || 'Untitled Slide' }}</div>
            <div class="slide-type-badge" [class]="'badge-' + slide.type">
              {{ slide.type | uppercase }}
            </div>
          </div>

          <!-- Actions -->
          <div class="card-right" (click)="$event.stopPropagation()">
            <button
              class="bookmark-btn"
              [class.bookmarked]="slide.bookmarked"
              (click)="slideState.toggleBookmark(idx)"
              title="Bookmark for presentation bar"
            >
              ★
            </button>
            <button class="delete-btn" (click)="slideState.removeSlide(idx)" title="Delete Slide">
              ✕
            </button>
          </div>
        </div>

        <div *ngIf="slideState.slides().length === 0" class="empty-list">
          No slides added yet.<br />Use Bible or Song panels to add slides.
        </div>
      </div>
    </div>
  `,
  styles: [`
    .slide-list-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #0b1329;
      border-right: 1px solid #1e293b;
      overflow: hidden;
      font-family: system-ui, sans-serif;
    }

    .panel-header {
      padding: 10px 14px;
      background: #111c38;
      border-bottom: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-title {
      font-size: 13px;
      font-weight: 700;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .slide-count {
      color: #38bdf8;
      font-size: 12px;
    }

    .icon-btn {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 14px;
      padding: 4px;
    }

    .icon-btn:hover {
      color: #f87171;
    }

    .slides-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .slide-card {
      background: #15223e;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .slide-card:hover {
      background: #1a2a4c;
      border-color: #334155;
    }

    .slide-card.active {
      background: #0284c7;
      border-color: #38bdf8;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
    }

    .card-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .slide-num {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      min-width: 18px;
    }

    .slide-card.active .slide-num {
      color: #e0f2fe;
    }

    .drag-handle {
      color: #64748b;
      cursor: grab;
      font-size: 13px;
      user-select: none;
    }

    .card-center {
      flex: 1;
      overflow: hidden;
    }

    .slide-name {
      font-size: 12px;
      font-weight: 600;
      color: #f8fafc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: 'Noto Serif Tamil', system-ui, sans-serif;
    }

    .slide-type-badge {
      display: inline-block;
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 3px;
      font-weight: 700;
      margin-top: 2px;
      background: #0f172a;
      color: #94a3b8;
    }

    .badge-bible { color: #38bdf8; background: rgba(56, 189, 248, 0.15); }
    .badge-song { color: #facc15; background: rgba(234, 179, 8, 0.15); }
    .badge-html { color: #a855f7; background: rgba(168, 85, 247, 0.15); }

    .card-right {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .bookmark-btn {
      background: none;
      border: none;
      color: #64748b;
      cursor: pointer;
      font-size: 14px;
      padding: 2px;
    }

    .bookmark-btn.bookmarked {
      color: #fbbf24;
    }

    .delete-btn {
      background: none;
      border: none;
      color: #64748b;
      cursor: pointer;
      font-size: 12px;
      padding: 2px;
    }

    .delete-btn:hover {
      color: #ef4444;
    }

    .empty-list {
      color: #64748b;
      font-size: 12px;
      text-align: center;
      padding: 30px 10px;
      line-height: 1.5;
    }

    .cdk-drag-preview {
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
      border-radius: 8px;
      background: #0284c7;
      color: #fff;
    }

    .cdk-drag-placeholder {
      opacity: 0.3;
    }
  `]
})
export class SlideListComponent {
  constructor(
    public slideState: SlideStateService,
    private presentation: PresentationService
  ) {}

  selectSlide(index: number): void {
    this.slideState.currentIdx.set(index);
  }

  onDrop(event: CdkDragDrop<string[]>): void {
    this.slideState.reorderSlides(event.previousIndex, event.currentIndex);
  }
}
