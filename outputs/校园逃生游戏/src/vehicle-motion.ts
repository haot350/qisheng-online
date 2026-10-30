import type { DriveInput } from './types.ts';
import type { VehicleDefinition } from './vehicles.ts';

type MotionSample = { speed: number; horizontalSpeed: number; steering: number; brake: number; coast: number };
type WheelMotion = { force: number; brake: number; steering: number; sideFriction: number };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const speedFade = (speed: number, limit: number) => {
  const amount = clamp((limit - Math.abs(speed)) / .6, 0, 1);
  return amount * (2 - amount);
};

export const TANK_STEERING = Object.freeze({ enterResponse: 5.5, releaseResponse: 9, turningDamping: .85, straightDamping: 2.8 });

/** Track yaw is produced by wheel forces; damping only settles their residual spin. */
export function tankAngularDamping(steering: number) {
  const turning = clamp(Math.abs(steering) * 2, 0, 1);
  return TANK_STEERING.straightDamping + (TANK_STEERING.turningDamping - TANK_STEERING.straightDamping) * turning;
}

/** Raycast wheels provide support; tracks and a balanced rear-drive scooter use separate controls. */
export function alternativeWheelMotion(vehicle: VehicleDefinition, input: DriveInput, sample: MotionSample, boosted: boolean, dt: number): WheelMotion[] {
  const count = vehicle.physics.wheels.length;
  const throttle = clamp(input.throttle, 0, 1), direction = input.reverse ? -1 : 1;
  const reversing = throttle > 0 && sample.speed * direction < -.35;
  const brake = Math.max(sample.brake, input.handbrake ? 1 : 0, reversing ? throttle : 0);
  const maximum = direction < 0 ? vehicle.id === 'tank' ? 4 : 2.5 : (boosted && vehicle.boost ? vehicle.boostSpeed : vehicle.maximumSpeed) / 3.6;
  const available = speedFade(sample.speed, maximum);
  const force = boosted && vehicle.boost ? vehicle.physics.boostForce : vehicle.physics.engineForce;
  const rolling = vehicle.physics.mass * .15 * sample.coast * dt / count;
  if (vehicle.id === 'tank') {
    const intent = clamp(sample.steering, -1, 1);
    const turn = intent * (1 - .45 * clamp(sample.horizontalSpeed / (vehicle.maximumSpeed / 3.6), 0, 1));
    // Reserve the difference between tracks before allocating straight-line power.
    // The longitudinal limiter must never erase steering at maximum speed.
    const drive = reversing ? 0 : clamp(direction * throttle * available, -1 + Math.abs(turn), 1 - Math.abs(turn));
    const turnAmount = 1 - (1 - Math.abs(intent)) ** 3;
    return vehicle.physics.wheels.map(point => {
      const track = drive + (point[0] < 0 ? turn : -turn);
      const turningGrip = Math.abs(point[2]) < .1 ? .28 : .06;
      return {
        force: brake > .01 || reversing ? 0 : -force * track / count,
        brake: vehicle.physics.mass * 7.5 * brake * dt / count + rolling,
        steering: 0,
        // End wheels must slip laterally for tracks to yaw; centre wheels retain
        // lateral support rather than lowering grip across all six contacts.
        sideFriction: .72 + (turningGrip - .72) * turnAmount,
      };
    });
  }
  return vehicle.physics.wheels.map((_point, index) => ({
    force: index === 1 && brake <= .01 && !reversing ? -direction * force * throttle * available : 0,
    brake: vehicle.physics.mass * 7.5 * brake * dt * (index === 0 ? .6 : .4) + rolling,
    steering: index === 0 ? -sample.steering : 0,
    sideFriction: 1,
  }));
}

/** Torque assistance never changes the body pose or bypasses wall contacts. */
export function vehicleBalanceImpulse(vehicle: VehicleDefinition, up: { x: number; y: number; z: number }, angular: { x: number; y: number; z: number }, contacts: number, dt: number) {
  if (up.y <= .2 || contacts === 0 && vehicle.id !== 'scooter') return { x: 0, y: 0, z: 0 };
  const stiffness = vehicle.physics.mass * (vehicle.id === 'scooter' ? 45 : .65);
  const damping = vehicle.physics.mass * (vehicle.id === 'scooter' ? 4 : .18);
  const support = contacts === 0 ? .35 : 1;
  return { x: (-up.z * stiffness - angular.x * damping) * dt * support, y: 0, z: (up.x * stiffness - angular.z * damping) * dt * support };
}
