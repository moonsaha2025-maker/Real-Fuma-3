import { RadioStationId } from '../types/game';

export interface RadioStationMeta {
  id: RadioStationId;
  name: string;
  freq: string;
  genre: string;
  bpm: number;
  accentHex: string;
  tracks: string[];
}

export const RADIO_STATIONS: RadioStationMeta[] = [
  {
    id: 'horizon_fm',
    name: 'HORIZON COAST',
    freq: '98.4 FM',
    genre: 'Synthwave / Outrun',
    bpm: 116,
    accentHex: '#38bdf8',
    tracks: [
      'Pacific Overdrive — Neon Palms',
      'Midnight 765 — Sunset Drive',
      'Turbo Mirage — Coastal Run',
    ],
  },
  {
    id: 'apex_bass',
    name: 'APEX DRIFT',
    freq: '104.7 FM',
    genre: 'Night Phonk / Bass',
    bpm: 132,
    accentHex: '#f43f5e',
    tracks: [
      'Touge Ghost — Twin Scroll',
      'Redline District — Sideways',
      'Subzero Smoke — Asphalt King',
    ],
  },
  {
    id: 'lofi_sunset',
    name: 'SUNSET CHILL',
    freq: '88.9 FM',
    genre: 'Golden Hour Lo-Fi',
    bpm: 86,
    accentHex: '#f59e0b',
    tracks: [
      'Boardwalk Breeze — Tape Echo',
      'Saltwater Fender — Slow Cruise',
      'Amber Pier — Harbor Haze',
    ],
  },
  {
    id: 'hyper_euro',
    name: 'FUJIMI TURBO',
    freq: '107.1 FM',
    genre: 'Touge Eurobeat',
    bpm: 146,
    accentHex: '#a855f7',
    tracks: [
      'Max Boost 9000 — Hairpin Fury',
      'Wangan Fever — Apex Velocity',
      'Gutter Run — Downhill Legend',
    ],
  },
  {
    id: 'off',
    name: 'RADIO OFF',
    freq: '---',
    genre: 'Engine Audio Only',
    bpm: 0,
    accentHex: '#64748b',
    tracks: ['Tuner Standby'],
  },
];

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface StationPattern {
  chords: number[][];
  bass: number[];
  lead: number[];
  arp: number[];
}

const PATTERNS: Record<Exclude<RadioStationId, 'off'>, StationPattern> = {
  horizon_fm: {
    // Am - F - C - G synthwave progression
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ],
    bass: [33, 33, 45, 33, 29, 29, 41, 29, 36, 36, 48, 36, 31, 31, 43, 31],
    lead: [72, 0, 76, 0, 74, 72, 69, 0, 72, 0, 79, 0, 76, 74, 72, 0],
    arp: [69, 72, 76, 72, 65, 69, 72, 69, 60, 64, 67, 64, 67, 71, 74, 71],
  },
  apex_bass: {
    // Dark minor Phonk / 808 pattern (Cm - Ab - Fm - G)
    chords: [
      [48, 51, 55],
      [44, 48, 51],
      [41, 44, 48],
      [43, 46, 50],
    ],
    bass: [36, 0, 36, 36, 0, 32, 0, 32, 29, 0, 29, 0, 31, 31, 34, 31],
    lead: [67, 0, 72, 75, 0, 74, 72, 0, 68, 0, 72, 75, 79, 0, 74, 0],
    arp: [72, 75, 79, 75, 68, 72, 75, 72, 65, 68, 72, 68, 67, 70, 74, 70],
  },
  lofi_sunset: {
    // Warm Dm7 - G7 - Cmaj7 - Am7 coastal lo-fi
    chords: [
      [50, 53, 57, 60],
      [43, 47, 50, 53],
      [48, 52, 55, 59],
      [45, 48, 52, 55],
    ],
    bass: [38, 0, 0, 38, 31, 0, 0, 31, 36, 0, 0, 36, 33, 0, 36, 33],
    lead: [69, 0, 72, 0, 71, 0, 67, 0, 64, 0, 67, 71, 69, 0, 0, 0],
    arp: [62, 65, 69, 72, 59, 62, 65, 67, 60, 64, 67, 71, 60, 64, 67, 69],
  },
  hyper_euro: {
    // Driving Eurobeat Em - C - D - Bm
    chords: [
      [52, 55, 59],
      [48, 52, 55],
      [50, 54, 57],
      [47, 50, 54],
    ],
    bass: [28, 40, 28, 40, 24, 36, 24, 36, 26, 38, 26, 38, 23, 35, 26, 38],
    lead: [76, 79, 83, 0, 79, 76, 74, 76, 74, 78, 81, 0, 79, 78, 74, 0],
    arp: [76, 79, 83, 79, 72, 76, 79, 76, 74, 78, 81, 78, 71, 74, 78, 74],
  },
};

export function getRadioStationMeta(id: RadioStationId): RadioStationMeta {
  return RADIO_STATIONS.find((s) => s.id === id) ?? RADIO_STATIONS[0];
}

export class PersistentRadioEngine {
  private ctx: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private station: RadioStationId = 'horizon_fm';
  private timerId: number | null = null;
  private nextStepTime = 0;
  private stepIdx = 0;
  private barIdx = 0;

  public attach(
    ctx: AudioContext,
    outputGain: GainNode,
    noiseBuffer: AudioBuffer | null,
  ): void {
    this.ctx = ctx;
    this.outputGain = outputGain;
    this.noiseBuffer = noiseBuffer;
    if (this.station !== 'off') {
      this.ensureSchedulerRunning();
    }
  }

  public setStation(id: RadioStationId, playTuningStatic = false): void {
    const changed = this.station !== id;
    this.station = id;
    if (changed) {
      this.stepIdx = 0;
      this.barIdx = 0;
      if (this.ctx) {
        this.nextStepTime = this.ctx.currentTime + 0.04;
      }
      if (playTuningStatic) {
        this.triggerTuningClick();
      }
    }
    if (id === 'off') {
      this.stopScheduler();
    } else if (this.ctx && this.outputGain) {
      this.ensureSchedulerRunning();
    }
  }

  public getStation(): RadioStationId {
    return this.station;
  }

  public getCurrentTrack(): string {
    const meta = getRadioStationMeta(this.station);
    if (meta.tracks.length === 0) return 'Live Broadcast';
    const trackIdx = Math.floor(this.barIdx / 4) % meta.tracks.length;
    return meta.tracks[trackIdx];
  }

  private triggerTuningClick(): void {
    if (!this.ctx || !this.outputGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2200, now);
    bp.Q.value = 1.4;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.outputGain);
    src.start(now);
    src.stop(now + 0.09);
  }

  private ensureSchedulerRunning(): void {
    if (this.timerId !== null || !this.ctx || !this.outputGain) return;
    this.nextStepTime = Math.max(this.nextStepTime, this.ctx.currentTime + 0.04);
    this.timerId = window.setInterval(() => {
      this.scheduleAhead();
    }, 65);
  }

  private stopScheduler(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private scheduleAhead(): void {
    if (!this.ctx || !this.outputGain || this.station === 'off') return;
    if (this.ctx.state !== 'running') return;

    const meta = getRadioStationMeta(this.station);
    const stepDur = 60 / Math.max(60, meta.bpm) / 4; // 16th note seconds
    const lookahead = 0.16;

    // Resync gracefully if tab was backgrounded
    if (this.nextStepTime < this.ctx.currentTime - 0.25) {
      this.nextStepTime = this.ctx.currentTime + 0.04;
    }

    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      this.scheduleStep(this.station, this.stepIdx, this.barIdx, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.stepIdx = (this.stepIdx + 1) % 16;
      if (this.stepIdx === 0) {
        this.barIdx = (this.barIdx + 1) % 64;
      }
    }
  }

  private scheduleStep(
    station: Exclude<RadioStationId, 'off'>,
    step: number,
    bar: number,
    t: number,
    stepDur: number,
  ): void {
    if (!this.ctx || !this.outputGain) return;
    const pat = PATTERNS[station];
    const chordIdx = bar % pat.chords.length;
    const chord = pat.chords[chordIdx];

    // 1. Kick & Snare / Clap Percussion
    const isKick =
      station === 'horizon_fm'
        ? step % 4 === 0
        : station === 'apex_bass'
          ? step === 0 || step === 6 || step === 10
          : station === 'lofi_sunset'
            ? step === 0 || step === 10
            : step % 4 === 0;
    if (isKick) {
      this.playKick(t, station === 'apex_bass' ? 0.36 : 0.28, station === 'lofi_sunset' ? 95 : 135);
    }

    const isSnare =
      station === 'apex_bass'
        ? step === 8
        : step === 4 || step === 12;
    if (isSnare) {
      this.playSnare(t, station === 'lofi_sunset' ? 0.08 : 0.14);
    }

    const isHat =
      station === 'hyper_euro'
        ? step % 2 === 1
        : station === 'apex_bass'
          ? step % 2 === 0 || step === 13 || step === 15
          : step % 2 === 0;
    if (isHat) {
      this.playHiHat(t, station === 'hyper_euro' ? 0.07 : 0.045);
    }

    // 2. Pad Chord on beat 1 of each bar
    if (step === 0) {
      for (const note of chord) {
        this.playTone(
          midiToHz(note),
          t,
          stepDur * 14,
          station === 'lofi_sunset' ? 'sine' : 'triangle',
          station === 'lofi_sunset' ? 0.06 : 0.045,
          1200,
        );
      }
    }

    // 3. Groove Bassline (every 2 steps / 8th notes or full 16th driving eurobeat)
    const bassIndex = Math.floor(step / 1) % pat.bass.length;
    const bassNote = pat.bass[bassIndex];
    if (bassNote > 0 && (station === 'hyper_euro' || step % 2 === 0 || station === 'apex_bass')) {
      const freq = midiToHz(bassNote);
      this.playTone(
        freq,
        t,
        stepDur * (station === 'apex_bass' ? 2.4 : 1.7),
        station === 'lofi_sunset' ? 'sine' : 'sawtooth',
        station === 'apex_bass' ? 0.18 : 0.13,
        station === 'hyper_euro' ? 980 : 520,
      );
    }

    // 4. Melodic Lead / Arpeggio
    const variationOffset = (Math.floor(bar / 4) % 2) * 2;
    if (station === 'horizon_fm' || station === 'hyper_euro') {
      const arpNote = pat.arp[step % pat.arp.length];
      if (arpNote > 0) {
        this.playTone(
          midiToHz(arpNote + variationOffset),
          t,
          stepDur * 0.85,
          station === 'hyper_euro' ? 'sawtooth' : 'triangle',
          0.055,
          2400,
        );
      }
    }

    const leadNote = pat.lead[step % pat.lead.length];
    if (leadNote > 0 && bar % 2 === 1) {
      this.playTone(
        midiToHz(leadNote + variationOffset),
        t,
        stepDur * 1.9,
        station === 'lofi_sunset' ? 'sine' : station === 'apex_bass' ? 'square' : 'triangle',
        station === 'apex_bass' ? 0.06 : 0.08,
        station === 'lofi_sunset' ? 1600 : 2800,
      );
    }
  }

  private playTone(
    freq: number,
    t: number,
    dur: number,
    type: OscillatorType,
    peakGain: number,
    cutoffHz: number,
  ): void {
    if (!this.ctx || !this.outputGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffHz, t);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peakGain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.04, dur));

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.outputGain);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private playKick(t: number, level: number, startHz: number): void {
    if (!this.ctx || !this.outputGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);

    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(g);
    g.connect(this.outputGain);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  private playSnare(t: number, level: number): void {
    if (!this.ctx || !this.outputGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(1650, t);
    hp.Q.value = 0.7;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

    src.connect(hp);
    hp.connect(g);
    g.connect(this.outputGain);
    src.start(t);
    src.stop(t + 0.15);
  }

  private playHiHat(t: number, level: number): void {
    if (!this.ctx || !this.outputGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(7200, t);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    src.connect(hp);
    hp.connect(g);
    g.connect(this.outputGain);
    src.start(t);
    src.stop(t + 0.055);
  }

  public dispose(): void {
    this.stopScheduler();
    this.ctx = null;
    this.outputGain = null;
    this.noiseBuffer = null;
  }
}

export const radioEngine = new PersistentRadioEngine();
