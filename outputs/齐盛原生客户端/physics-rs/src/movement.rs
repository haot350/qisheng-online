use crate::generated_rules::*;
use serde::{Deserialize, Serialize};

/// Values are emitted by export-movement-fixtures.mjs from canonical TS.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementState {
    pub stamina: f64,
    pub recovery_wait: f64,
    pub exhausted: bool,
    pub slide_left: f64,
    pub cooldown: f64,
    pub direction: Option<[f64; 2]>,
}
impl Default for MovementState {
    fn default() -> Self {
        Self {
            stamina: STAMINA,
            recovery_wait: 0.0,
            exhausted: false,
            slide_left: 0.0,
            cooldown: 0.0,
            direction: None,
        }
    }
}
#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Input {
    pub move_x: f64,
    pub move_y: f64,
    pub yaw: f64,
    pub sprint: bool,
    pub aim: bool,
    pub crouch: bool,
    pub actions: Vec<String>,
}
impl Input {
    pub fn action(&self, kind: &str) -> bool {
        self.actions.iter().any(|a| a == kind)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub position: [f64; 3],
    pub velocity: [f64; 3],
    pub grounded: bool,
    pub crouched: bool,
    pub stamina: f64,
    pub sprinting: bool,
    pub sliding: bool,
    pub actual_speed: f64,
    pub vertical: f64,
    pub last_safe: [f64; 3],
    pub movement: MovementState,
}
impl Checkpoint {
    pub fn new(position: [f64; 3]) -> Self {
        Self {
            position,
            velocity: [0.0; 3],
            grounded: false,
            crouched: false,
            stamina: STAMINA,
            sprinting: false,
            sliding: false,
            actual_speed: 0.0,
            vertical: 0.0,
            last_safe: position,
            movement: MovementState::default(),
        }
    }
}
pub struct MovementOutput {
    pub speed: f64,
    pub sprinting: bool,
    pub sliding: bool,
    pub direction: Option<[f64; 2]>,
}
impl MovementState {
    pub fn update(
        &mut self,
        dt: f64,
        input: &Input,
        actual_speed: f64,
        grounded: bool,
        route_safe: bool,
        stairs: bool,
        direction: [f64; 2],
        blocked: bool,
        stamina_free: bool,
    ) -> MovementOutput {
        let mut sprinting = false;
        if !blocked {
            self.cooldown = (self.cooldown - dt).max(0.0);
            if !input.sprint || input.aim {
                self.exhausted = false;
            }
            if self.slide_left > 0.0 {
                self.slide_left = (self.slide_left - dt).max(0.0);
                if !grounded || !route_safe || stairs {
                    self.slide_left = 0.0;
                }
                if self.slide_left == 0.0 {
                    self.direction = None;
                }
            }
            let length = direction[0].hypot(direction[1]);
            if input.action("slide")
                && self.slide_left == 0.0
                && self.cooldown <= 0.0
                && actual_speed >= SLIDE_MIN_SPEED
                && self.stamina >= SLIDE_COST
                && grounded
                && route_safe
                && !stairs
                && length > 1e-5
            {
                self.slide_left = SLIDE_SECONDS;
                self.cooldown = SLIDE_COOLDOWN;
                if !stamina_free {
                    self.stamina -= SLIDE_COST;
                }
                self.recovery_wait = RECOVERY_DELAY;
                self.direction = Some([direction[0] / length, direction[1] / length]);
            }
            let moving = input.move_x.hypot(input.move_y) > 0.05;
            sprinting = self.slide_left == 0.0
                && input.sprint
                && !input.aim
                && moving
                && !self.exhausted
                && self.stamina > 0.0;
            if sprinting && !stamina_free {
                self.stamina = (self.stamina - dt * STAMINA / SPRINT_SECONDS).max(0.0);
                self.recovery_wait = RECOVERY_DELAY;
                if self.stamina == 0.0 {
                    self.exhausted = true;
                    sprinting = false;
                }
            } else if !sprinting && self.slide_left == 0.0 {
                let previous = self.recovery_wait;
                self.recovery_wait = (previous - dt).max(0.0);
                let recovery = (dt - previous).max(0.0);
                if recovery > 0.0 {
                    self.stamina =
                        (self.stamina + recovery * STAMINA / RECOVERY_SECONDS).min(STAMINA);
                }
            }
        }
        let sliding = self.slide_left > 0.0;
        let speed = if sliding {
            WALK + (SPRINT - WALK) * self.slide_left / SLIDE_SECONDS
        } else if sprinting {
            SPRINT
        } else {
            WALK
        };
        MovementOutput {
            speed,
            sprinting,
            sliding,
            direction: self.direction,
        }
    }
}
