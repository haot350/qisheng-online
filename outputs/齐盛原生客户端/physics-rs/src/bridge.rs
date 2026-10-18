use crate::{
    movement::{Checkpoint, Input, MovementState},
    world::World,
};
use godot::{classes::RefCounted, prelude::*};
struct NativePhysics;
#[gdextension]
unsafe impl ExtensionLibrary for NativePhysics {}

#[derive(GodotClass)]
#[class(base=RefCounted, init)]
pub struct QsRapierWorld {
    base: Base<RefCounted>,
    #[init(val=World::default())]
    world: World,
    remote_ids: std::collections::BTreeSet<String>,
}

fn numeric(v: &Variant) -> Option<f64> {
    v.try_to::<f64>()
        .ok()
        .or_else(|| v.try_to::<i64>().ok().map(|n| n as f64))
        .filter(|n| n.is_finite())
}
fn number(d: &VarDictionary, key: &str, fallback: f64) -> f64 {
    d.get(key).and_then(|v| numeric(&v)).unwrap_or(fallback)
}
fn boolean(d: &VarDictionary, key: &str, fallback: bool) -> bool {
    d.get(key)
        .and_then(|v| v.try_to::<bool>().ok())
        .unwrap_or(fallback)
}
fn vector(d: &VarDictionary, key: &str, fallback: [f64; 3]) -> [f64; 3] {
    let Some(v) = d.get(key) else { return fallback };
    if let Ok(p) = v.try_to::<Vector3>() {
        let values = [p.x as f64, p.y as f64, p.z as f64];
        return std::array::from_fn(|i| if values[i].is_finite() { values[i] } else { fallback[i] });
    }
    if let Ok(p) = v.try_to::<Array<Variant>>() {
        if p.len() == 3 {
            return std::array::from_fn(|i| numeric(&p.at(i)).unwrap_or(fallback[i]));
        }
    }
    fallback
}
fn gdv(v: [f64; 3]) -> Vector3 {
    Vector3::new(v[0] as f32, v[1] as f32, v[2] as f32)
}
fn checkpoint(s: &Checkpoint) -> VarDictionary {
    let mut movement: VarDictionary = dict! {"stamina"=>s.movement.stamina,"recoveryWait"=>s.movement.recovery_wait,"exhausted"=>s.movement.exhausted,"slideLeft"=>s.movement.slide_left,"cooldown"=>s.movement.cooldown,"vertical"=>s.vertical,"actualSpeed"=>s.actual_speed,"lastSafe"=>gdv(s.last_safe)};
    match s.movement.direction {
        Some(v) => movement.set("direction", &varray![v[0], v[1]]),
        None => movement.set("direction", &Variant::nil()),
    };
    dict! {"position"=>gdv(s.position),"velocity"=>gdv(s.velocity),"grounded"=>s.grounded,"crouched"=>s.crouched,"stamina"=>s.stamina,"sprinting"=>s.sprinting,"sliding"=>s.sliding,"actualSpeed"=>s.actual_speed,"vertical"=>s.vertical,"lastSafe"=>gdv(s.last_safe),"movementState"=>&movement}
}
fn parse_checkpoint(d: &VarDictionary, old: &Checkpoint) -> Checkpoint {
    let m = d
        .get("movementState")
        .and_then(|v| v.try_to::<VarDictionary>().ok())
        .unwrap_or_default();
    let direction = m
        .get("direction")
        .and_then(|v| v.try_to::<Array<Variant>>().ok())
        .filter(|a| a.len() == 2)
        .map(|a| {
            [
                numeric(&a.at(0)).unwrap_or(0.0),
                numeric(&a.at(1)).unwrap_or(0.0),
            ]
        });
    let position = vector(d, "position", old.position);
    let velocity = vector(d, "velocity", old.velocity);
    let stamina = number(d, "stamina", old.stamina);
    Checkpoint {
        position,
        velocity,
        grounded: boolean(d, "grounded", old.grounded),
        crouched: boolean(d, "crouched", old.crouched),
        stamina,
        sprinting: boolean(d, "sprinting", false),
        sliding: boolean(d, "sliding", false),
        vertical: number(&m, "vertical", number(d, "vertical", velocity[1])),
        actual_speed: number(
            &m,
            "actualSpeed",
            number(d, "actualSpeed", velocity[0].hypot(velocity[2])),
        ),
        last_safe: vector(&m, "lastSafe", vector(d, "lastSafe", position)),
        movement: MovementState {
            stamina,
            recovery_wait: number(&m, "recoveryWait", 0.0),
            exhausted: boolean(&m, "exhausted", false),
            slide_left: number(&m, "slideLeft", 0.0),
            cooldown: number(&m, "cooldown", 0.0),
            direction,
        },
    }
}
#[godot_api]
impl QsRapierWorld {
    #[func]
    fn load_collision_bytes(&mut self, data: PackedByteArray, lowest_open_elevation: f64) -> bool {
        match self.world.load(data.as_slice(), lowest_open_elevation) {
            Ok(()) => {
                self.remote_ids.clear();
                true
            }
            Err(e) => {
                godot_error!("Native collision rejected: {}", e);
                false
            }
        }
    }
    #[func]
    fn add_actor(&mut self, id: GString, position: Vector3, team: GString, human: bool) {
        self.remote_ids.remove(&id.to_string());
        self.world.add_actor(
            &id.to_string(),
            [position.x as f64, position.y as f64, position.z as f64],
            team.to_string(),
            human,
        );
    }
    #[func]
    fn remove_actor(&mut self, id: GString) {
        self.world.remove_actor(&id.to_string());
    }
    #[func]
    fn restore_actor(&mut self, id: GString, state: VarDictionary) -> VarDictionary {
        let id = id.to_string();
        let Some(a) = self.world.actors.get(&id) else {
            return VarDictionary::new();
        };
        let state = parse_checkpoint(&state, &a.state);
        self.world.restore(&id, state.clone());
        checkpoint(&state)
    }
    #[func]
    fn restore_actors(&mut self, poses: Array<VarDictionary>) {
        let mut active = std::collections::BTreeSet::new();
        for pose in poses.iter_shared() {
            let id = pose
                .get("id")
                .and_then(|v| v.try_to::<GString>().ok())
                .unwrap_or_default()
                .to_string();
            if id.is_empty() {
                continue;
            }
            let p = vector(&pose, "position", [0.0; 3]);
            if self.world.actors.contains_key(&id) && !self.remote_ids.contains(&id) {
                continue;
            }
            if !self.world.actors.contains_key(&id) {
                let team = pose
                    .get("team")
                    .and_then(|v| v.try_to::<GString>().ok())
                    .unwrap_or_else(|| "none".into());
                self.world
                    .add_actor(&id, p, team.to_string(), boolean(&pose, "human", true));
            }
            if let Some(actor) = self.world.actors.get_mut(&id) {
                if let Some(team) = pose.get("team").and_then(|v| v.try_to::<GString>().ok()) {
                    actor.team = team.to_string();
                }
            }
            self.world
                .restore_pose(&id, p, boolean(&pose, "crouched", false));
            active.insert(id);
        }
        for id in self.remote_ids.difference(&active) {
            self.world.remove_actor(id);
        }
        self.remote_ids = active;
    }
    #[func]
    fn step_actor(
        &mut self,
        id: GString,
        input: VarDictionary,
        blocked: bool,
        stamina_free: bool,
    ) -> VarDictionary {
        let actions = input
            .get("actions")
            .and_then(|v| v.try_to::<Array<Variant>>().ok())
            .map(|a| {
                a.iter_shared()
                    .filter_map(|v| v.try_to::<GString>().ok().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        let command = Input {
            move_x: number(&input, "moveX", 0.0),
            move_y: number(&input, "moveY", 0.0),
            yaw: number(&input, "yaw", 0.0),
            sprint: boolean(&input, "sprint", false),
            aim: boolean(&input, "aim", false),
            crouch: boolean(&input, "crouch", false),
            actions,
        };
        self.world
            .step_actor(&id.to_string(), &command, 1.0 / 60.0, blocked, stamina_free)
            .map(|s| checkpoint(&s))
            .unwrap_or_default()
    }
    #[func]
    fn step_world(&mut self, dt: f64) {
        if dt.is_finite() && dt > 0.0 && dt <= 0.1 {
            self.world.step(dt);
        }
    }
    #[func]
    fn capture_actor(&self, id: GString) -> VarDictionary {
        self.world
            .actors
            .get(&id.to_string())
            .map(|a| checkpoint(&a.state))
            .unwrap_or_default()
    }
    #[func]
    fn support_at(&self, point: Vector3, height: f64) -> VarDictionary {
        self.world
            .support([point.x as f64, point.y as f64, point.z as f64], height)
            .map(|s| dict! {"height"=>s.0,"normalY"=>s.1,"clear"=>s.2})
            .unwrap_or_default()
    }
    #[func]
    fn ray_distance(&self, origin: Vector3, direction: Vector3, max_distance: f64) -> f64 {
        self.world.ray_distance(
            [origin.x as f64, origin.y as f64, origin.z as f64],
            [direction.x as f64, direction.y as f64, direction.z as f64],
            max_distance,
        )
    }
    #[func]
    fn set_team(&mut self, id: GString, team: GString) {
        if let Some(a) = self.world.actors.get_mut(&id.to_string()) {
            a.team = team.to_string();
        }
    }
    #[func]
    fn runtime_identity(&self) -> VarDictionary {
        dict! {"rapier"=>"0.30.1","godotRust"=>"0.5.5","godotApi"=>"4.7","fixedHz"=>60,"physicsParityVerified"=>false}
    }
    #[func]
    fn protect_token(&self, token: GString) -> PackedByteArray {
        PackedByteArray::from(
            protect(token.to_string().as_bytes())
                .unwrap_or_default()
                .as_slice(),
        )
    }
    #[func]
    fn unprotect_token(&self, bytes: PackedByteArray) -> GString {
        GString::from(
            &unprotect(bytes.as_slice())
                .and_then(|b| String::from_utf8(b).ok())
                .unwrap_or_default(),
        )
    }
}
#[cfg(windows)]
fn crypt(bytes: &[u8], encrypt: bool) -> Option<Vec<u8>> {
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
        },
    };
    if bytes.len() > 16384 {
        return None;
    }
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    unsafe {
        let ok = if encrypt {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return None;
        }
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData as *mut std::ffi::c_void);
        Some(result)
    }
}
#[cfg(windows)]
fn protect(b: &[u8]) -> Option<Vec<u8>> {
    crypt(b, true)
}
#[cfg(windows)]
fn unprotect(b: &[u8]) -> Option<Vec<u8>> {
    crypt(b, false)
}
#[cfg(not(windows))]
fn protect(_b: &[u8]) -> Option<Vec<u8>> {
    None
}
#[cfg(not(windows))]
fn unprotect(_b: &[u8]) -> Option<Vec<u8>> {
    None
}
