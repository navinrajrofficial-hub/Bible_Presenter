import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SlideStateService } from '../../core/services/slide-state.service';
import { PresentationService } from '../../core/services/presentation.service';

export type ActiveTab = 'bible' | 'songs' | 'history' | 'editor';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="app-header">
      <!-- Brand / Church Title -->
      <div class="brand-group">
        <span class="brand-icon">🙏</span>
        <div class="brand-text">
          <h1 class="brand-title">Bible Presenter</h1>
          <span class="brand-sub">நல்ல சமாரியன் இயேசு ஜெப வீடு</span>
        </div>
      </div>

      <!-- Center Feature Tabs -->
      <nav class="feature-tabs">
        <button
          class="tab-btn"
          [class.active]="activeTab === 'bible'"
          (click)="selectTab('bible')"
        >
          <span class="tab-icon">📖</span>
          <span class="tab-label">பரிசுத்த வேதாகமம்</span>
        </button>

        <button
          class="tab-btn"
          [class.active]="activeTab === 'songs'"
          (click)="selectTab('songs')"
        >
          <span class="tab-icon">🎵</span>
          <span class="tab-label">பாடல் புத்தகம்</span>
        </button>

        <button
          class="tab-btn history-tab-btn"
          [class.active]="activeTab === 'history'"
          (click)="selectTab('history')"
          title="Manage & choose song history files"
        >
          <span class="tab-icon">📜</span>
          <span class="tab-label">பாடல் வரலாறு (History)</span>
          <span class="badge-new">Dedicated</span>
        </button>

        <button
          class="tab-btn"
          [class.active]="activeTab === 'editor'"
          (click)="selectTab('editor')"
        >
          <span class="tab-icon">✨</span>
          <span class="tab-label">3D & Templates</span>
        </button>
      </nav>

      <!-- Right Action Controls -->
      <div class="header-actions">
        <!-- Import Presentation -->
        <label class="action-btn" title="Import saved presentation (.json / .prsn)">
          <input type="file" accept=".json,.prsn" (change)="onImportFile($event)" hidden />
          <span>⬆ Import</span>
        </label>

        <!-- Export Presentation -->
        <button class="action-btn" (click)="exportPresentation()" title="Export current presentation">
          <span>⬇ Export</span>
        </button>

        <!-- Start Presentation Fullscreen -->
        <button class="present-btn" (click)="presentation.startPresent()" title="Start Fullscreen Presentation">
          <span>▶ Present</span>
        </button>
      </div>
    </header>
  `,
  styles: [`
    .app-header {
      height: 60px;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      color: #f8fafc;
      font-family: system-ui, sans-serif;
      z-index: 100;
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 220px;
    }

    .brand-icon {
      font-size: 24px;
    }

    .brand-text {
      display: flex;
      flex-direction: column;
    }

    .brand-title {
      font-size: 15px;
      font-weight: 800;
      color: #38bdf8;
      margin: 0;
      line-height: 1.2;
    }

    .brand-sub {
      font-size: 11px;
      color: #94a3b8;
      font-family: 'Noto Serif Tamil', serif;
    }

    .feature-tabs {
      display: flex;
      gap: 6px;
      background: #0b1329;
      padding: 4px;
      border-radius: 10px;
      border: 1px solid #1e293b;
    }

    .tab-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: none;
      color: #94a3b8;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      font-family: 'Noto Serif Tamil', system-ui, sans-serif;
    }

    .tab-btn:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.05);
    }

    .tab-btn.active {
      background: #0284c7;
      color: #fff;
      box-shadow: 0 0 10px rgba(2, 132, 199, 0.4);
    }

    .badge-new {
      font-size: 9px;
      background: #38bdf8;
      color: #0f172a;
      padding: 1px 5px;
      border-radius: 10px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .action-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
    }

    .action-btn:hover {
      background: #334155;
      color: #fff;
      border-color: #64748b;
    }

    .present-btn {
      background: linear-gradient(135deg, #10b981, #059669);
      border: 1px solid #34d399;
      color: #fff;
      padding: 6px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
      transition: all 0.2s;
    }

    .present-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 0 18px rgba(16, 185, 129, 0.6);
    }
  `]
})
export class HeaderComponent {
  @Input() activeTab: ActiveTab = 'bible';
  @Output() tabChange = new EventEmitter<ActiveTab>();

  constructor(
    public slideState: SlideStateService,
    public presentation: PresentationService
  ) {}

  selectTab(tab: ActiveTab): void {
    this.tabChange.emit(tab);
  }

  exportPresentation(): void {
    const json = this.slideState.exportPresentation('Sunday Worship Service');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `presentation_${new Date().toISOString().slice(0, 10)}.prsn`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        const mode = confirm('Click OK to REPLACE current slides, or CANCEL to APPEND to existing slides.')
          ? 'replace'
          : 'append';
        this.slideState.importPresentation(content, mode);
      }
    };
    reader.readAsText(file);
    input.value = '';
  }
}
