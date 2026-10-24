import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { alternativeWheelMotion } from '../src/vehicle-motion.ts';
import { vehicleDefinition, type DrivingVehicleId } from '../src/vehicles.ts';
import { createDrivingPhysics, validateDrivingSpawn, type DriveMap, type PhysicsActor } from '../src/vehicle-physics.ts';
import type { DriveInput } from '../src/types.ts';

const IDLE: DriveInput = { steer: 0, throttle: 0, brake: 0, handbrake: false, reverse: false, boost: false, reset: false };
await RAPIER.init();

function fixture(id: DrivingVehicleId) {
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  world.createCollider(RAPIER.ColliderDesc.cuboid(1000, .1, 1000).setTranslation(0, -.1, 0));
  world.step();
  const actors = new Map<number, PhysicsActor>();
  const map: DriveMap = { version: 12, spawn: [0, 0, 12], spawnYaw: 0, npcSpawns: [], repairs: [], barriers: [], bounds: { min: [-1000, -4, -1000], max: [1000, 30, 1000] } };
  const car = createDrivingPhysics(world, map, actors, () => world.createCharacterController(.015), () => {}, id);
  let chassis!: RAPIER.RigidBody;
  world.bodies.forEach(body => { if (body.isDynamic()) chassis = body; });
  const tick = (input = IDLE, boost = false) => { car.beforeStep(input, boost, 1 / 60); world.timestep = 1 / 60; car.prepareContacts(1 / 60); world.step(car.eventQueue, car.physicsHooks); return car.afterStep(1 / 60); };
  const run = (steps: number, input = IDLE, boost = false) => { for (let step = 0; step < steps; step++) tick(input, boost); };
  const addActor = (id: number, x: number, z: number) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, .89, z));
    const capsule = world.createCollider(RAPIER.ColliderDesc.capsule(.575, .3), body), controller = world.createCharacterController(.015);
    actors.set(id, { body, capsule, controller, height: 1.75, vertical: 0, grounded: true });
    return body;
  };
  const dispose = () => { car.dispose(); for (const actor of actors.values()) { if (!actor.thrown) world.removeCharacterController(actor.controller); world.removeRigidBody(actor.body); } world.free(); };
  run(90);
  return { world, car, chassis, actors, map, tick, run, addActor, dispose };
}

test('履带使用左右差速且无前轮转向；滑板车后轮驱动，Space为脚刹', () => {
  const sample = { speed: 0, horizontalSpeed: 0, steering: 1, brake: 0, coast: 0 };
  const tracks = alternativeWheelMotion(vehicleDefinition('tank'), { ...IDLE, steer: 1 }, sample, false, 1 / 60);
  assert.equal(tracks.length, 6);
  assert.ok(tracks.every(wheel => wheel.steering === 0));
  assert.ok(tracks[0].force < 0 && tracks[1].force > 0);
  assert.equal(tracks[0].force, tracks[2].force);
  const scooter = alternativeWheelMotion(vehicleDefinition('scooter'), { ...IDLE, throttle: 1 }, { ...sample, steering: .2 }, false, 1 / 60);
  assert.equal(scooter.length, 2);
  assert.equal(scooter[0].force, 0);
  assert.ok(scooter[1].force < 0);
  assert.equal(scooter[1].steering, 0);
  const braking = alternativeWheelMotion(vehicleDefinition('scooter'), { ...IDLE, throttle: 1, handbrake: true }, sample, false, 1 / 60);
  assert.ok(braking.every(wheel => wheel.force === 0 && wheel.brake > 0));
});

test('出生净空按车型判断，狭窄通道只允许滑板车，非法输入继续拒绝', () => {
  const f = fixture('scooter');
  try {
    for (const x of [-.65, .65]) f.world.createCollider(RAPIER.ColliderDesc.cuboid(.1, 2, 5).setTranslation(x, 2, -30));
    f.tick();
    assert.ok(validateDrivingSpawn(f.world, f.map, [0, 0, -30], 0, 'scooter'));
    assert.equal(validateDrivingSpawn(f.world, f.map, [0, 0, -30], 0, 'tank'), null);
    assert.equal(validateDrivingSpawn(f.world, f.map, [0, 0, -30], 0), null);
    assert.equal(validateDrivingSpawn(f.world, f.map, [NaN, 0, -30], 0, 'scooter'), null);
  } finally { f.dispose(); }
});

test('坦克六点支撑，原地差速转向由真实物理积分产生', () => {
  const f = fixture('tank');
  try {
    const before = f.car.read();
    assert.equal(before.wheels.length, 6);
    assert.equal(before.wheelContacts, 6);
    f.run(120, { ...IDLE, steer: 1 });
    const turned = f.car.read();
    assert.ok(turned.yaw < -.25, `right pivot yaw ${turned.yaw}`);
    assert.ok(turned.position.distanceTo(before.position) < 1.5);
    assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(turned.rotation).y > .94);
    assert.equal(f.car.shift(1), false);
    f.car.setTransmission('manual');
    assert.equal(f.car.read().transmission, 'auto');
    assert.equal(f.car.reset(), true);
  } finally { f.dispose(); }
});

test('新车可前进、制动和倒车，滑板车双轮保持平衡且最高速度受车型约束', () => {
  for (const id of ['tank', 'scooter'] as const) {
    const f = fixture(id);
    try {
      const before = f.car.read();
      assert.equal(before.wheels.length, id === 'tank' ? 6 : 2);
      f.run(600, { ...IDLE, throttle: 1 });
      const moving = f.car.read();
      assert.ok(moving.position.z < before.position.z - 12, `${id} forward ${moving.position.z}`);
      assert.ok(moving.horizontalSpeed > 4 && moving.horizontalSpeed < vehicleDefinition(id).maximumSpeed / 3.6 + .4, `${id} speed ${moving.horizontalSpeed}`);
      assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(moving.rotation).y > .9, `${id} balance`);
      assert.equal(moving.resetRequired, false);
      f.run(120, { ...IDLE, handbrake: true });
      assert.ok(Math.abs(f.car.read().speed) < .5, `${id} brake ${f.car.read().speed}`);
      f.run(150, { ...IDLE, throttle: 1, reverse: true });
      assert.ok(f.car.read().speed < -1, `${id} reverse ${JSON.stringify({ speed: f.car.read().speed, position: f.car.read().position.toArray(), up: new THREE.Vector3(0, 1, 0).applyQuaternion(f.car.read().rotation).toArray(), contacts: f.car.read().wheelContacts })}`);
      f.car.stop();
      assert.ok(f.car.read().velocity.length() < .01);
    } finally { f.dispose(); }
  }
});

test('爆炸只抛飞无遮挡且在范围内的清醒NPC，不重复触发，也不向车辆施加反冲', () => {
  const f = fixture('tank');
  try {
    const visible = f.addActor(1, 3, 0);
    f.addActor(2, 0, -3);
    f.addActor(3, 20, 0);
    f.world.createCollider(RAPIER.ColliderDesc.cuboid(1.2, 2, .15).setTranslation(0, 2, -1.5));
    f.tick();
    const velocity = { ...f.chassis.linvel() };
    const hits = f.car.blast(new THREE.Vector3(0, .08, 0), 6);
    assert.deepEqual(hits, [1]);
    assert.deepEqual({ ...f.chassis.linvel() }, velocity);
    assert.equal(visible.isDynamic(), true);
    assert.ok(visible.linvel().x > 0 && visible.linvel().y > 0);
    assert.deepEqual(f.car.blast(new THREE.Vector3(0, .08, 0), 6), []);
    assert.equal(f.car.npc(1)?.phase, 'flying');
    assert.equal(f.car.npc(2), null);
    f.tick();
    assert.ok(visible.translation().y > .89);
    assert.deepEqual(f.car.blast(new THREE.Vector3(NaN, 0, 0), 6), []);
  } finally { f.dispose(); }
});

test('滑板车真实转向和加速仍保持支撑，新车都不能穿过实体墙', () => {
  for (const id of ['tank', 'scooter'] as const) {
    const f = fixture(id);
    try {
      if (id === 'scooter') {
        f.run(150, { ...IDLE, throttle: .5, steer: -.5 });
        const turn = f.car.read();
        assert.ok(turn.position.x < -.5 && turn.yaw > .15, `scooter turn ${JSON.stringify({ position: turn.position.toArray(), yaw: turn.yaw, speed: turn.speed, up: new THREE.Vector3(0, 1, 0).applyQuaternion(turn.rotation).y, contacts: turn.wheelContacts })}`);
        assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(turn.rotation).y > .85);
        assert.equal(f.car.reset(), true);
        f.run(600, { ...IDLE, throttle: 1 }, true);
        assert.ok(f.car.read().horizontalSpeed > vehicleDefinition(id).maximumSpeed / 3.6 + .5);
        assert.ok(f.car.read().horizontalSpeed < vehicleDefinition(id).boostSpeed / 3.6 + .4);
        assert.equal(f.car.reset(), true);
      }
      f.world.createCollider(RAPIER.ColliderDesc.cuboid(30, 4, .15).setTranslation(0, 4, -7));
      f.run(360, { ...IDLE, throttle: 1 });
      assert.ok(f.car.read().position.z > -6.7, `${id} wall position ${f.car.read().position.z}`);
      assert.ok(f.car.read().rotation.toArray().every(Number.isFinite));
    } finally { f.dispose(); }
  }
});
