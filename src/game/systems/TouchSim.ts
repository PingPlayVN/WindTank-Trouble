import { wrapAngleRad } from './PowerUpSim';

export interface TouchDriveOptions {
  sensitivity?: number; // 0.6 .. 1.5 (default 1.0)
  aimZoneThreshold?: number; // 0.22 .. 0.60 (default 0.42)
}

export interface TouchDriveOutput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  magnitude01: number;
  inPrecisionAimZone: boolean;
}

/**
 * Converts a 2D mobile virtual joystick displacement `(dx, dy)` into standard Tank Trouble
 * inputs (`forward`, `backward`, `left`, `right`) with customizable `sensitivity` and `aimZoneThreshold`:
 * - Higher `sensitivity` (`> 1.0`) scales up thumb input so shorter drags reach full steer & drive!
 * - `< deadzone`: completely still.
 * - `deadzone .. aimZoneThreshold`: **Precision Aim Zone** — rotates the barrel toward the thumb angle
 *   on the spot WITHOUT moving forward, letting mobile players line up multi-bounce bank shots!
 * - `>= aimZoneThreshold`: **Drive Zone** — steers smoothly toward thumb angle & drives forward;
 *   pulling `> 130 deg` opposite the tank's current heading (or holding `forceReverse`)
 *   immediately engages **Emergency Reverse**!
 */
export function computeVectorStickInput(
  dx: number,
  dy: number,
  maxRadius: number,
  tankAngleRad: number,
  forceReverse = false,
  opts?: TouchDriveOptions,
): TouchDriveOutput {
  const sens = Math.max(0.5, Math.min(1.8, opts?.sensitivity ?? 1.0));
  const aimThreshold = Math.max(0.18, Math.min(0.68, opts?.aimZoneThreshold ?? 0.42));
  const deadzone = Math.min(aimThreshold - 0.04, 0.14 / Math.sqrt(sens));

  const dist = Math.hypot(dx, dy);
  const safeMax = Math.max(10, maxRadius);
  const mag01 = Math.min(1, (dist * sens) / safeMax);

  if (mag01 < deadzone) {
    return {
      forward: false,
      backward: forceReverse,
      left: false,
      right: false,
      magnitude01: 0,
      inPrecisionAimZone: false,
    };
  }

  const targetAngle = Math.atan2(dy, dx);
  const fwdDiff = wrapAngleRad(targetAngle - tankAngleRad);
  // Higher sensitivity tightens angular deadband slightly for snappier micro-turns
  const deadband = Math.max(0.032, 0.055 / Math.sqrt(sens));

  if (mag01 < aimThreshold && !forceReverse) {
    return {
      forward: false,
      backward: false,
      left: fwdDiff < -deadband,
      right: fwdDiff > deadband,
      magnitude01: mag01,
      inPrecisionAimZone: true,
    };
  }

  // Emergency Reverse when pulling opposite tank nose (> 130 deg) or holding Reverse button!
  if (forceReverse || Math.abs(fwdDiff) > (130 * Math.PI) / 180) {
    const revTarget = wrapAngleRad(targetAngle + Math.PI);
    const revDiff = wrapAngleRad(revTarget - tankAngleRad);
    return {
      forward: false,
      backward: true,
      left: Math.abs(fwdDiff) > (130 * Math.PI) / 180 ? revDiff < -deadband : fwdDiff < -deadband,
      right: Math.abs(fwdDiff) > (130 * Math.PI) / 180 ? revDiff > deadband : fwdDiff > deadband,
      magnitude01: mag01,
      inPrecisionAimZone: false,
    };
  }

  return {
    forward: Math.abs(fwdDiff) < Math.PI * 0.52,
    backward: false,
    left: fwdDiff < -deadband,
    right: fwdDiff > deadband,
    magnitude01: mag01,
    inPrecisionAimZone: false,
  };
}
