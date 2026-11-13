import React from 'react';
import { BroadcastState, LowerThirdConfig } from '../types';
import { Tv, Type, FastForward, ShieldAlert } from 'lucide-react';

interface GraphicsEditorProps {
  state: BroadcastState;
  onChange: (patch: Partial<BroadcastState>) => void;
}

export const GraphicsEditor: React.FC<GraphicsEditorProps> = ({ state, onChange }) => {
  const updateLowerThird = (patch: Partial<LowerThirdConfig>) => {
    onChange({
      lowerThird: {
        ...state.lowerThird,
        ...patch,
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* 1. LOWER THIRD (SOTTOPANCIA TELEVISIVO) */}
      <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Tv className="w-4 h-4 text-sky-400" />
            <span>Sottopancia Notiziario (Lower-Third Banner)</span>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.lowerThird.enabled}
              onChange={(e) => updateLowerThird({ enabled: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-sky-600 focus:ring-0 w-4 h-4"
            />
            <span className="text-xs text-slate-300 font-medium">Attiva Banner Notizia</span>
          </label>
        </div>

        {state.lowerThird.enabled && (
          <div className="space-y-3 pt-1 border-t border-slate-800/80">
            {/* Style selector */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">Stile Notiziario:</span>
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                {(
                  [
                    { id: 'breaking', label: 'Breaking News (Rosso)', color: 'text-rose-400' },
                    { id: 'standard', label: 'TG Standard (Blu)', color: 'text-sky-400' },
                    { id: 'economic', label: 'Economia (Verde)', color: 'text-emerald-400' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    onClick={() => updateLowerThird({ style: st.id })}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      state.lowerThird.style === st.id
                        ? 'bg-sky-600 text-white font-medium'
                        : `${st.color} hover:text-white`
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Categoria Notizia (Ribbon):</label>
                <input
                  type="text"
                  value={state.lowerThird.category}
                  onChange={(e) => updateLowerThird({ category: e.target.value })}
                  placeholder="Es. ULTIM'ORA, ESTERI, ECONOMIA"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 font-broadcast font-bold uppercase"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Titolo Principale (Headline):</label>
                <input
                  type="text"
                  value={state.lowerThird.headline}
                  onChange={(e) => updateLowerThird({ headline: e.target.value })}
                  placeholder="Titolo ad alto impatto per il notiziario"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 font-broadcast font-bold uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Sottotitolo / Luogo Diretta:</label>
                <input
                  type="text"
                  value={state.lowerThird.subheadline}
                  onChange={(e) => updateLowerThird({ subheadline: e.target.value })}
                  placeholder="Es. ROMA · ORE 20:00 · CONFERENZA STAMPA"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Nome Conduttore & Titolo:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={state.lowerThird.anchorName}
                    onChange={(e) => updateLowerThird({ anchorName: e.target.value })}
                    placeholder="Nome Conduttore"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <input
                    type="text"
                    value={state.lowerThird.anchorTitle}
                    onChange={(e) => updateLowerThird({ anchorTitle: e.target.value })}
                    placeholder="Ruolo"
                    className="w-32 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. CONTINUOUS TICKER (STRISCIA NOTIZIE IN BASSO) */}
      <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <FastForward className="w-4 h-4 text-amber-400" />
            <span>Striscia Notizie a Scorrimento (Ticker)</span>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.ticker.enabled}
              onChange={(e) =>
                onChange({
                  ticker: { ...state.ticker, enabled: e.target.checked },
                })
              }
              className="rounded bg-slate-800 border-slate-700 text-sky-600 focus:ring-0 w-4 h-4"
            />
            <span className="text-xs text-slate-300 font-medium">Attiva Ticker Notizie</span>
          </label>
        </div>

        {state.ticker.enabled && (
          <div className="space-y-3 pt-1 border-t border-slate-800/80">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Etichetta Fissa:</label>
                <input
                  type="text"
                  value={state.ticker.label}
                  onChange={(e) =>
                    onChange({
                      ticker: { ...state.ticker, label: e.target.value },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 font-broadcast font-bold uppercase"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-xs text-slate-400 block mb-1">Testo Notizie Continue (Ticker):</label>
                <input
                  type="text"
                  value={state.ticker.text}
                  onChange={(e) =>
                    onChange({
                      ticker: { ...state.ticker, text: e.target.value },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                />
              </div>
            </div>

            {/* Ticker Background & Font Size Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/60">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Sfondo Barra Notizie:</label>
                <div className="grid grid-cols-4 gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => onChange({ ticker: { ...state.ticker, bgStyle: 'black' } })}
                    className={`py-1.5 text-[11px] rounded transition-all font-semibold ${
                      state.ticker.bgStyle === 'black'
                        ? 'bg-black text-white ring-1 ring-amber-400'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Nero Puro HD - Sfondo nero totale ad altissimo contrasto TV (Consigliato)"
                  >
                    Nero HD
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ticker: { ...state.ticker, bgStyle: 'red' } })}
                    className={`py-1.5 text-[11px] rounded transition-all font-semibold ${
                      state.ticker.bgStyle === 'red'
                        ? 'bg-rose-700 text-white ring-1 ring-rose-400'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Rosso Ultima Ora con contorno nero anti-sfocatura"
                  >
                    Rosso TG
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ticker: { ...state.ticker, bgStyle: 'yellow' } })}
                    className={`py-1.5 text-[11px] rounded transition-all font-semibold ${
                      state.ticker.bgStyle === 'yellow'
                        ? 'bg-amber-400 text-slate-950 ring-1 ring-amber-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Giallo Breaking News con testo nero ultra-visibile"
                  >
                    Giallo
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ticker: { ...state.ticker, bgStyle: 'navy' } })}
                    className={`py-1.5 text-[11px] rounded transition-all font-semibold ${
                      state.ticker.bgStyle === 'navy' || state.ticker.bgStyle === 'blue'
                        ? 'bg-blue-800 text-white ring-1 ring-blue-400'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Blu Notte Regia Broadcast"
                  >
                    Blu HD
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Dimensione Carattere (1080p):</label>
                <div className="grid grid-cols-4 gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => onChange({ ticker: { ...state.ticker, fontSize: 'gigantic' } })}
                    className={`py-1.5 text-[11px] rounded transition-all font-bold ${
                      state.ticker.fontSize === 'gigantic'
                        ? 'bg-amber-500 text-slate-950 ring-1 ring-amber-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Gigante 68px - Massima leggibilità su qualsiasi dispositivo ed export video"
                  >
                    Gigante
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ticker: { ...state.ticker, fontSize: 'huge' } })}
                    className={`py-1.5 text-[11px] rounded transition-all font-bold ${
                      state.ticker.fontSize === 'huge'
                        ? 'bg-amber-500 text-slate-950 ring-1 ring-amber-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Molto Grande 56px"
                  >
                    M. Grande
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ticker: { ...state.ticker, fontSize: 'large' } })}
                    className={`py-1.5 text-[11px] rounded transition-all font-semibold ${
                      state.ticker.fontSize === 'large'
                        ? 'bg-amber-500 text-slate-950 ring-1 ring-amber-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Grande 46px"
                  >
                    Grande
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ticker: { ...state.ticker, fontSize: 'standard' } })}
                    className={`py-1.5 text-[11px] rounded transition-all font-semibold ${
                      state.ticker.fontSize === 'standard'
                        ? 'bg-amber-500 text-slate-950 ring-1 ring-amber-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Standard 38px"
                  >
                    Standard
                  </button>
                </div>
              </div>
            </div>

            {/* Speed slider */}
            <div className="flex items-center gap-4 pt-1">
              <span className="text-xs text-slate-400 whitespace-nowrap">Velocità Scorrimento:</span>
              <input
                type="range"
                min={12}
                max={40}
                value={state.ticker.speed}
                onChange={(e) =>
                  onChange({
                    ticker: { ...state.ticker, speed: parseInt(e.target.value, 10) },
                  })
                }
                className="flex-1 accent-amber-500"
              />
              <span className="text-xs text-slate-400 font-data whitespace-nowrap">
                {state.ticker.speed < 20 ? 'Rapido' : state.ticker.speed > 30 ? 'Lento' : 'Standard'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. LOGO & BRANDING EMITTENTE */}
      <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>Marchio Emittente & Indicatore Diretta</span>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.watermark.enabled}
              onChange={(e) =>
                onChange({
                  watermark: { ...state.watermark, enabled: e.target.checked },
                })
              }
              className="rounded bg-slate-800 border-slate-700 text-sky-600 focus:ring-0 w-4 h-4"
            />
            <span className="text-xs text-slate-300 font-medium">Attiva Marchio TV</span>
          </label>
        </div>

        {state.watermark.enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-800/80">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Nome Canale / Telegiornale:</label>
              <input
                type="text"
                value={state.watermark.text}
                onChange={(e) =>
                  onChange({
                    watermark: { ...state.watermark, text: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500 font-broadcast font-bold uppercase"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Badge Stato (es. DIRETTA HD):</label>
              <input
                type="text"
                value={state.watermark.subtext}
                onChange={(e) =>
                  onChange({
                    watermark: { ...state.watermark, subtext: e.target.value },
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500 font-broadcast font-bold uppercase"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Angolo Schermo:</label>
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() =>
                    onChange({
                      watermark: { ...state.watermark, position: 'top-right' },
                    })
                  }
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    state.watermark.position === 'top-right'
                      ? 'bg-rose-600 text-white font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  In Alto a Destra
                </button>
                <button
                  onClick={() =>
                    onChange({
                      watermark: { ...state.watermark, position: 'top-left' },
                    })
                  }
                  className={`flex-1 py-1 text-xs rounded transition-colors ${
                    state.watermark.position === 'top-left'
                      ? 'bg-rose-600 text-white font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  In Alto a Sinistra
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. TITOLI DI CODA (BROADCAST END CREDITS SLATE) */}
      <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Type className="w-4 h-4 text-emerald-400" />
            <span>Titoli di Coda Notiziario (End Credits Slate)</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onChange({ showCreditsNow: !state.showCreditsNow })}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                state.showCreditsNow
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {state.showCreditsNow ? 'Chiudi Anteprima' : 'Anteprima Titoli'}
            </button>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={state.endCredits.enabled}
                onChange={(e) =>
                  onChange({
                    endCredits: { ...state.endCredits, enabled: e.target.checked },
                  })
                }
                className="rounded bg-slate-800 border-slate-700 text-sky-600 focus:ring-0 w-4 h-4"
              />
              <span className="text-xs text-slate-300 font-medium">Esporta nei Video</span>
            </label>
          </div>
        </div>

        {state.endCredits.enabled && (
          <div className="space-y-3 pt-1 border-t border-slate-800/80">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Dicitura Edizione:</label>
                <input
                  type="text"
                  value={state.endCredits.edition}
                  onChange={(e) =>
                    onChange({
                      endCredits: { ...state.endCredits, edition: e.target.value },
                    })
                  }
                  placeholder="Es. Edizione Straordinaria TG Studio"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Regia & Produzione:</label>
                <input
                  type="text"
                  value={state.endCredits.director}
                  onChange={(e) =>
                    onChange({
                      endCredits: { ...state.endCredits, director: e.target.value },
                    })
                  }
                  placeholder="Es. Studio TG Broadcast"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Redazione Giornalistica:</label>
                <input
                  type="text"
                  value={state.endCredits.production}
                  onChange={(e) =>
                    onChange({
                      endCredits: { ...state.endCredits, production: e.target.value },
                    })
                  }
                  placeholder="Es. Redazione Notizie Internazionali"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Tecnologia Audio:</label>
                <input
                  type="text"
                  value={state.endCredits.audioTech}
                  onChange={(e) =>
                    onChange({
                      endCredits: { ...state.endCredits, audioTech: e.target.value },
                    })
                  }
                  placeholder="Es. Voci Google / Android & Lip-Sync Studio"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Messaggio / Saluto Conclusivo:</label>
              <input
                type="text"
                value={state.endCredits.customNotes}
                onChange={(e) =>
                  onChange({
                    endCredits: { ...state.endCredits, customNotes: e.target.value },
                  })
                }
                placeholder="Es. Grazie per aver seguito la nostra edizione"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 italic"
              />
            </div>

            <div className="flex items-center gap-4 pt-1">
              <span className="text-xs text-slate-400 whitespace-nowrap">Durata Titoli nel Video:</span>
              <input
                type="range"
                min={2}
                max={8}
                step={0.5}
                value={state.endCredits.durationSec || 4.5}
                onChange={(e) =>
                  onChange({
                    endCredits: {
                      ...state.endCredits,
                      durationSec: parseFloat(e.target.value),
                    },
                  })
                }
                className="flex-1 accent-emerald-500"
              />
              <span className="text-xs font-data text-emerald-400 font-semibold w-16 text-right">
                {state.endCredits.durationSec || 4.5}s
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
