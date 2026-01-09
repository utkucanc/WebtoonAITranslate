
export interface TextRegion {
  id: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
  originalText: string;
  translatedText: string;
  order: number;
}

export interface WebtoonImage {
  id: string;
  file: File;
  previewUrl: string;
  regions: TextRegion[];
  isProcessing: boolean;
  status: 'idle' | 'detecting' | 'translating' | 'done' | 'error';
  height?: number; // Birleştirme için orijinal yükseklik
  width?: number; // Birleştirme için orijinal genişlik
}

export enum AppMode {
  UPLOAD = 'UPLOAD',
  MERGED_EDITOR = 'MERGED_EDITOR'
}

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ko', name: 'Korean' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' }
];
