export type LanguageGroup = 'western' | 'eastern' | 'slavic';

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  group: LanguageGroup;
  flag: string;
  webSpeechLang: string; // BCP 47 tag
  sampleHeadline: string;
  sampleScript: string;
  sampleTicker: string;
}

export interface AnchorProfile {
  id: string;
  name: string;
  role: string;
  gender: 'male' | 'female';
  tone: string;
  avatarType: 'preset' | 'custom';
  avatarStyle: 'marco' | 'elena' | 'kenji' | 'svetlana' | 'amira';
  customImageUrl?: string;
  // Calibration for custom photo
  mouthPosition?: { x: number; y: number; scale: number };
  accentColor: string;
}

export interface StudioBackground {
  id: string;
  name: string;
  category: 'preset' | 'chroma' | 'custom';
  url: string;
  chromaColor?: string;
  description: string;
}

export interface PipGraphic {
  enabled: boolean;
  imageUrl: string;
  topicTag: string;
  position: 'top-right' | 'top-left';
}

export interface LowerThirdConfig {
  enabled: boolean;
  category: string;
  headline: string;
  subheadline: string;
  anchorName: string;
  anchorTitle: string;
  showLiveBadge: boolean;
  style: 'breaking' | 'standard' | 'economic' | 'minimal';
}

export interface TickerConfig {
  enabled: boolean;
  speed: number; // seconds for full marquee pass
  text: string;
  label: string;
  bgStyle: 'red' | 'black' | 'blue' | 'yellow' | 'navy';
  fontSize: 'gigantic' | 'huge' | 'large' | 'standard';
}

export interface ChannelWatermark {
  enabled: boolean;
  text: string;
  subtext: string;
  position: 'top-right' | 'top-left';
}

export interface EndCreditsConfig {
  enabled: boolean;
  edition: string;
  director: string;
  production: string;
  audioTech: string;
  customNotes: string;
  durationSec: number; // Duration to roll credits at the end of video (seconds)
}

export interface BroadcastState {
  currentAnchorId: string;
  currentBgId: string;
  customBgUrl: string | null;
  selectedLanguage: string;
  scriptText: string;
  selectedVoiceURI: string;
  voicePitch?: number;
  voiceRate?: number;
  pip: PipGraphic;
  lowerThird: LowerThirdConfig;
  ticker: TickerConfig;
  watermark: ChannelWatermark;
  deskOverlay: boolean;
  cameraZoom: 'normal' | 'close' | 'wide' | 'extreme-close';
  avatarScale: number; // Multiplier from 1.5 to 3.5 (default 2.3)
  avatarPositionY: number; // Offset Y in px (-150 to 150)
  avatarPositionX: number; // Offset X in px (-200 to 200)
  endCredits: EndCreditsConfig;
  showCreditsNow: boolean;
}

export interface VisemeMetrics {
  openness: number; // 0 (closed) to 1 (wide open)
  width: number;    // 0 (round O) to 1 (wide smile EE)
  teeth: number;    // 0 to 1 (showing teeth for dental consonants)
  volume: number;   // 0 to 1 RMS energy
  isSpeaking: boolean;
}
