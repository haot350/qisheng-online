use crate::generated_rules::{
    CROUCHING, GRAVITY, JUMP, RADIUS, SKIN, SNAP, STANDING, STEP, STEP_DEPTH,
};
use crate::movement::{Checkpoint, Input};
use rapier3d::control::{CharacterAutostep, CharacterLength, KinematicCharacterController};
use rapier3d::parry::query::ShapeCastOptions;
use rapier3d::prelude::*;
use std::collections::BTreeMap;

pub struct Actor {
    pub body: RigidBodyHandle,
    pub collider: ColliderHandle,
    pub height: f64,
    pub team: String,
    pub human: bool,
    pub state: Checkpoint,
}
pub struct World {
    pub actors: BTreeMap<String, Actor>,
    pub bodies: RigidBodySet,
    pub colliders: ColliderSet,
    pipeline: PhysicsPipeline,
    islands: IslandManager,
    broad: BroadPhaseBvh,
    narrow: NarrowPhase,
    joints: ImpulseJointSet,
    multibody: MultibodyJointSet,
    ccd: CCDSolver,
    pub lowest: f64,
    pub dt: f32,
}
pub fn vec3(a: [f64; 3]) -> Vector<Real> {
    vector![a[0] as f32, a[1] as f32, a[2] as f32]
}
fn iso(a: [f64; 3]) -> Isometry<Real> {
    Isometry::translation(a[0] as f32, a[1] as f32, a[2] as f32)
}
impl Default for World {
    fn default() -> Self {
        Self {
            actors: BTreeMap::new(),
            bodies: RigidBodySet::new(),
            colliders: ColliderSet::new(),
            pipeline: PhysicsPipeline::new(),
            islands: IslandManager::new(),
            broad: BroadPhaseBvh::new(),
            narrow: NarrowPhase::new(),
            joints: ImpulseJointSet::new(),
            multibody: MultibodyJointSet::new(),
            ccd: CCDSolver::new(),
            lowest: -4.0,
            dt: 1.0 / 60.0,
        }
    }
}
impl World {
    pub fn load(&mut self, bytes: &[u8], lowest: f64) -> Result<(), String> {
        if bytes.len() < 8 {
            return Err("collision header missing".into());
        }
        let count = u32::from_le_bytes(bytes[0..4].try_into().unwrap()) as usize;
        let icount = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
        if count % 3 != 0
            || icount % 3 != 0
            || 8usize
                .checked_add(count * 4)
                .and_then(|v| v.checked_add(icount * 4))
                != Some(bytes.len())
        {
            return Err("collision length mismatch".into());
        }
        let mut vertices = Vec::with_capacity(count / 3);
        let mut faces = Vec::with_capacity(icount / 3);
        for v in bytes[8..8 + count * 4].chunks_exact(12) {
            let x = f32::from_le_bytes(v[0..4].try_into().unwrap());
            let y = f32::from_le_bytes(v[4..8].try_into().unwrap());
            let z = f32::from_le_bytes(v[8..12].try_into().unwrap());
            if !x.is_finite() || !y.is_finite() || !z.is_finite() {
                return Err("non-finite collision vertex".into());
            }
            vertices.push(point![x, y, z]);
        }
        for v in bytes[8 + count * 4..].chunks_exact(12) {
            let a = u32::from_le_bytes(v[0..4].try_into().unwrap());
            let b = u32::from_le_bytes(v[4..8].try_into().unwrap());
            let c = u32::from_le_bytes(v[8..12].try_into().unwrap());
            if [a, b, c].into_iter().any(|i| i as usize >= vertices.len()) {
                return Err("collision index out of range".into());
            }
            faces.push([a, b, c]);
        }
        let shape =
            ColliderBuilder::trimesh_with_flags(vertices, faces, TriMeshFlags::FIX_INTERNAL_EDGES)
                .map_err(|e| e.to_string())?;
        *self = Self::default();
        self.lowest = lowest;
        self.colliders.insert(shape);
        self.step(1.0 / 60.0);
        Ok(())
    }
    pub fn add_actor(&mut self, id: &str, position: [f64; 3], team: String, human: bool) {
        self.remove_actor(id);
        let body = self
            .bodies
            .insert(RigidBodyBuilder::kinematic_position_based());
        let collider = self.colliders.insert_with_parent(
            ColliderBuilder::capsule_y(((STANDING - 0.6) / 2.0) as f32, RADIUS as f32),
            body,
            &mut self.bodies,
        );
        self.actors.insert(
            id.into(),
            Actor {
                body,
                collider,
                height: STANDING,
                team,
                human,
                state: Checkpoint::new(position),
            },
        );
        self.restore_position(id, position);
    }
    pub fn remove_actor(&mut self, id: &str) {
        if let Some(a) = self.actors.remove(id) {
            self.bodies.remove(
                a.body,
                &mut self.islands,
                &mut self.colliders,
                &mut self.joints,
                &mut self.multibody,
                true,
            );
        }
    }
    pub fn restore_position(&mut self, id: &str, position: [f64; 3]) {
        if let Some(a) = self.actors.get(id) {
            let p = vector![
                position[0] as f32,
                (position[1] + a.height / 2.0) as f32,
                position[2] as f32
            ];
            let b = &mut self.bodies[a.body];
            b.set_translation(p, true);
            b.set_next_kinematic_translation(p);
            self.bodies
                .propagate_modified_body_positions_to_colliders(&mut self.colliders);
        }
    }
    pub fn restore(&mut self, id: &str, state: Checkpoint) {
        self.posture(id, state.position, state.crouched);
        if let Some(a) = self.actors.get_mut(id) {
            a.state = state.clone();
        }
        self.restore_position(id, state.position);
    }
    pub fn restore_pose(&mut self, id: &str, p: [f64; 3], crouched: bool) {
        self.posture(id, p, crouched);
        self.restore_position(id, p);
    }
    fn fixed_query(&self) -> QueryPipeline<'_> {
        self.broad.as_query_pipeline(
            self.narrow.query_dispatcher(),
            &self.bodies,
            &self.colliders,
            QueryFilter::from(QueryFilterFlags::ONLY_FIXED),
        )
    }
    fn overlaps_fixed(&self, p: [f64; 3], height: f64, radius: f32) -> bool {
        let shape = Capsule::new_y(((height - 0.6) / 2.0) as f32, radius);
        self.fixed_query()
            .intersect_shape(iso(p), &shape)
            .next()
            .is_some()
    }
    fn posture(&mut self, id: &str, p: [f64; 3], crouch: bool) {
        let Some(a) = self.actors.get(id) else { return };
        let height = if crouch { CROUCHING } else { STANDING };
        if a.height == height {
            return;
        }
        if height > a.height && self.overlaps_fixed([p[0], p[1] + height / 2.0, p[2]], height, 0.3)
        {
            return;
        }
        let a = self.actors.get_mut(id).unwrap();
        self.colliders
            .remove(a.collider, &mut self.islands, &mut self.bodies, true);
        a.height = height;
        a.collider = self.colliders.insert_with_parent(
            ColliderBuilder::capsule_y(((height - 0.6) / 2.0) as f32, 0.3),
            a.body,
            &mut self.bodies,
        );
    }
    fn controller() -> KinematicCharacterController {
        KinematicCharacterController {
            offset: CharacterLength::Absolute(SKIN as f32),
            autostep: Some(CharacterAutostep {
                max_height: CharacterLength::Absolute(STEP as f32),
                min_width: CharacterLength::Absolute(STEP_DEPTH as f32),
                include_dynamic_bodies: false,
            }),
            snap_to_ground: Some(CharacterLength::Absolute(SNAP as f32)),
            max_slope_climb_angle: (std::f64::consts::PI * 0.27) as f32,
            min_slope_slide_angle: (std::f64::consts::PI * 0.30) as f32,
            ..Default::default()
        }
    }
    fn compute_move(
        &self,
        id: &str,
        desired: [f64; 3],
    ) -> rapier3d::control::EffectiveCharacterMovement {
        let actor = &self.actors[id];
        let predicate = |handle: ColliderHandle, _: &Collider| {
            !self.actors.values().any(|other| {
                other.collider == handle
                    && actor.human
                    && other.human
                    && actor.team != "none"
                    && actor.team == other.team
            })
        };
        let filter = QueryFilter {
            exclude_collider: Some(actor.collider),
            exclude_rigid_body: Some(actor.body),
            predicate: Some(&predicate),
            ..Default::default()
        };
        let queries = self.broad.as_query_pipeline(
            self.narrow.query_dispatcher(),
            &self.bodies,
            &self.colliders,
            filter,
        );
        let collider = &self.colliders[actor.collider];
        Self::controller().move_shape(
            self.dt,
            &queries,
            collider.shape(),
            collider.position(),
            vec3(desired),
            |_| {},
        )
    }
    pub fn move_actor(
        &mut self,
        id: &str,
        point: [f64; 3],
        desired: [f64; 3],
        crouch: bool,
    ) -> ([f64; 3], bool, bool) {
        self.posture(id, point, crouch);
        self.restore_position(id, point);
        let mut motion = self.compute_move(id, desired);
        if desired[1] <= 0.0
            && (motion.translation.x as f64).hypot(motion.translation.z as f64)
                < desired[0].hypot(desired[2]) * 0.75
        {
            let lift = self.curb_lift(point, desired);
            if lift > 0.0 {
                motion =
                    self.compute_move(id, [desired[0], desired[1].max(0.0) + lift, desired[2]]);
            }
        }
        let position = [
            point[0] + motion.translation.x as f64,
            point[1] + motion.translation.y as f64,
            point[2] + motion.translation.z as f64,
        ];
        let a = &self.actors[id];
        self.bodies[a.body].set_next_kinematic_translation(vector![
            position[0] as f32,
            (position[1] + a.height / 2.0) as f32,
            position[2] as f32
        ]);
        (position, motion.grounded, a.height < 1.5)
    }
    pub fn step(&mut self, dt: f64) {
        self.dt = dt as f32;
        self.bodies
            .propagate_modified_body_positions_to_colliders(&mut self.colliders);
        let parameters = IntegrationParameters {
            dt: self.dt,
            ..Default::default()
        };
        self.pipeline.step(
            &vector![0.0, -18.0, 0.0],
            &parameters,
            &mut self.islands,
            &mut self.broad,
            &mut self.narrow,
            &mut self.bodies,
            &mut self.colliders,
            &mut self.joints,
            &mut self.multibody,
            &mut self.ccd,
            &(),
            &(),
        );
    }
    pub fn ray_distance(&self, origin: [f64; 3], direction: [f64; 3], max: f64) -> f64 {
        let ray = Ray::new(Point::from(vec3(origin)), vec3(direction));
        self.fixed_query()
            .cast_ray(&ray, max as f32, true)
            .map_or(max, |(_, v)| v as f64)
    }
    pub fn support(&self, p: [f64; 3], height: f64) -> Option<(f64, f64, bool)> {
        let ray = Ray::new(
            point![p[0] as f32, (p[1] + 0.14) as f32, p[2] as f32],
            vector![0.0, -1.0, 0.0],
        );
        let (_, hit) = self
            .fixed_query()
            .cast_ray_and_get_normal(&ray, 0.34, true)?;
        if (hit.normal.y as f64) < (std::f64::consts::PI * 0.27).cos() {
            return None;
        }
        let ground = p[1] + 0.14 - hit.time_of_impact as f64;
        if (ground - p[1]).abs() > 0.18 {
            return None;
        }
        let clear =
            !self.overlaps_fixed([p[0], ground + height / 2.0 + 0.025, p[2]], height, 0.285);
        Some((ground, hit.normal.y as f64, clear))
    }
    pub fn safe_route(&self, points: &[[f64; 3]], height: f64) -> bool {
        if points.len() < 2 {
            return false;
        }
        for pair in points.windows(2) {
            let a = pair[0];
            let b = pair[1];
            let steps =
                ((b[0] - a[0]).hypot((b[1] - a[1]).hypot(b[2] - a[2])) / 0.4).ceil() as usize;
            for i in 0..=steps {
                let t = if steps == 0 {
                    0.0
                } else {
                    i as f64 / steps as f64
                };
                let p = [
                    a[0] + (b[0] - a[0]) * t,
                    a[1] + (b[1] - a[1]) * t,
                    a[2] + (b[2] - a[2]) * t,
                ];
                if !self.support(p, height).is_some_and(|s| s.2) {
                    return false;
                }
            }
        }
        true
    }
    fn curb_support(&self, p: [f64; 3]) -> Option<f64> {
        let ray = Ray::new(
            point![p[0] as f32, (p[1] + 0.65) as f32, p[2] as f32],
            vector![0.0, -1.0, 0.0],
        );
        let (_, h) = self
            .fixed_query()
            .cast_ray_and_get_normal(&ray, 1.5, true)?;
        if (h.normal.y as f64) < (std::f64::consts::PI * 0.27).cos() {
            None
        } else {
            Some(p[1] + 0.65 - h.time_of_impact as f64)
        }
    }
    fn curb_lift(&self, p: [f64; 3], desired: [f64; 3]) -> f64 {
        let length = desired[0].hypot(desired[2]);
        if p[1] > 0.8 || length * length < 1e-10 {
            return 0.0;
        }
        let d = [desired[0] / length, 0.0, desired[2] / length];
        let Some(current) = self.curb_support(p) else {
            return 0.0;
        };
        let mut ahead = f64::NEG_INFINITY;
        for distance in [0.16, 0.32, 0.48] {
            let Some(h) = self.curb_support([p[0] + d[0] * distance, p[1], p[2] + d[2] * distance])
            else {
                return 0.0;
            };
            ahead = ahead.max(h);
        }
        if ahead - current < 0.025 || ahead - current > 0.22 || (current - p[1]).abs() > 0.24 {
            return 0.0;
        }
        let delta = ahead - p[1];
        if delta <= -0.01 || delta > 0.22 {
            return 0.0;
        }
        let origin = [p[0], current.max(ahead) + 1.75 / 2.0 + 0.025, p[2]];
        if self.overlaps_fixed(origin, 1.75, 0.285) {
            return 0.0;
        }
        let shape = Capsule::new_y((1.75 - 0.6) / 2.0, 0.285);
        let hit = self.fixed_query().cast_shape(
            &iso(origin),
            &vec3(d),
            &shape,
            ShapeCastOptions {
                max_time_of_impact: 0.48,
                stop_at_penetration: true,
                target_distance: 0.0,
                ..Default::default()
            },
        );
        if hit.is_some_and(|(_, h)| h.time_of_impact < 0.46) {
            return 0.0;
        }
        (delta + 0.03).max(0.008).min(0.04)
    }
    pub fn step_actor(
        &mut self,
        id: &str,
        input: &Input,
        dt: f64,
        blocked: bool,
        stamina_free: bool,
    ) -> Option<Checkpoint> {
        let mut s = self.actors.get(id)?.state.clone();
        let length = input.move_x.hypot(input.move_y);
        let x = input.move_x / length.max(1.0);
        let z = -input.move_y / length.max(1.0);
        let (sin, cos) = input.yaw.sin_cos();
        let mut dir = [x * cos + z * sin, 0.0, -x * sin + z * cos];
        let probe = [
            s.position[0] + dir[0] * 4.6,
            s.position[1],
            s.position[2] + dir[2] * 4.6,
        ];
        let checking = input.action("slide") || s.sliding;
        let route_safe = !checking || self.safe_route(&[s.position, probe], 1.75);
        let stairs = checking
            && (s.position[1] - self.support(probe, 1.75).map_or(-100.0, |v| v.0)).abs() > 0.18;
        let m = s.movement.update(
            dt,
            input,
            s.actual_speed,
            s.grounded,
            route_safe,
            stairs,
            [dir[0], dir[2]],
            blocked,
            stamina_free,
        );
        s.stamina = s.movement.stamina;
        s.sprinting = m.sprinting;
        s.sliding = m.sliding;
        if blocked {
            s.velocity = [0.0; 3];
            self.actors.get_mut(id)?.state = s.clone();
            return Some(s);
        }
        let crouch = input.crouch || m.sliding;
        let speed = if m.sliding {
            m.speed
        } else if crouch {
            1.6
        } else {
            m.speed
        };
        if let Some(direction) = m.direction {
            dir[0] = direction[0];
            dir[2] = direction[1];
        }
        if input.action("jump") && s.grounded && !crouch && !m.sliding {
            s.vertical = JUMP;
            s.grounded = false;
        }
        s.vertical = (s.vertical - GRAVITY * dt).max(-20.0);
        let previous = s.position;
        let moved = self.move_actor(
            id,
            s.position,
            [dir[0] * speed * dt, s.vertical * dt, dir[2] * speed * dt],
            crouch,
        );
        s.position = moved.0;
        s.grounded = moved.1;
        s.crouched = moved.2;
        s.velocity = std::array::from_fn(|i| (s.position[i] - previous[i]) / dt);
        s.actual_speed = s.velocity[0].hypot(s.velocity[2]);
        if s.grounded && s.vertical < 0.0 {
            s.vertical = -0.25;
        }
        if s.grounded
            && self
                .support(s.position, if s.crouched { 1.15 } else { 1.75 })
                .is_some_and(|v| v.2)
        {
            s.last_safe = s.position;
        }
        if s.position[1] < self.lowest - 1.0 || s.position.iter().any(|v| !v.is_finite()) {
            s.position = s.last_safe;
            s.vertical = 0.0;
            self.restore_position(id, s.position);
        }
        self.actors.get_mut(id)?.state = s.clone();
        Some(s)
    }
}
