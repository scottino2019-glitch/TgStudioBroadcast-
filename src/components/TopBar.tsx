import React from 'react';
import { Radio, Video, Square } from 'lucide-react';

export type ActiveStudioTab = 'direct' | 'script' | 'avatar' | 'media' | 'graphics';

interface TopBarProps {
  activeTab: ActiveStudioTab;
  onSelectTab: (tab: ActiveStudioTab) => void;
  isRecording: boolean;
  recordingSeconds: number;
  onToggleRecord: () => void;
  isFinalizing?: boolean;
  isPreparingRecording?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  isRecording,
  recordingSeconds,
  onToggleRecord,
  isFinalizing,
  isPreparingRecording,
}) => {
  const mins = Math.floor(recordingSeconds / 60);
  const secs = Math.floor(recordingSeconds % 60);
  const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40">
      {/* Zone 1: Single text element wordmark */}
      <a href="/" className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
        <span>TG Studio Broadcast</span>
      </a>

      {/* Zone 2: 4-5 concise single-line text navigation links */}
      <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-400">
        <button
          onClick={() => onSelectTab('direct')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'direct' ? 'text-sky-400 font-semibold' : ''
          }`}
        >
          Regia Live
        </button>
        <button
          onClick={() => onSelectTab('script')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'script' ? 'text-sky-400 font-semibold' : ''
          }`}
        >
          Copione & Voce
        </button>
        <button
          onClick={() => onSelectTab('avatar')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'avatar' ? 'text-sky-400 font-semibold' : ''
          }`}
        >
          Avatar & Sincronia
        </button>
        <button
          onClick={() => onSelectTab('media')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'media' ? 'text-sky-400 font-semibold' : ''
          }`}
        >
          Sfondi & Media
        </button>
        <button
          onClick={() => onSelectTab('graphics')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'graphics' ? 'text-sky-400 font-semibold' : ''
          }`}
        >
          Grafiche Notizie
        </button>
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center gap-3 shrink-0">

        {isFinalizing ? (
          <div className="px-4 py-2 text-xs font-bold text-amber-300 bg-amber-950/80 border border-amber-500/60 rounded-lg flex items-center gap-2 animate-pulse whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>Registrazione Titoli di Coda...</span>
          </div>
        ) : isPreparingRecording ? (
          <div className="px-4 py-2 text-xs font-bold text-sky-300 bg-sky-950/80 border border-sky-500/60 rounded-lg flex items-center gap-2 animate-pulse whitespace-nowrap">
            <Radio className="w-3.5 h-3.5 animate-spin" />
            <span>Preparazione Audio HD...</span>
          </div>
        ) : isRecording ? (
          <button
            onClick={onToggleRecord}
            className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-rose-900/40 whitespace-nowrap animate-pulse"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Interrompi REC ({timeFormatted})</span>
          </button>
        ) : (
          <button
            onClick={onToggleRecord}
            className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-sky-900/40 whitespace-nowrap"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Registra Video HD</span>
          </button>
        )}
      </div>
    </header>
  );
};
