import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent, ActiveTab } from './shared/components/header.component';
import { SlideListComponent } from './features/slides/slide-list.component';
import { SlidePreviewComponent } from './features/preview/slide-preview.component';
import { BiblePanelComponent } from './features/bible/bible-panel.component';
import { SongPanelComponent } from './features/songs/song-panel.component';
import { SongHistoryManagerComponent } from './features/song-history/song-history-manager.component';
import { SlideEditorComponent } from './features/editor/slide-editor.component';
import { PresentationOverlayComponent } from './features/presentation/presentation-overlay.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    SlideListComponent,
    SlidePreviewComponent,
    BiblePanelComponent,
    SongPanelComponent,
    SongHistoryManagerComponent,
    SlideEditorComponent,
    PresentationOverlayComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  activeTab = signal<ActiveTab>('bible');

  onTabChange(tab: ActiveTab): void {
    this.activeTab.set(tab);
  }
}
