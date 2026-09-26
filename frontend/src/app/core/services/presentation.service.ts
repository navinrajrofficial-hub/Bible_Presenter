import { Injectable, signal, computed } from '@angular/core';
import { SlideStateService } from './slide-state.service';

export interface HotkeyNotification {
  message: string;
  icon?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PresentationService {
  readonly isPresenting = signal<boolean>(false);
  readonly presentIdx = signal<number>(0);
  readonly rainbowActive = signal<boolean>(false);
  readonly hotkeyNotification = signal<HotkeyNotification | null>(null);

  // Graphics overlay triggers
  readonly showClap = signal<boolean>(false);
  readonly showAmen = signal<boolean>(false);
  readonly showFireworks = signal<boolean>(false);
  readonly showFloatingChurch = signal<boolean>(false);

  private notificationTimer: any = null;

  readonly currentSlide = computed(() => {
    const slides = this.slideState.slides();
    const idx = this.presentIdx();
    return slides[idx] || null;
  });

  constructor(private slideState: SlideStateService) {}

  startPresent(startIndex?: number): void {
    const total = this.slideState.totalSlides();
    if (total === 0) return;

    const idx = typeof startIndex === 'number'
      ? Math.max(0, Math.min(startIndex, total - 1))
      : this.slideState.currentIdx();

    this.presentIdx.set(idx);
    this.isPresenting.set(true);
    this.rainbowActive.set(false);

    // Request browser fullscreen if available
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (_) {}
  }

  exitPresent(): void {
    this.isPresenting.set(false);
    this.rainbowActive.set(false);

    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (_) {}
  }

  nextSlide(): void {
    const total = this.slideState.totalSlides();
    if (this.presentIdx() < total - 1) {
      this.presentIdx.update(i => i + 1);
      this.rainbowActive.set(false);
    }
  }

  prevSlide(): void {
    if (this.presentIdx() > 0) {
      this.presentIdx.update(i => i - 1);
      this.rainbowActive.set(false);
    }
  }

  goToSlide(index: number): void {
    const total = this.slideState.totalSlides();
    if (index >= 0 && index < total) {
      this.presentIdx.set(index);
      this.rainbowActive.set(false);
    }
  }

  toggleRainbow(): void {
    this.rainbowActive.update(v => !v);
    this.showHotkey('G - Rainbow Sweep');
  }

  triggerClap(): void {
    this.showClap.set(true);
    this.showHotkey('C - Clap 👏');
    setTimeout(() => this.showClap.set(false), 2500);
  }

  triggerAmen(): void {
    this.showAmen.set(true);
    this.showHotkey('A - Amen 🙏');
    setTimeout(() => this.showAmen.set(false), 2500);
  }

  triggerFireworks(): void {
    this.showFireworks.set(true);
    this.showHotkey('F - Fireworks 🎆');
    setTimeout(() => this.showFireworks.set(false), 3000);
  }

  toggleFloatingChurch(): void {
    this.showFloatingChurch.update(v => !v);
    this.showHotkey('L - Floating Church ⛪');
  }

  showHotkey(message: string): void {
    this.hotkeyNotification.set({ message });
    if (this.notificationTimer) clearTimeout(this.notificationTimer);
    this.notificationTimer = setTimeout(() => {
      this.hotkeyNotification.set(null);
    }, 1000);
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (!this.isPresenting()) return;

    // Avoid triggering when focused on input/textarea
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      if (event.key === 'Escape') target.blur();
      return;
    }

    const key = event.key.toLowerCase();

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      this.nextSlide();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.prevSlide();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.exitPresent();
    } else if (key === 'g') {
      event.preventDefault();
      this.toggleRainbow();
    } else if (key === 'c') {
      this.triggerClap();
    } else if (key === 'a') {
      this.triggerAmen();
    } else if (key === 'f' || key === 's') {
      this.triggerFireworks();
    } else if (key === 'l') {
      this.toggleFloatingChurch();
    }
  }
}
