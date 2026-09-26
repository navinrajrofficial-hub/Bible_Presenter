import { Injectable, signal, computed, effect } from '@angular/core';
import { Slide, PresentationExport } from '../models/slide.model';

const STORAGE_KEY = 'bp_presentation_slides_v2';
const HISTORY_LIMIT = 30;

@Injectable({
  providedIn: 'root'
})
export class SlideStateService {
  // Signals
  readonly slides = signal<Slide[]>([]);
  readonly currentIdx = signal<number>(0);
  readonly isPresenting = signal<boolean>(false);
  readonly presentIdx = signal<number>(0);

  // Undo / Redo stacks
  private undoStack: Slide[][] = [];
  private redoStack: Slide[][] = [];

  // Computed signals
  readonly currentSlide = computed(() => {
    const list = this.slides();
    const idx = this.currentIdx();
    return list[idx] || null;
  });

  readonly totalSlides = computed(() => this.slides().length);

  readonly bookmarkedSlides = computed(() => {
    return this.slides()
      .map((s, index) => ({ slide: s, index }))
      .filter(item => item.slide.bookmarked);
  });

  constructor() {
    this.loadFromStorage();

    // Auto-persist on state change
    effect(() => {
      const current = this.slides();
      this.saveToStorage(current);
    });
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.slides.set(parsed);
          return;
        }
      }
    } catch (e) {
      console.warn('Could not restore slides from storage:', e);
    }
    // Default welcome slide
    this.slides.set([
      {
        id: 'welcome-1',
        type: 'html',
        name: 'நல்ல சமாரியன் இயேசு ஜெப வீடு',
        html: `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg,#0a192f,#020c1b);color:#64ffda;font-family:'Noto Serif Tamil',serif;text-align:center;padding:4vw;">
          <h1 style="font-size:clamp(36px,5vw,72px);margin-bottom:2vh;font-weight:900;">நல்ல சமாரியன் இயேசு ஜெப வீடு</h1>
          <p style="font-size:clamp(20px,2.5vw,36px);color:#ccd6f6;font-style:italic;">என்னுடைய வீடு ஜெபவீடு என்னப்படும் — மத்தேயு 21:13</p>
        </div>`,
        bookmarked: true
      }
    ]);
  }

  private saveToStorage(slides: Slide[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slides));
    } catch (e) {
      console.warn('Failed to save slides to storage:', e);
    }
  }

  private pushUndo(): void {
    this.undoStack.push(JSON.parse(JSON.stringify(this.slides())));
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(): void {
    if (this.undoStack.length === 0) return;
    const prev = this.undoStack.pop()!;
    this.redoStack.push(JSON.parse(JSON.stringify(this.slides())));
    this.slides.set(prev);
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop()!;
    this.undoStack.push(JSON.parse(JSON.stringify(this.slides())));
    this.slides.set(next);
  }

  addSlide(slide: Slide, index?: number): void {
    this.pushUndo();
    this.slides.update(list => {
      const copy = [...list];
      const targetIdx = typeof index === 'number' && index >= 0 && index <= copy.length
        ? index
        : copy.length;
      copy.splice(targetIdx, 0, slide);
      return copy;
    });
    if (typeof index === 'number') {
      this.currentIdx.set(index);
    } else {
      this.currentIdx.set(this.slides().length - 1);
    }
  }

  addSlides(newSlides: Slide[], atBeginning = false): void {
    if (newSlides.length === 0) return;
    this.pushUndo();
    this.slides.update(list => atBeginning ? [...newSlides, ...list] : [...list, ...newSlides]);
  }

  updateSlide(index: number, updated: Partial<Slide>): void {
    this.pushUndo();
    this.slides.update(list => {
      if (index < 0 || index >= list.length) return list;
      const copy = [...list];
      copy[index] = { ...copy[index], ...updated };
      return copy;
    });
  }

  removeSlide(index: number): void {
    this.pushUndo();
    this.slides.update(list => {
      if (index < 0 || index >= list.length) return list;
      const copy = list.filter((_, i) => i !== index);
      return copy;
    });
    if (this.currentIdx() >= this.slides().length) {
      this.currentIdx.set(Math.max(0, this.slides().length - 1));
    }
  }

  removeSlideRange(startIndex: number, endIndex: number): void {
    this.pushUndo();
    this.slides.update(list => {
      return list.filter((_, i) => i < startIndex || i > endIndex);
    });
    this.currentIdx.set(Math.min(startIndex, Math.max(0, this.slides().length - 1)));
  }

  reorderSlides(previousIndex: number, currentIndex: number): void {
    this.pushUndo();
    this.slides.update(list => {
      const copy = [...list];
      const [moved] = copy.splice(previousIndex, 1);
      copy.splice(currentIndex, 0, moved);
      return copy;
    });
    this.currentIdx.set(currentIndex);
  }

  toggleBookmark(index: number): void {
    this.slides.update(list => {
      if (index < 0 || index >= list.length) return list;
      const copy = [...list];
      copy[index] = { ...copy[index], bookmarked: !copy[index].bookmarked };
      return copy;
    });
  }

  clearAllSlides(): void {
    this.pushUndo();
    this.slides.set([]);
    this.currentIdx.set(0);
  }

  exportPresentation(title = 'Sunday Service'): string {
    const data: PresentationExport = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      title,
      slides: this.slides()
    };
    return JSON.stringify(data, null, 2);
  }

  importPresentation(jsonString: string, mode: 'replace' | 'append' = 'replace'): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      const importedSlides: Slide[] = Array.isArray(parsed)
        ? parsed
        : (parsed && Array.isArray(parsed.slides) ? parsed.slides : []);

      if (importedSlides.length === 0) return false;

      this.pushUndo();
      if (mode === 'replace') {
        this.slides.set(importedSlides);
        this.currentIdx.set(0);
      } else {
        this.slides.update(current => [...current, ...importedSlides]);
      }
      return true;
    } catch (e) {
      console.error('Failed to parse presentation JSON:', e);
      return false;
    }
  }
}
