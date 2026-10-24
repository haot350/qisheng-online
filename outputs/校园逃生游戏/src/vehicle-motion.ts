import type { DriveInput } from './types.ts';
import type { VehicleDefinition } from './vehicles.ts';

type MotionSample = { speed: number; horizontalSpeed: number; steering: number; brake: number; coast: number };
type WheelMotion = { force: number; brake: number; steering: number; sideFriction: number };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const speedFade = (speed: number, limit: number) => {
  const amount = clamp((limit - Math.abs(speed)) / .6, 0, 1);
  return amount * (2 - amount);
};

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
    const turn = clamp(sample.steering, -1, 1) * clamp(1 - sample.horizontalSpeed / 22, .35, 1);
    const drive = reversing ? 0 : direction * throttle;
    return vehicle.physics.wheels.map(point => {
      const track = clamp(drive + (point[0] < 0 ? turn : -turn), -1, 1);
      return {
        force: brake > .01 ? 0 : -force * track * available / count,
        brake: vehicle.physics.mass * 7.5 * brake * dt / count + rolling,
        steering: 0,
        sideFriction: .12 + .6 * (1 - Math.abs(turn)),
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
