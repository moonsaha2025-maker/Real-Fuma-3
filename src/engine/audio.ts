import { CarBaseSpec, GameSettings, RadioStationId } from '../types/game';
import { radioEngine } from './radio';

export class RacingAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private radioGain: GainNode | null = null;

  private oscPrimary: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  private screechGain: GainNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private scrapeGain: GainNode | null = null;
  private scrapeFilter: BiquadFilterNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private nitroJetGain: GainNode | null = null;
  private nitroJetFilter: BiquadFilterNode | null = null;
  private turboOsc: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;

  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;

  private initialized = false;
  private muted = false;
  private masterVol = 0.75;
  private engineVol = 0.85;
  private sfxVol = 0.8;
  private radioVol = 0.55;
  private radioStation: RadioStationId = 'horizon_fm';
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

      this.radioGain = ctx.createGain();
      this.radioGain.gain.value = this.radioVol;
      this.radioGain.connect(this.masterGain);

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

      this.noiseBuffer = noiseBuffer;
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

      // Continuous metallic guardrail grind / scrape noise channel
      this.scrapeFilter = ctx.createBiquadFilter();
      this.scrapeFilter.type = 'bandpass';
      this.scrapeFilter.frequency.value = 1750;
      this.scrapeFilter.Q.value = 2.4;
      this.scrapeGain = ctx.createGain();
      this.scrapeGain.gain.value = 0;
      this.noiseSource.connect(this.scrapeFilter);
      this.scrapeFilter.connect(this.scrapeGain);
      this.scrapeGain.connect(this.sfxGain);

      // Pressurized Nitrous Oxide Jet Roar + High-RPM Turbo Spool
      this.nitroJetFilter = ctx.createBiquadFilter();
      this.nitroJetFilter.type = 'bandpass';
      this.nitroJetFilter.frequency.value = 620;
      this.nitroJetFilter.Q.value = 1.1;
      this.nitroJetGain = ctx.createGain();
      this.nitroJetGain.gain.value = 0;
      this.noiseSource.connect(this.nitroJetFilter);
      this.nitroJetFilter.connect(this.nitroJetGain);
      this.nitroJetGain.connect(this.sfxGain);

      this.turboOsc = ctx.createOscillator();
      this.turboOsc.type = 'sine';
      this.turboOsc.frequency.value = 920;
      this.turboGain = ctx.createGain();
      this.turboGain.gain.value = 0;
      this.turboOsc.connect(this.turboGain);
      this.turboGain.connect(this.sfxGain);
      this.turboOsc.start();

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
      radioEngine.attach(ctx, this.radioGain, this.noiseBuffer);
      radioEngine.setStation(this.radioStation, false);
    } catch {
      // AudioContext creation failed or blocked
    }
  }

  public applySettings(settings: GameSettings): void {
    this.muted = settings.muted;
    this.masterVol = settings.masterVolume;
    this.engineVol = settings.engineVolume;
    this.sfxVol = settings.sfxVolume;
    this.radioVol = settings.radioVolume ?? 0.55;
    const prevStation = this.radioStation;
    this.radioStation = settings.radioStation ?? 'horizon_fm';

    radioEngine.setStation(this.radioStation, prevStation !== this.radioStation && this.initialized);

    if (!this.ctx || !this.masterGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(
      this.muted ? 0 : this.masterVol,
      now,
      0.04,
    );
    this.sfxGain.gain.setTargetAtTime(this.sfxVol, now, 0.04);
    this.radioGain?.gain.setTargetAtTime(this.radioVol, now, 0.04);
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
    railScrape?: number; // 0..1
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
      this.scrapeGain?.gain.setTargetAtTime(0, now, 0.06);
      this.nitroJetGain?.gain.setTargetAtTime(0, now, 0.06);
      this.turboGain?.gain.setTargetAtTime(0, now, 0.06);
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

    const freq = baseFreq + (maxFreq - baseFreq) * rpmNorm * (params.nitroActive ? 1.15 : 1);
    this.oscPrimary?.frequency.setTargetAtTime(freq, now, 0.025);
    this.oscSub?.frequency.setTargetAtTime(freq * 0.5, now, 0.025);

    const filterCutoff = 220 + rpmNorm * 1450 + params.throttle * 650 + (params.nitroActive ? 850 : 0);
    this.engineFilter?.frequency.setTargetAtTime(filterCutoff, now, 0.03);

    const engLevel = (0.09 + params.throttle * 0.14 + rpmNorm * 0.08 + (params.nitroActive ? 0.06 : 0)) * this.engineVol;
    this.engineGain?.gain.setTargetAtTime(engLevel, now, 0.04);

    // Tire screech (authentic high-frequency rubber squeal during drifts)
    const screechLvl = Math.min(0.28, params.driftIntensity * 0.26);
    this.screechGain?.gain.setTargetAtTime(screechLvl, now, 0.035);
    if (this.screechFilter) {
      this.screechFilter.frequency.setTargetAtTime(1020 + params.driftIntensity * 680, now, 0.045);
    }

    // Metallic barrier scrape grind
    const scrapeVal = Math.min(1, Math.max(0, params.railScrape ?? 0));
    this.scrapeGain?.gain.setTargetAtTime(scrapeVal * 0.22, now, 0.03);
    if (this.scrapeFilter && scrapeVal > 0.02) {
      this.scrapeFilter.frequency.setTargetAtTime(1450 + scrapeVal * 950, now, 0.04);
    }

    // Nitrous jet thrust roar + turbo spool whistle
    this.nitroJetGain?.gain.setTargetAtTime(params.nitroActive ? 0.24 : 0, now, 0.04);
    this.nitroJetFilter?.frequency.setTargetAtTime(params.nitroActive ? 540 + rpmNorm * 620 : 420, now, 0.05);
    this.turboGain?.gain.setTargetAtTime(
      params.nitroActive ? 0.055 : Math.max(0, (rpmNorm - 0.55) * 0.03 * params.throttle),
      now,
      0.05,
    );
    this.turboOsc?.frequency.setTargetAtTime(880 + rpmNorm * 1150 + (params.nitroActive ? 650 : 0), now, 0.04);

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

  public playCollision(
    intensity: number,
    kind: 'rail' | 'car' | 'landing' = 'rail',
  ): void {
    if (!this.initialized || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const clamped = Math.min(1.25, Math.max(0.14, intensity));

    // 1. Heavy Sub-Bass Chassis Mass Thud
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(92 * Math.min(1, clamped) + 46, now);
    subOsc.frequency.exponentialRampToValueAtTime(24, now + 0.24);
    subGain.gain.setValueAtTime(0.42 * Math.min(1.1, clamped), now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);
    subOsc.start(now);
    subOsc.stop(now + 0.28);

    if (kind === 'landing') return;

    // 2. Crunching Sheet-Metal & Structural Impact Noise Burst
    if (this.noiseBuffer) {
      const crunchSrc = this.ctx.createBufferSource();
      crunchSrc.buffer = this.noiseBuffer;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(kind === 'car' ? 680 : 940, now);
      bp.frequency.exponentialRampToValueAtTime(240, now + 0.28);
      bp.Q.value = 1.4;

      const crunchGain = this.ctx.createGain();
      crunchGain.gain.setValueAtTime(0.36 * clamped, now);
      crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

      crunchSrc.connect(bp);
      bp.connect(crunchGain);
      crunchGain.connect(this.sfxGain);
      crunchSrc.start(now);
      crunchSrc.stop(now + 0.36);

      // 3. Shattered Glass & Debris Scatter Clatter on medium/heavy crashes
      if (clamped > 0.34) {
        const glassSrc = this.ctx.createBufferSource();
        glassSrc.buffer = this.noiseBuffer;

        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(3600, now);

        const glassGain = this.ctx.createGain();
        glassGain.gain.setValueAtTime(0.001, now);
        glassGain.gain.linearRampToValueAtTime(0.18 * clamped, now + 0.03);
        glassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

        glassSrc.connect(hp);
        hp.connect(glassGain);
        glassGain.connect(this.sfxGain);
        glassSrc.start(now + 0.02);
        glassSrc.stop(now + 0.45);
      }
    }

    // 4. Metallic Ring / Guardrail Clang
    const clangOsc = this.ctx.createOscillator();
    const clangGain = this.ctx.createGain();
    clangOsc.type = 'triangle';
    clangOsc.frequency.setValueAtTime(kind === 'rail' ? 390 : 285, now);
    clangOsc.frequency.exponentialRampToValueAtTime(115, now + 0.19);
    clangGain.gain.setValueAtTime(0.16 * clamped, now);
    clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    clangOsc.connect(clangGain);
    clangGain.connect(this.sfxGain);
    clangOsc.start(now);
    clangOsc.stop(now + 0.22);
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

  public playCarWash(durationSec = 3.2): void {
    this.init();
    if (!this.initialized || !this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // High-pressure water jet & soap foam hiss
    const spraySrc = this.ctx.createBufferSource();
    spraySrc.buffer = this.noiseBuffer;
    spraySrc.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.85;
    filter.frequency.setValueAtTime(950, now);
    filter.frequency.linearRampToValueAtTime(2400, now + durationSec * 0.35);
    filter.frequency.linearRampToValueAtTime(1650, now + durationSec * 0.72);
    filter.frequency.linearRampToValueAtTime(3100, now + durationSec * 0.92);

    const sprayGain = this.ctx.createGain();
    sprayGain.gain.setValueAtTime(0.001, now);
    sprayGain.gain.linearRampToValueAtTime(0.24, now + 0.16);
    sprayGain.gain.setValueAtTime(0.21, now + durationSec * 0.45);
    sprayGain.gain.linearRampToValueAtTime(0.26, now + durationSec * 0.65);
    sprayGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    spraySrc.connect(filter);
    filter.connect(sprayGain);
    sprayGain.connect(this.sfxGain);
    spraySrc.start(now);
    spraySrc.stop(now + durationSec + 0.05);

    // Subtle spotless completion shimmer chime
    const chimeTime = now + durationSec - 0.32;
    for (const [idx, freq] of [1046.5, 1318.5].entries()) {
      const osc = this.ctx.createOscillator();
      const cg = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, chimeTime + idx * 0.09);
      cg.gain.setValueAtTime(0.001, chimeTime + idx * 0.09);
      cg.gain.linearRampToValueAtTime(0.11, chimeTime + idx * 0.09 + 0.03);
      cg.gain.exponentialRampToValueAtTime(0.001, chimeTime + idx * 0.09 + 0.38);
      osc.connect(cg);
      cg.connect(this.sfxGain);
      osc.start(chimeTime + idx * 0.09);
      osc.stop(chimeTime + idx * 0.09 + 0.4);
    }
  }

  public playShutterClick(): void {
    this.init();
    if (!this.initialized || !this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Mechanical mirror slap + crisp high-frequency shutter snap
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3400, now);
    bp.Q.value = 1.6;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.06);

    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1250, now + 0.015);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.065);
    og.gain.setValueAtTime(0.14, now + 0.015);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(og);
    og.connect(this.sfxGain);
    osc.start(now + 0.015);
    osc.stop(now + 0.075);
  }

  public dispose(): void {
    radioEngine.dispose();
    try {
      this.oscPrimary?.stop();
      this.oscSub?.stop();
      this.noiseSource?.stop();
      this.turboOsc?.stop();
      this.sirenOsc?.stop();
      void this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.initialized = false;
  }
}

export const audioEngine = new RacingAudioEngine();
