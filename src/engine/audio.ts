import { CarBaseSpec, GameSettings } from '../types/game';

export class RacingAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private oscPrimary: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  private screechGain: GainNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;

  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;

  private initialized = false;
  private muted = false;
  private masterVol = 0.75;
  private engineVol = 0.85;
  private sfxVol = 0.8;
  private profile: CarBaseSpec['engineSoundProfile'] = 'i6_turbo';

  public init(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.masterVol;
      this.masterGain.connect(ctx.destination);

      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineGain.connect(this.masterGain);

      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = this.sfxVol;
      this.sfxGain.connect(this.masterGain);

      // Engine harmonic oscillator pair through resonant lowpass filter
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 340;
      this.engineFilter.Q.value = 2.6;
      this.engineFilter.connect(this.engineGain);

      this.oscPrimary = ctx.createOscillator();
      this.oscPrimary.type = 'sawtooth';
      this.oscPrimary.frequency.value = 65;
      this.oscPrimary.connect(this.engineFilter);
      this.oscPrimary.start();

      this.oscSub = ctx.createOscillator();
      this.oscSub.type = 'triangle';
      this.oscSub.frequency.value = 32.5;
      this.oscSub.connect(this.engineFilter);
      this.oscSub.start();

      // Continuous filtered white noise for tire screech / wind
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      this.noiseSource = ctx.createBufferSource();
      this.noiseSource.buffer = noiseBuffer;
      this.noiseSource.loop = true;

      this.screechFilter = ctx.createBiquadFilter();
      this.screechFilter.type = 'bandpass';
      this.screechFilter.frequency.value = 1150;
      this.screechFilter.Q.value = 5.5;

      this.screechGain = ctx.createGain();
      this.screechGain.gain.value = 0;

      this.noiseSource.connect(this.screechFilter);
      this.screechFilter.connect(this.screechGain);
      this.screechGain.connect(this.sfxGain);
      this.noiseSource.start();

      // Police siren oscillator
      this.sirenOsc = ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 650;
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.sfxGain);
      this.sirenOsc.start();

      this.initialized = true;
    } catch {
      // AudioContext creation failed or blocked
    }
  }

  public applySettings(settings: GameSettings): void {
    this.muted = settings.muted;
    this.masterVol = settings.masterVolume;
    this.engineVol = settings.engineVolume;
    this.sfxVol = settings.sfxVolume;

    if (!this.ctx || !this.masterGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(
      this.muted ? 0 : this.masterVol,
      now,
      0.04,
    );
    this.sfxGain.gain.setTargetAtTime(this.sfxVol, now, 0.04);
  }

  public setEngineProfile(profile: CarBaseSpec['engineSoundProfile']): void {
    this.profile = profile;
    if (!this.oscPrimary || !this.oscSub) return;
    switch (profile) {
      case 'v12':
        this.oscPrimary.type = 'sawtooth';
        this.oscSub.type = 'sawtooth';
        break;
      case 'v10':
        this.oscPrimary.type = 'sawtooth';
        this.oscSub.type = 'square';
        break;
      case 'v8':
        this.oscPrimary.type = 'sawtooth';
        this.oscSub.type = 'triangle';
        break;
      default:
        this.oscPrimary.type = 'sawtooth';
        this.oscSub.type = 'triangle';
    }
  }

  public updateContinuous(params: {
    active: boolean;
    rpm: number;
    maxRpm: number;
    throttle: number;
    driftIntensity: number; // 0..1
    nitroActive: boolean;
    policeActive: boolean;
    policeDistanceM: number;
    elapsedTime: number;
  }): void {
    if (!this.initialized || !this.ctx) return;
    if (this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;
    if (!params.active) {
      this.engineGain?.gain.setTargetAtTime(0, now, 0.08);
      this.screechGain?.gain.setTargetAtTime(0, now, 0.08);
      this.sirenGain?.gain.setTargetAtTime(0, now, 0.08);
      return;
    }

    const rpmNorm = Math.max(0.08, Math.min(1.05, params.rpm / params.maxRpm));
    let baseFreq = 52;
    let maxFreq = 260;
    if (this.profile === 'v12') {
      baseFreq = 68;
      maxFreq = 360;
    } else if (this.profile === 'v10') {
      baseFreq = 62;
      maxFreq = 320;
    } else if (this.profile === 'v8') {
      baseFreq = 44;
      maxFreq = 215;
    }

    const freq = baseFreq + (maxFreq - baseFreq) * rpmNorm * (params.nitroActive ? 1.12 : 1);
    this.oscPrimary?.frequency.setTargetAtTime(freq, now, 0.025);
    this.oscSub?.frequency.setTargetAtTime(freq * 0.5, now, 0.025);

    const filterCutoff = 220 + rpmNorm * 1400 + params.throttle * 650 + (params.nitroActive ? 700 : 0);
    this.engineFilter?.frequency.setTargetAtTime(filterCutoff, now, 0.03);

    const engLevel = (0.09 + params.throttle * 0.14 + rpmNorm * 0.08) * this.engineVol;
    this.engineGain?.gain.setTargetAtTime(engLevel, now, 0.04);

    // Tire screech
    const screechLvl = Math.min(0.22, params.driftIntensity * 0.2);
    this.screechGain?.gain.setTargetAtTime(screechLvl, now, 0.04);
    if (this.screechFilter) {
      this.screechFilter.frequency.setTargetAtTime(950 + params.driftIntensity * 650, now, 0.05);
    }

    // Police siren wail
    if (params.policeActive && params.policeDistanceM < 220) {
      const distAtten = Math.max(0, 1 - params.policeDistanceM / 220);
      const sirenFreq = 680 + Math.sin(params.elapsedTime * 5.2) * 230;
      this.sirenOsc?.frequency.setTargetAtTime(sirenFreq, now, 0.02);
      this.sirenGain?.gain.setTargetAtTime(0.08 * distAtten, now, 0.05);
    } else {
      this.sirenGain?.gain.setTargetAtTime(0, now, 0.06);
    }
  }

  public playShiftPop(): void {
    if (!this.initialized || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playCollision(intensity: number): void {
    if (!this.initialized || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const clamped = Math.min(1, Math.max(0.15, intensity));
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110 * clamped + 40, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.18);
    gain.gain.setValueAtTime(0.32 * clamped, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playCountdownBeep(isGo: boolean): void {
    if (!this.initialized || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.35 : 0.18));
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + (isGo ? 0.38 : 0.2));
  }

  public playUiClick(): void {
    if (!this.initialized || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.045);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public dispose(): void {
    try {
      this.oscPrimary?.stop();
      this.oscSub?.stop();
      this.noiseSource?.stop();
      this.sirenOsc?.stop();
      void this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.initialized = false;
  }
}

export const audioEngine = new RacingAudioEngine();
