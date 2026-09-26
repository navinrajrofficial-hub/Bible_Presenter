import { Injectable, signal } from '@angular/core';
import { BIBLE_BOOKS, BibleBookInfo, BibleVerse } from '../models/bible.model';

@Injectable({
  providedIn: 'root'
})
export class BibleDataService {
  readonly books = signal<BibleBookInfo[]>(BIBLE_BOOKS);
  readonly selectedBook = signal<BibleBookInfo>(BIBLE_BOOKS[0]);
  readonly selectedChapter = signal<number>(1);
  readonly selectedVerses = signal<number[]>([]);
  readonly isLoaded = signal<boolean>(false);

  private bibleStore: Record<string, Record<number, Record<number, string>>> = {};

  constructor() {
    this.initBibleData();
  }

  private async initBibleData(): Promise<void> {
    try {
      // Check if global bibleData is available or fetch script
      if ((window as any).bibleData && Object.keys((window as any).bibleData).length > 0) {
        this.extractStore((window as any).bibleData);
        this.isLoaded.set(true);
        return;
      }

      // Load bible_content.js dynamically
      await this.loadScript('data/bible_content.js');
      if ((window as any).bibleData) {
        this.extractStore((window as any).bibleData);
      }
    } catch (e) {
      console.warn('Could not load bible content script:', e);
    } finally {
      this.isLoaded.set(true);
    }
  }

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Initialize global container if needed
      if (!(window as any).bibleData) {
        (window as any).bibleData = {};
        BIBLE_BOOKS.forEach(b => {
          (window as any).bibleData[b.name] = { chapters: b.chapters, versesPerChapter: [] };
        });
      }

      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
  }

  private extractStore(rawBibleData: any): void {
    for (const [bookName, bookData] of Object.entries(rawBibleData) as [string, any][]) {
      if (bookData && bookData.content) {
        this.bibleStore[bookName] = bookData.content;
      }
    }
  }

  selectBook(book: BibleBookInfo): void {
    this.selectedBook.set(book);
    this.selectedChapter.set(1);
    this.selectedVerses.set([]);
  }

  selectChapter(chapter: number): void {
    this.selectedChapter.set(chapter);
    this.selectedVerses.set([]);
  }

  toggleVerseSelection(verseNum: number): void {
    this.selectedVerses.update(current => {
      if (current.includes(verseNum)) {
        return current.filter(v => v !== verseNum);
      } else {
        return [...current, verseNum].sort((a, b) => a - b);
      }
    });
  }

  selectAllVersesInChapter(): void {
    const verses = this.getVersesForCurrentChapter();
    const allNums = verses.map(v => v.verse);
    this.selectedVerses.set(allNums);
  }

  clearVerseSelection(): void {
    this.selectedVerses.set([]);
  }

  getVersesForCurrentChapter(): BibleVerse[] {
    const book = this.selectedBook();
    const ch = this.selectedChapter();
    return this.getVerses(book.name, ch);
  }

  getVerses(bookName: string, chapter: number): BibleVerse[] {
    const bookContent = this.bibleStore[bookName];
    if (!bookContent || !bookContent[chapter]) return [];

    const chapterContent = bookContent[chapter];
    const verses: BibleVerse[] = [];

    const keys = Object.keys(chapterContent).map(Number).sort((a, b) => a - b);
    for (const vNum of keys) {
      verses.push({
        book: bookName,
        chapter,
        verse: vNum,
        text: chapterContent[vNum] || ''
      });
    }
    return verses;
  }

  getVerseText(bookName: string, chapter: number, verse: number): string {
    return this.bibleStore[bookName]?.[chapter]?.[verse] || '';
  }

  searchBooks(query: string): BibleBookInfo[] {
    if (!query || !query.trim()) return this.books();
    const q = query.trim().toLowerCase();
    return this.books().filter(b => 
      b.name.toLowerCase().includes(q) ||
      b.en.toLowerCase().includes(q) ||
      b.tg.toLowerCase().includes(q) ||
      (b.alt && b.alt.toLowerCase().includes(q))
    );
  }
}
