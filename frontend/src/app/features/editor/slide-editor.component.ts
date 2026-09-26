import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SlideStateService } from '../../core/services/slide-state.service';
import { Slide } from '../../core/models/slide.model';

@Component({
  selector: 'app-slide-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="slide-editor">
      <!-- Editor Mode Tabs -->
      <div class="mode-tabs">
        <button
          class="mode-btn"
          [class.active]="activeTab() === 'templates'"
          (click)="activeTab.set('templates')"
        >
          ✨ 3D & Templates
        </button>
        <button
          class="mode-btn"
          [class.active]="activeTab() === 'text'"
          (click)="activeTab.set('text')"
        >
          📝 Text Slide
        </button>
        <button
          class="mode-btn"
          [class.active]="activeTab() === 'html'"
          (click)="activeTab.set('html')"
        >
          💻 Custom HTML
        </button>
      </div>

      <!-- Tab 1: Templates & 3D Church Title -->
      <div *ngIf="activeTab() === 'templates'" class="templates-view">
        <div class="templates-grid">
          <!-- 1. 3D Church Title -->
          <div class="template-card" (click)="add3DChurchTitleSlide()">
            <div class="tpl-preview tpl-3d">
              <span class="tpl-icon">✝</span>
              <div class="tpl-title">3D Church Title</div>
            </div>
            <div class="tpl-meta">
              <strong>நல்ல சமாரியன் இயேசு ஜெப வீடு</strong>
              <p>Realistic 3D rotating cross with white grid and blue typography</p>
            </div>
          </div>

          <!-- 2. Announcement (அறிவிப்பு) -->
          <div class="template-card" (click)="addAnnouncementSlide()">
            <div class="tpl-preview tpl-announce">
              <span class="tpl-icon">📣</span>
              <div class="tpl-title">அறிவிப்பு (Announcement)</div>
            </div>
            <div class="tpl-meta">
              <strong>கவனியுங்கள் • Please Note</strong>
              <p>Sky blue radiant announcement slide</p>
            </div>
          </div>

          <!-- 3. Offering (காணிக்கை) -->
          <div class="template-card" (click)="addOfferingSlide()">
            <div class="tpl-preview tpl-offering">
              <span class="tpl-icon">🎁</span>
              <div class="tpl-title">காணிக்கை நேரம் (Offering)</div>
            </div>
            <div class="tpl-meta">
              <strong>உற்சாகமாய் கொடுக்கிறவனிடத்தில்...</strong>
              <p>Gold luxury offering slide with particles</p>
            </div>
          </div>

          <!-- 4. Thanks / நன்றி -->
          <div class="template-card" (click)="addThanksSlide()">
            <div class="tpl-preview tpl-thanks">
              <span class="tpl-icon">🙏</span>
              <div class="tpl-title">நன்றி (Thank You)</div>
            </div>
            <div class="tpl-meta">
              <strong>கர்த்தர் உங்களை ஆசீர்வதிப்பாராக</strong>
              <p>End of service blessing slide</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: Text Slide Builder -->
      <div *ngIf="activeTab() === 'text'" class="text-editor-view">
        <div class="form-group">
          <label>Slide Title / Topic</label>
          <input
            type="text"
            class="form-input"
            placeholder="e.g. சிறப்பு செய்தி / Special Notice"
            [ngModel]="textTitle()"
            (ngModelChange)="textTitle.set($event)"
          />
        </div>

        <div class="form-group">
          <label>Slide Content (Main Text)</label>
          <textarea
            class="form-textarea"
            rows="6"
            placeholder="Type your Tamil or English message here..."
            [ngModel]="textContent()"
            (ngModelChange)="textContent.set($event)"
          ></textarea>
        </div>

        <div class="form-row">
          <div class="form-group half">
            <label>Background Theme</label>
            <select class="form-select" [ngModel]="bgTheme()" (ngModelChange)="bgTheme.set($event)">
              <option value="royal-blue">Royal Blue Dark</option>
              <option value="deep-purple">Deep Purple Midnight</option>
              <option value="emerald-green">Emerald Green</option>
              <option value="crimson-gold">Crimson & Gold</option>
              <option value="clean-white">White Minimal</option>
            </select>
          </div>
          <div class="form-group half">
            <label>Alignment</label>
            <select class="form-select" [ngModel]="textAlign()" (ngModelChange)="textAlign.set($event)">
              <option value="center">Center</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
        </div>

        <button class="add-slide-btn" (click)="createCustomTextSlide()">
          + Add Text Slide
        </button>
      </div>

      <!-- Tab 3: Custom HTML -->
      <div *ngIf="activeTab() === 'html'" class="html-editor-view">
        <div class="form-group">
          <label>Slide Name</label>
          <input
            type="text"
            class="form-input"
            placeholder="e.g. Custom Welcome Screen"
            [ngModel]="htmlSlideName()"
            (ngModelChange)="htmlSlideName.set($event)"
          />
        </div>

        <div class="form-group flex-1">
          <label>Raw HTML Code</label>
          <textarea
            class="form-textarea code-area"
            rows="10"
            placeholder="<div>...</div>"
            [ngModel]="htmlCode()"
            (ngModelChange)="htmlCode.set($event)"
          ></textarea>
        </div>

        <button class="add-slide-btn" (click)="createCustomHtmlSlide()">
          + Add HTML Slide
        </button>
      </div>
    </div>
  `,
  styles: [`
    .slide-editor {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #0f172a;
      color: #f8fafc;
      padding: 14px;
      gap: 12px;
      overflow-y: auto;
      font-family: system-ui, sans-serif;
    }

    .mode-tabs {
      display: flex;
      gap: 8px;
      background: #1e293b;
      padding: 4px;
      border-radius: 8px;
      border: 1px solid #334155;
    }

    .mode-btn {
      flex: 1;
      background: transparent;
      border: none;
      color: #94a3b8;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    .mode-btn.active {
      background: #0284c7;
      color: #fff;
    }

    .templates-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }

    .template-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      overflow: hidden;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      flex-direction: column;
    }

    .template-card:hover {
      border-color: #38bdf8;
      transform: translateY(-2px);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
    }

    .tpl-preview {
      height: 100px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      color: #fff;
    }

    .tpl-icon {
      font-size: 32px;
    }

    .tpl-title {
      font-size: 12px;
      font-weight: 700;
    }

    .tpl-3d {
      background: linear-gradient(135deg, #f8f9fc 0%, #e2e8f0 100%);
      color: #0284c7;
    }

    .tpl-announce {
      background: linear-gradient(135deg, #0e2257 0%, #1a4a8a 50%, #5299d3 100%);
    }

    .tpl-offering {
      background: linear-gradient(135deg, #1c1917 0%, #78350f 50%, #d97706 100%);
    }

    .tpl-thanks {
      background: linear-gradient(135deg, #0f172a 0%, #312e81 50%, #4338ca 100%);
    }

    .tpl-meta {
      padding: 10px 12px;
    }

    .tpl-meta strong {
      display: block;
      font-size: 13px;
      color: #f1f5f9;
      margin-bottom: 2px;
      font-family: 'Noto Serif Tamil', serif;
    }

    .tpl-meta p {
      font-size: 11px;
      color: #94a3b8;
      margin: 0;
    }

    .text-editor-view, .html-editor-view {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group.half {
      flex: 1;
    }

    .form-row {
      display: flex;
      gap: 10px;
    }

    label {
      font-size: 12px;
      font-weight: 600;
      color: #cbd5e1;
    }

    .form-input, .form-select, .form-textarea {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 8px 12px;
      color: #f8fafc;
      font-size: 13px;
      outline: none;
      font-family: inherit;
    }

    .form-textarea {
      resize: vertical;
      font-family: 'Noto Serif Tamil', system-ui, sans-serif;
    }

    .code-area {
      font-family: monospace;
      font-size: 12px;
    }

    .form-input:focus, .form-select:focus, .form-textarea:focus {
      border-color: #38bdf8;
    }

    .add-slide-btn {
      background: linear-gradient(135deg, #0284c7, #0369a1);
      border: 1px solid #38bdf8;
      color: #fff;
      padding: 10px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 6px;
    }
  `]
})
export class SlideEditorComponent {
  activeTab = signal<'templates' | 'text' | 'html'>('templates');

  textTitle = signal<string>('அறிவிப்பு');
  textContent = signal<string>('ஞாயிறு ஆராதனை காலை 8:30 மணிக்கு நடைபெறும்.\nஅனைவரும் தவறாமல் கலந்துகொள்ளவும்.');
  bgTheme = signal<string>('royal-blue');
  textAlign = signal<string>('center');

  htmlSlideName = signal<string>('Custom Template');
  htmlCode = signal<string>(`<div style="display:flex;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg,#0a192f,#020c1b);color:#64ffda;font-family:'Noto Serif Tamil',serif;padding:4vw;text-align:center;">
  <h1 style="font-size:48px;">வரவேற்கிறோம்</h1>
</div>`);

  constructor(private slideState: SlideStateService) {}

  add3DChurchTitleSlide(): void {
    // Inject the refined 3D church title
    fetch('templates/church_3d.html')
      .then(res => res.text())
      .then(html => {
        this.slideState.addSlide({
          id: `3d-${Date.now()}`,
          type: 'html',
          name: '3D நல்ல சமாரியன் இயேசு ஜெப வீடு',
          html,
          bookmarked: true
        });
      })
      .catch(() => {
        this.slideState.addSlide({
          id: `3d-${Date.now()}`,
          type: 'html',
          name: '3D நல்ல சமாரியன் இயேசு ஜெப வீடு',
          html: `<iframe src="templates/church_3d.html" style="width:100%;height:100%;border:none;"></iframe>`,
          bookmarked: true
        });
      });
  }

  addAnnouncementSlide(): void {
    const html = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:linear-gradient(170deg,#05102a 0%,#0e2257 26%,#1a4a8a 54%,#5299d3 82%,#ffffff 100%);color:#0a2a6e;font-family:'Noto Serif Tamil',serif;padding:4vh 6vw;text-align:center;">
      <div style="font-size:clamp(32px,4vw,60px);margin-bottom:1vh;">📣</div>
      <h1 style="font-size:clamp(60px,10vw,140px);font-weight:900;letter-spacing:6px;margin:0 0 1vh 0;color:#0a2a6e;">அறிவிப்பு</h1>
      <p style="font-size:clamp(22px,3vw,44px);color:#1a4fbb;font-weight:700;margin:0;">கவனியுங்கள் • Please Note</p>
    </div>`;

    this.slideState.addSlide({
      id: `ann-${Date.now()}`,
      type: 'html',
      name: 'அறிவிப்பு (Announcement)',
      html,
      bookmarked: true
    });
  }

  addOfferingSlide(): void {
    const html = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:linear-gradient(180deg,#1c1917 0%,#0c0a09 100%);color:#fef08a;font-family:'Noto Serif Tamil',serif;padding:4vh 6vw;text-align:center;">
      <div style="font-size:clamp(36px,5vw,70px);margin-bottom:1vh;">🎁</div>
      <h1 style="font-size:clamp(50px,8vw,110px);font-weight:900;letter-spacing:4px;margin:0 0 2vh 0;background:linear-gradient(90deg,#fef08a,#ca8a04,#fef08a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">காணிக்கை நேரம்</h1>
      <p style="font-size:clamp(20px,2.5vw,36px);color:#fde047;font-style:italic;max-width:85vw;">"உற்சாகமாய் கொடுக்கிறவனிடத்தில் தேவன் பிரியமாயிருக்கிறார்" — 2 கொரிந்தியர் 9:7</p>
    </div>`;

    this.slideState.addSlide({
      id: `offering-${Date.now()}`,
      type: 'html',
      name: 'காணிக்கை நேரம் (Offering)',
      html,
      bookmarked: true
    });
  }

  addThanksSlide(): void {
    const html = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:linear-gradient(135deg,#030712 0%,#1e1b4b 50%,#0f172a 100%);color:#e0e7ff;font-family:'Noto Serif Tamil',serif;padding:4vh 6vw;text-align:center;">
      <div style="font-size:clamp(36px,5vw,70px);margin-bottom:1vh;">🙏</div>
      <h1 style="font-size:clamp(55px,9vw,120px);font-weight:900;letter-spacing:4px;margin:0 0 2vh 0;color:#818cf8;">நன்றி</h1>
      <p style="font-size:clamp(22px,3vw,42px);color:#c7d2fe;font-weight:700;">கர்த்தர் உங்களை ஆசீர்வதிப்பாராக!</p>
    </div>`;

    this.slideState.addSlide({
      id: `thanks-${Date.now()}`,
      type: 'html',
      name: 'நன்றி (Thank You)',
      html,
      bookmarked: true
    });
  }

  createCustomTextSlide(): void {
    const title = this.textTitle().trim();
    const body = this.textContent().trim().replace(/\n/g, '<br>');
    const align = this.textAlign();

    const themes: Record<string, string> = {
      'royal-blue': 'linear-gradient(180deg,#0b0f26 0%,#111936 52%,#1a2647 100%)',
      'deep-purple': 'linear-gradient(135deg,#1e1035 0%,#0d041a 100%)',
      'emerald-green': 'linear-gradient(135deg,#064e3b 0%,#022c22 100%)',
      'crimson-gold': 'linear-gradient(135deg,#450a0a 0%,#1c0303 100%)',
      'clean-white': 'linear-gradient(135deg,#ffffff 0%,#f1f5f9 100%)'
    };

    const isWhite = this.bgTheme() === 'clean-white';
    const textColor = isWhite ? '#0f172a' : '#f8fafc';
    const titleColor = isWhite ? '#0284c7' : '#38bdf8';
    const bg = themes[this.bgTheme()] || themes['royal-blue'];

    const html = `<div style="display:flex;flex-direction:column;justify-content:center;height:100%;background:${bg};color:${textColor};font-family:'Noto Serif Tamil',serif;padding:4vh 6vw;text-align:${align};">
      ${title ? `<h2 style="font-size:clamp(32px,5vw,64px);font-weight:900;color:${titleColor};margin-bottom:2vh;">${title}</h2>` : ''}
      <div style="font-size:clamp(24px,3.5vw,48px);line-height:1.5;white-space:pre-wrap;">${body}</div>
    </div>`;

    this.slideState.addSlide({
      id: `text-${Date.now()}`,
      type: 'text',
      name: title || 'Text Slide',
      html,
      rawText: this.textContent()
    });
  }

  createCustomHtmlSlide(): void {
    const name = this.htmlSlideName().trim() || 'Custom HTML';
    const html = this.htmlCode().trim();

    this.slideState.addSlide({
      id: `html-${Date.now()}`,
      type: 'html',
      name,
      html
    });
  }
}
