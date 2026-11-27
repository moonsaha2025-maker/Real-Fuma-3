import * as THREE from 'three';
import { WeatherType } from '../types/game';

export interface WindFieldState {
  dirX: number;
  dirZ: number;
  speedMs: number;
  gustStrength: number; // Normalized 0.25..2.6 for shader foliage bend & turbulence
  angleRad: number;
}

export function createWindFieldState(): WindFieldState {
  return {
    dirX: 0.78,
    dirZ: 0.625,
    speedMs: 6.8,
    gustStrength: 0.72,
    angleRad: 0.67,
  };
}

export function updateWindFieldState(
  out: WindFieldState,
  elapsedTime: number,
  weather: WeatherType,
  dt: number,
): void {
  let baseSpeed = 6.8;
  let gustAmp = 2.6;
  if (weather === 'cloudy') {
    baseSpeed = 11.2;
    gustAmp = 4.2;
  } else if (weather === 'fog') {
    baseSpeed = 2.4;
    gustAmp = 1.1;
  } else if (weather === 'rain') {
    baseSpeed = 15.8;
    gustAmp = 6.4;
  } else if (weather === 'heavy_rain') {
    baseSpeed = 21.5;
    gustAmp = 8.6;
  } else if (weather === 'thunderstorm') {
    baseSpeed = 27.5;
    gustAmp = 11.5;
  }

  // Rolling coastal gust swells (multi-octave non-repeating pattern)
  const swell =
    0.5 +
    0.28 * Math.sin(elapsedTime * 0.34) +
    0.15 * Math.sin(elapsedTime * 0.87 + 1.4) +
    0.07 * Math.cos(elapsedTime * 1.95 - 0.6);

  const targetSpeed = Math.max(1.2, baseSpeed + (swell - 0.45) * gustAmp);
  const targetAngle =
    0.68 +
    Math.sin(elapsedTime * 0.085) * 0.34 +
    Math.sin(elapsedTime * 0.23 + 0.9) * 0.14;

  const damp = 1 - Math.exp(-Math.max(0.001, dt) * 1.85);
  out.speedMs = THREE.MathUtils.lerp(out.speedMs, targetSpeed, damp);
  out.angleRad = THREE.MathUtils.lerp(out.angleRad, targetAngle, damp);
  out.dirX = Math.sin(out.angleRad);
  out.dirZ = Math.cos(out.angleRad);
  out.gustStrength = THREE.MathUtils.clamp(out.speedMs / 10.5, 0.22, 2.75);
}
