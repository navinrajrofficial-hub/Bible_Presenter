import { Component, ElementRef, HostListener, ViewChild, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresentationService } from '../../core/services/presentation.service';
import { SlideStateService } from '../../core/services/slide-state.service';

@Component({
  selector: 'app-presentation-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="presentation.isPresenting()"
      class="presentation-overlay"
      (mousemove)="onMouseMove()"
    >
      <!-- Main Presentation Iframe -->
      <iframe
        #presentIframe
        class="present-iframe"
        sandbox="allow-scripts allow-same-origin"
      ></iframe>

      <!-- Hotkey HUD Notification -->
      <div *ngIf="presentation.hotkeyNotification() as notif" class="hotkey-detector">
        {{ notif.message }}
      </div>

      <!-- Quick Rainbow Indicator Button -->
      <button
        class="rainbow-fab"
        [class.active]="presentation.rainbowActive()"
        (click)="presentation.toggleRainbow()"
        title="Rainbow Text Sweep (G)"
      >
        🌈
      </button>

      <!-- Fireworks Graphics Overlay -->
      <div *ngIf="presentation.showFireworks()" class="fx-overlay fireworks-anim">
        <div class="firework-burst burst-1">🎆</div>
        <div class="firework-burst burst-2">✨</div>
        <div class="firework-burst burst-3">🎇</div>
      </div>

      <!-- Clap Graphics Overlay -->
      <div *ngIf="presentation.showClap()" class="fx-overlay clap-anim">
        <div class="emoji-popup">👏 👏 👏</div>
      </div>

      <!-- Amen Graphics Overlay -->
      <div *ngIf="presentation.showAmen()" class="fx-overlay amen-anim">
        <div class="emoji-popup">🙏 ஆமென் 🙏</div>
      </div>

      <!-- Floating Church Name -->
      <div *ngIf="presentation.showFloatingChurch()" class="floating-church-banner">
        நல்ல சமாரியன் இயேசு ஜெப வீடு ✝
      </div>

      <!-- Bottom Floating Controls Bar (Fades out on idle) -->
      <div class="controls-bar" [class.hidden]="controlsHidden()">
        <button class="ctrl-btn" (click)="presentation.prevSlide()" title="Previous (Left Arrow)">◀</button>
        <div class="slide-indicator" (click)="showGotoPrompt()">
          {{ presentation.presentIdx() + 1 }} / {{ slideState.totalSlides() }}
        </div>
        <button class="ctrl-btn" (click)="presentation.nextSlide()" title="Next (Right Arrow / Space)">▶</button>
        <button class="ctrl-btn bookmark-toggle-btn" (click)="drawerOpen.update(v => !v)" title="Bookmarks Drawer">★</button>
        <button class="ctrl-btn exit-btn" (click)="presentation.exitPresent()" title="Exit (Esc)">✕</button>
      </div>

      <!-- Bookmarked Slides Drawer -->
      <div *ngIf="drawerOpen()" class="bookmarks-drawer">
        <div class="drawer-header">
          <span>Bookmarked Slides</span>
          <button class="close-drawer-btn" (click)="drawerOpen.set(false)">✕</button>
        </div>
        <div class="drawer-list">
          <div
            *ngFor="let item of slideState.bookmarkedSlides()"
            class="drawer-item"
            [class.active]="presentation.presentIdx() === item.index"
            (click)="jumpToSlide(item.index)"
          >
            <span class="item-index">{{ item.index + 1 }}</span>
            <span class="item-name">{{ item.slide.name }}</span>
          </div>
          <div *ngIf="slideState.bookmarkedSlides().length === 0" class="empty-drawer">
            No bookmarked slides.
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .presentation-overlay {
      position: fixed;
      inset: 0;
      background: #000;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
    }

    .present-iframe {
      width: 100vw;
      height: 100vh;
      border: none;
      display: block;
      background: #000;
    }

    /* Hotkey HUD Notification */
    .hotkey-detector {
      position: absolute;
      top: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(56, 189, 248, 0.4);
      color: #38bdf8;
      font-size: 18px;
      font-weight: 700;
      padding: 8px 24px;
      border-radius: 30px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
      pointer-events: none;
      z-index: 100000;
      animation: fadeInDown 0.2s ease;
    }

    @keyframes fadeInDown {
      from { opacity: 0; transform: translate(-50%, -15px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }

    .rainbow-fab {
      position: absolute;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.2);
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      z-index: 100000;
    }

    .rainbow-fab.active {
      background: rgba(56, 189, 248, 0.2);
      border-color: #38bdf8;
      box-shadow: 0 0 15px rgba(56, 189, 248, 0.6);
      transform: translateY(-50%) scale(1.1);
    }

    /* Graphics Overlays */
    .fx-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100001;
    }

    .emoji-popup {
      font-size: clamp(48px, 8vw, 120px);
      font-weight: 900;
      color: #fbbf24;
      text-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
      animation: popInOut 2.5s ease forwards;
    }

    @keyframes popInOut {
      0% { transform: scale(0.3); opacity: 0; }
      20% { transform: scale(1.1); opacity: 1; }
      80% { transform: scale(1); opacity: 1; }
      100% { transform: scale(0.8); opacity: 0; }
    }

    .fireworks-anim .firework-burst {
      position: absolute;
      font-size: 80px;
      animation: burstAnim 2.8s ease-out forwards;
    }
    .burst-1 { top: 25%; left: 30%; }
    .burst-2 { top: 40%; left: 70%; animation-delay: 0.3s; }
    .burst-3 { top: 60%; left: 45%; animation-delay: 0.6s; }

    @keyframes burstAnim {
      0% { transform: scale(0); opacity: 0; }
      30% { transform: scale(1.4); opacity: 1; }
      100% { transform: scale(2); opacity: 0; }
    }

    .floating-church-banner {
      position: absolute;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10, 15, 30, 0.9);
      border: 1px solid rgba(56, 189, 248, 0.5);
      border-radius: 30px;
      padding: 10px 28px;
      font-size: 24px;
      font-weight: 900;
      color: #38bdf8;
      font-family: 'Noto Serif Tamil', serif;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
      animation: floatBanner 3s ease-in-out infinite;
      z-index: 100000;
    }

    @keyframes floatBanner {
      0%, 100% { transform: translateX(-50%) translateY(0); }
      50% { transform: translateX(-50%) translateY(-10px); }
    }

    /* Floating Controls Bar */
    .controls-bar {
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(51, 65, 85, 0.8);
      border-radius: 40px;
      padding: 6px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
      transition: opacity 0.4s;
      z-index: 100000;
    }

    .controls-bar.hidden {
      opacity: 0;
      pointer-events: none;
    }

    .ctrl-btn {
      background: transparent;
      border: none;
      color: #cbd5e1;
      font-size: 16px;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 20px;
      transition: all 0.15s;
    }

    .ctrl-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }

    .slide-indicator {
      font-size: 13px;
      font-weight: 700;
      color: #38bdf8;
      cursor: pointer;
      padding: 4px 8px;
    }

    .exit-btn {
      color: #f87171;
    }

    /* Drawer */
    .bookmarks-drawer {
      position: absolute;
      left: 20px;
      top: 20px;
      bottom: 80px;
      width: 280px;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8);
      z-index: 100000;
    }

    .drawer-header {
      padding: 12px 14px;
      border-bottom: 1px solid #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #38bdf8;
      font-weight: 700;
      font-size: 13px;
    }

    .close-drawer-btn {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 14px;
    }

    .drawer-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .drawer-item {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 8px 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .drawer-item.active {
      background: #0284c7;
      border-color: #38bdf8;
    }

    .item-index {
      font-size: 11px;
      font-weight: 700;
      color: #38bdf8;
    }

    .drawer-item.active .item-index {
      color: #fff;
    }

    .item-name {
      font-size: 12px;
      color: #f8fafc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: 'Noto Serif Tamil', sans-serif;
    }

    .empty-drawer {
      color: #64748b;
      text-align: center;
      padding: 30px;
      font-size: 12px;
    }
  `]
})
export class PresentationOverlayComponent {
  @ViewChild('presentIframe') presentIframe!: ElementRef<HTMLIFrameElement>;

  controlsHidden = signal<boolean>(false);
  drawerOpen = signal<boolean>(false);
  private idleTimer: any = null;

  constructor(
    public presentation: PresentationService,
    public slideState: SlideStateService
  ) {
    // Re-render when current presentation slide changes
    effect(() => {
      if (this.presentation.isPresenting()) {
        const slide = this.presentation.currentSlide();
        if (slide) {
          this.renderPresentationSlide(slide.html);
        }
      }
    });

    // Apply / Remove Rainbow Sweep effect when rainbowActive toggles
    effect(() => {
      const isRainbow = this.presentation.rainbowActive();
      this.applyRainbowToIframe(isRainbow);
    });
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    this.presentation.handleKeyDown(e);
  }

  onMouseMove(): void {
    this.controlsHidden.set(false);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.controlsHidden.set(true);
    }, 3000);
  }

  private renderPresentationSlide(html: string): void {
    if (!this.presentIframe?.nativeElement) {
      setTimeout(() => this.renderPresentationSlide(html), 50);
      return;
    }
    const frame = this.presentIframe.nativeElement;
    frame.srcdoc = html;

    // After load, inject auto-fit and key handlers into iframe
    frame.onload = () => {
      try {
        const doc = frame.contentDocument;
        if (doc) {
          doc.addEventListener('keydown', (e) => this.presentation.handleKeyDown(e));
          if (this.presentation.rainbowActive()) {
            this.applyRainbowToIframe(true);
          }
        }
      } catch (_) {}
    };
  }

  private applyRainbowToIframe(active: boolean): void {
    const frame = this.presentIframe?.nativeElement;
    if (!frame) return;

    try {
      const doc = frame.contentDocument;
      if (!doc || !doc.body) return;

      if (active) {
        // Inject fast 1s sweep rainbow CSS
        if (!doc.getElementById('_rb_sweep_css')) {
          const style = doc.createElement('style');
          style.id = '_rb_sweep_css';
          style.textContent = `
            .rainbow-active {
              background-image: linear-gradient(90deg, white 0%, white 33%, #7ee8ff 38%, #ffdd57 43%, #72f5a8 48%, #a259ff 53%, white 58%, white 100%) !important;
              background-size: 300% auto !important;
              -webkit-background-clip: text !important;
              -webkit-text-fill-color: transparent !important;
              background-clip: text !important;
              color: transparent !important;
              text-shadow: none !important;
              animation: rainbowSweep 1s linear infinite !important;
            }
            @keyframes rainbowSweep {
              0%   { background-position: 100% center; }
              100% { background-position: 0% center; }
            }
          `;
          (doc.head || doc.documentElement).appendChild(style);
        }

        // Apply rainbow-active class to text elements
        doc.querySelectorAll('.verse-text, .verse-ref, #lyrics, #ref, .t1, .t2, h1, h2, p')
          .forEach(el => el.classList.add('rainbow-active'));
      } else {
        // Remove rainbow-active class
        doc.querySelectorAll('.rainbow-active')
          .forEach(el => el.classList.remove('rainbow-active'));
      }
    } catch (e) {
      console.warn('Rainbow iframe sync error:', e);
    }
  }

  jumpToSlide(index: number): void {
    this.presentation.goToSlide(index);
    this.drawerOpen.set(false);
  }

  showGotoPrompt(): void {
    const total = this.slideState.totalSlides();
    const val = prompt(`Go to slide (1 - ${total}):`, String(this.presentation.presentIdx() + 1));
    if (val) {
      const num = parseInt(val, 10);
      if (!isNaN(num) && num >= 1 && num <= total) {
        this.presentation.goToSlide(num - 1);
      }
    }
  }
}
