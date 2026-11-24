import React from 'react';
import { ArrowLeft, Gamepad2, Monitor, Volume2, VolumeX } from 'lucide-react';
import {
  ControlScheme,
  GameSettings,
  GraphicsPreset,
  TransmissionMode,
} from '../types/game';
import { audioEngine } from '../engine/audio';

interface SettingsModalProps {
  settings: GameSettings;
  onUpdate: (patch: Partial<GameSettings>) => void;
  onBack: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdate,
  onBack,
}) => {
  const update = (patch: Partial<GameSettings>) => {
    audioEngine.playUiClick();
    onUpdate(patch);
  };

  return (
    <div className="fixed inset-0 z-40 bg-[#07080b]/95 overflow-y-auto p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onBack();
              }}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-display tracking-wider text-slate-100 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-rose-500" />
              BACK
            </button>
            <div>
              <div className="text-[10px] font-display tracking-[0.28em] text-rose-500 uppercase">
                OPTIMIZATION & CONTROLS
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-100">
                SYSTEM SETTINGS
              </h2>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Graphics & Optimization */}
          <div className="bg-[#0d1017] border border-slate-800 p-5 space-y-4">
            <div className="flex items-center gap-2 font-display text-sm font-bold text-slate-100">
              <Monitor className="w-4 h-4 text-rose-500" />
              GRAPHICS & PERFORMANCE PRESET
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as GraphicsPreset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => update({ graphicsPreset: p })}
                  className={`py-2 text-xs font-display font-bold border cursor-pointer ${
                    settings.graphicsPreset === p
                      ? 'bg-rose-600 border-rose-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">
              Scales resolution DPR, shadow mapping, anti-aliasing, and draw
              distance for mobile battery & thermal efficiency.
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-xs font-display text-slate-300">
                SPEEDOMETER UNITS
              </span>
              <div className="flex gap-1.5">
                {(['KMH', 'MPH'] as const).map((u) => (
                  <button
                    key={u}
                    onClick={() => update({ units: u })}
                    className={`px-3 py-1 text-xs font-display border cursor-pointer ${
                      settings.units === u
                        ? 'bg-slate-100 text-black font-bold border-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-display text-slate-300">
                IMPACT CAMERA SHAKE
              </span>
              <button
                onClick={() => update({ cameraShake: !settings.cameraShake })}
                className={`px-3 py-1 text-xs font-display border cursor-pointer ${
                  settings.cameraShake
                    ? 'bg-rose-600 border-rose-500 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                {settings.cameraShake ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Controls & Driving Assists */}
          <div className="bg-[#0d1017] border border-slate-800 p-5 space-y-4">
            <div className="flex items-center gap-2 font-display text-sm font-bold text-slate-100">
              <Gamepad2 className="w-4 h-4 text-rose-500" />
              MOBILE & DRIVING CONTROLS
            </div>

            <div>
              <div className="text-[10px] font-display text-slate-400 mb-1.5">
                STEERING INPUT SCHEME
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['buttons', 'Touch Buttons'],
                    ['wheel', 'Steering Wheel'],
                    ['tilt', 'Tilt / Gyro'],
                    ['keyboard', 'Keyboard / Pad'],
                  ] as Array<[ControlScheme, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => update({ controlScheme: id })}
                    className={`py-2 px-2 text-xs font-display border cursor-pointer ${
                      settings.controlScheme === id
                        ? 'bg-rose-600 border-rose-500 text-white font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-display text-slate-300">
                TRANSMISSION
              </span>
              <div className="flex gap-1.5">
                {(['auto', 'manual'] as TransmissionMode[]).map((tr) => (
                  <button
                    key={tr}
                    onClick={() => update({ transmission: tr })}
                    className={`px-3 py-1 text-xs font-display uppercase border cursor-pointer ${
                      settings.transmission === tr
                        ? 'bg-rose-600 border-rose-500 text-white font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {tr}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-display text-slate-300">
                ABS BRAKING ASSIST
              </span>
              <button
                onClick={() => update({ abs: !settings.abs })}
                className={`px-3 py-1 text-xs font-display border cursor-pointer ${
                  settings.abs
                    ? 'bg-emerald-600 border-emerald-500 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                {settings.abs ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-display text-slate-300">
                TRACTION CONTROL (OFF FOR PRO DRIFT)
              </span>
              <button
                onClick={() =>
                  update({ tractionControl: !settings.tractionControl })
                }
                className={`px-3 py-1 text-xs font-display border cursor-pointer ${
                  settings.tractionControl
                    ? 'bg-emerald-600 border-emerald-500 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                {settings.tractionControl ? 'ON' : 'OFF'}
              </button>
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-display text-slate-400 mb-1">
                <span>STEERING SENSITIVITY</span>
                <span className="font-mono-num text-slate-200">
                  {settings.steeringSensitivity.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1.8}
                step={0.05}
                value={settings.steeringSensitivity}
                onChange={(e) =>
                  onUpdate({ steeringSensitivity: parseFloat(e.target.value) })
                }
                className="w-full accent-rose-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[10px] font-display text-slate-400 mb-1">
                <span>TOUCH BUTTON SCALE</span>
                <span className="font-mono-num text-slate-200">
                  {Math.round(settings.touchButtonScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.75}
                max={1.35}
                step={0.05}
                value={settings.touchButtonScale}
                onChange={(e) =>
                  onUpdate({ touchButtonScale: parseFloat(e.target.value) })
                }
                className="w-full accent-rose-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Audio Settings */}
          <div className="md:col-span-2 bg-[#0d1017] border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-sm font-bold text-slate-100">
                {settings.muted ? (
                  <VolumeX className="w-4 h-4 text-rose-500" />
                ) : (
                  <Volume2 className="w-4 h-4 text-rose-500" />
                )}
                PROCEDURAL AUDIO SYNTHESIS
              </div>
              <button
                onClick={() => update({ muted: !settings.muted })}
                className={`px-3 py-1 text-xs font-display border cursor-pointer ${
                  settings.muted
                    ? 'bg-rose-600 border-rose-500 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                {settings.muted ? 'MUTED' : 'AUDIO ACTIVE'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <div className="flex justify-between text-[10px] font-display text-slate-400 mb-1">
                  <span>MASTER VOLUME</span>
                  <span className="font-mono-num tabular-nums">
                    {Math.round(settings.masterVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.masterVolume}
                  onChange={(e) =>
                    onUpdate({ masterVolume: parseFloat(e.target.value) })
                  }
                  className="w-full accent-rose-600 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] font-display text-slate-400 mb-1">
                  <span>ENGINE & EXHAUST</span>
                  <span className="font-mono-num tabular-nums">
                    {Math.round(settings.engineVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.engineVolume}
                  onChange={(e) =>
                    onUpdate({ engineVolume: parseFloat(e.target.value) })
                  }
                  className="w-full accent-rose-600 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] font-display text-slate-400 mb-1">
                  <span>TIRES, WIND & SFX</span>
                  <span className="font-mono-num tabular-nums">
                    {Math.round(settings.sfxVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.sfxVolume}
                  onChange={(e) =>
                    onUpdate({ sfxVolume: parseFloat(e.target.value) })
                  }
                  className="w-full accent-rose-600 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] font-display text-slate-400 mb-1">
                  <span>RADIO STATIONS</span>
                  <span className="font-mono-num tabular-nums">
                    {Math.round(settings.radioVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.radioVolume}
                  onChange={(e) =>
                    onUpdate({ radioVolume: parseFloat(e.target.value) })
                  }
                  className="w-full accent-rose-600 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
