import React, { useEffect } from 'react';
import { RecordingResult } from '../utils/videoRecorder';
import confetti from 'canvas-confetti';
import { Download, Film, X, CheckCircle2, Play } from 'lucide-react';

interface VideoExportModalProps {
  result: RecordingResult | null;
  onClose: () => void;
}

export const VideoExportModal: React.FC<VideoExportModalProps> = ({ result, onClose }) => {
  useEffect(() => {
    if (result) {
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#38bdf8', '#facc15', '#ef4444', '#10b981'],
        });
      } catch {
        // Ignore confetti if not supported
      }
    }
  }, [result]);

  if (!result) return null;

  const fileSizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Video Notiziario Pronto per l'Esportazione</h2>
              <p className="text-xs text-slate-400">Audio sintetico naturale e sincronizzazione labiale completata</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Player */}
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-800 shadow-inner">
            <video
              src={result.url}
              controls
              autoPlay
              className="w-full h-full object-contain"
            />
          </div>

          {/* Video Metadata Cards */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="text-[11px] text-slate-400 font-medium">Risoluzione</div>
              <div className="text-sm font-bold text-slate-200 font-data">1080p Full HD</div>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="text-[11px] text-slate-400 font-medium">Durata Notiziario</div>
              <div className="text-sm font-bold text-emerald-400 font-data">{result.durationSec}s</div>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="text-[11px] text-slate-400 font-medium">Dimensione File</div>
              <div className="text-sm font-bold text-sky-400 font-data">{fileSizeMb} MB</div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
          >
            Chiudi & Torna alla Regia
          </button>

          <a
            href={result.url}
            download={`TG_Studio_Notiziario_${Date.now()}.${result.format}`}
            className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-sky-900/40 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Scarica Video ({result.format.toUpperCase()})</span>
          </a>
        </div>
      </div>
    </div>
  );
};
