export type SlideType = 'html' | 'text' | 'media' | 'bible' | 'song' | 'custom';

export interface Slide {
  id: string | number;
  type: SlideType;
  name: string;
  html: string;
  bookmarked?: boolean;
  rawText?: string;
  refText?: string;
  background?: string;
  color?: string;
  metadata?: Record<string, any>;
}

export interface TextSlideConfig {
  title: string;
  body: string;
  bgColor: string;
  textColor: string;
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  fontFamily?: string;
}

export interface MediaSlideConfig {
  type: 'image' | 'video';
  url: string;
  caption?: string;
  loop?: boolean;
  muted?: boolean;
}

export interface PresentationExport {
  version: string;
  exportedAt: string;
  title?: string;
  slides: Slide[];
}
