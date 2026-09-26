import { Component, ElementRef, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SlideStateService } from '../../core/services/slide-state.service';
import { PresentationService } from '../../core/services/presentation.service';

@Component({
  selector: 'app-slide-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="slide-preview-container">
      <!-- Preview Frame Header -->
      <div class="preview-header">
        <div class="header-info">
          <span class="preview-badge">Live Preview</span>
          <span *ngIf="slideState.currentSlide()" class="slide-title">
            {{ slideState.currentSlide()?.name }}
          </span>
        </div>

        <div class="header-actions">
          <button class="present-btn" (click)="presentation.startPresent(slideState.currentIdx())">
            ▶ Present Fullscreen
          </button>
        </div>
      </div>

      <!-- Preview Canvas / Iframe -->
      <div class="canvas-area">
        <div class="aspect-box">
          <iframe
            #previewFrame
            class="preview-iframe"
            sandbox="allow-scripts allow-same-origin"
          ></iframe>
        </div>
      </div>

      <!-- Navigation & Quick Controls Footer -->
      <div class="preview-footer">
        <div class="nav-group">
          <button
            class="nav-btn"
            [disabled]="slideState.currentIdx() <= 0"
            (click)="prevSlide()"
          >
            ◀ Prev
          </button>
          <span class="page-indicator">
            {{ slideState.totalSlides() > 0 ? (slideState.currentIdx() + 1) : 0 }} / {{ slideState.totalSlides() }}
          </span>
          <button
            class="nav-btn"
            [disabled]="slideState.currentIdx() >= slideState.totalSlides() - 1"
            (click)="nextSlide()"
          >
            Next ▶
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .slide-preview-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #020617;
      overflow: hidden;
      font-family: system-ui, sans-serif;
    }

    .preview-header {
      padding: 10px 16px;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-info {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
    }

    .preview-badge {
      background: #0284c7;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .slide-title {
      font-size: 13px;
      color: #e2e8f0;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: 'Noto Serif Tamil', system-ui, sans-serif;
    }

    .present-btn {
      background: linear-gradient(135deg, #10b981, #059669);
      border: 1px solid #34d399;
      color: #fff;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
      transition: all 0.2s;
    }

    .present-btn:hover {
      transform: scale(1.02);
      box-shadow: 0 0 15px rgba(16, 185, 129, 0.5);
    }

    .canvas-area {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: #020617;
      background-image: radial-gradient(circle at center, rgba(30, 41, 59, 0.3) 1px, transparent 1px);
      background-size: 24px 24px;
    }

    .aspect-box {
      width: 100%;
      max-width: 960px;
      aspect-ratio: 16 / 9;
      background: #000;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1);
    }

    .preview-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }

    .preview-footer {
      padding: 10px 16px;
      background: #0f172a;
      border-top: 1px solid #1e293b;
      display: flex;
      justify-content: center;
    }

    .nav-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .nav-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .nav-btn:hover:not(:disabled) {
      background: #334155;
      color: #fff;
    }

    .nav-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .page-indicator {
      font-size: 12px;
      font-weight: 700;
      color: #38bdf8;
      min-width: 60px;
      text-align: center;
    }
  `]
})
export class SlidePreviewComponent {
  @ViewChild('previewFrame') previewFrame!: ElementRef<HTMLIFrameElement>;

  constructor(
    public slideState: SlideStateService,
    public presentation: PresentationService
  ) {
    effect(() => {
      const slide = this.slideState.currentSlide();
      if (slide) {
        this.renderSlide(slide.html);
      } else {
        this.renderSlide('<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;font-family:sans-serif;">No Slide Selected</div>');
      }
    });
  }

  prevSlide(): void {
    this.slideState.currentIdx.update(i => Math.max(0, i - 1));
  }

  nextSlide(): void {
    const total = this.slideState.totalSlides();
    this.slideState.currentIdx.update(i => Math.min(Math.max(0, total - 1), i + 1));
  }

  private renderSlide(html: string): void {
    if (!this.previewFrame?.nativeElement) {
      setTimeout(() => this.renderSlide(html), 50);
      return;
    }
    const frame = this.previewFrame.nativeElement;
    frame.srcdoc = html;
  }
}
