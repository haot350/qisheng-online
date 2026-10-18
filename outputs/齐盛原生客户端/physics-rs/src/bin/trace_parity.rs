use qs_native_physics::{
    movement::{Checkpoint, Input},
    world::World,
};
use serde::Deserialize;
use std::{fs, path::PathBuf};
#[derive(Deserialize)]
struct Index {
    files: Vec<String>,
}
#[derive(Deserialize)]
struct Actor {
    id: String,
    position: [f64; 3],
    team: String,
}
#[derive(Deserialize)]
struct Sample {
    input: Input,
    state: Checkpoint,
}
#[derive(Deserialize)]
struct Trace {
    id: String,
    collision: String,
    position: [f64; 3],
    team: String,
    actors: Vec<Actor>,
    trace: Vec<Sample>,
}
fn main() {
    let dir = PathBuf::from(
        std::env::args()
            .nth(1)
            .expect("usage trace-parity FIXTURE_DIR"),
    );
    let index: Index = serde_json::from_slice(&fs::read(dir.join("index.json")).unwrap()).unwrap();
    let mut results = Vec::new();
    let mut total = 0;
    let mut passed = true;
    for file in index.files {
        let trace: Trace = serde_json::from_slice(&fs::read(dir.join(file)).unwrap()).unwrap();
        let mut world = World::default();
        world
            .load(&fs::read(dir.join(&trace.collision)).unwrap(), -4.0)
            .unwrap();
        world.add_actor("me", trace.position, trace.team, true);
        for a in trace.actors {
            world.add_actor(&a.id, a.position, a.team, true);
        }
        let mut max_error = 0.0_f64;
        let mut max_velocity = 0.0_f64;
        let mut state_mismatches = 0;
        let mut first_error = None;
        for (n, sample) in trace.trace.iter().enumerate() {
            let actual = world
                .step_actor("me", &sample.input, 1.0 / 60.0, false, false)
                .unwrap();
            world.step(1.0 / 60.0);
            let error = (0..3)
                .map(|i| (actual.position[i] - sample.state.position[i]).powi(2))
                .sum::<f64>()
                .sqrt();
            let velocity = (0..3)
                .map(|i| (actual.velocity[i] - sample.state.velocity[i]).powi(2))
                .sum::<f64>()
                .sqrt();
            max_error = max_error.max(error);
            max_velocity = max_velocity.max(velocity);
            if error > 0.005 && first_error.is_none() {
                first_error =
                    Some(serde_json::json!({"step":n,"actual":actual,"expected":sample.state}));
            }
            if actual.grounded != sample.state.grounded
                || actual.crouched != sample.state.crouched
                || actual.sprinting != sample.state.sprinting
                || actual.sliding != sample.state.sliding
                || (actual.stamina - sample.state.stamina).abs() > 1e-8
                || actual.movement.exhausted != sample.state.movement.exhausted
                || (actual.movement.recovery_wait - sample.state.movement.recovery_wait).abs()
                    > 1e-8
                || (actual.movement.slide_left - sample.state.movement.slide_left).abs() > 1e-8
                || (actual.movement.cooldown - sample.state.movement.cooldown).abs() > 1e-8
                || (actual.vertical - sample.state.vertical).abs() > 1e-8
            {
                state_mismatches += 1;
            }
            total += 1;
        }
        // Rewind a real checkpoint and replay the same subsequent commands.
        // This verifies restoration of timers and posture, not only fresh runs.
        let midpoint = trace.trace.len() / 2;
        world.restore("me", trace.trace[midpoint].state.clone());
        let mut replay_error = 0.0_f64;
        for sample in trace.trace.iter().skip(midpoint + 1) {
            let actual = world
                .step_actor("me", &sample.input, 1.0 / 60.0, false, false)
                .unwrap();
            world.step(1.0 / 60.0);
            let error = (0..3)
                .map(|i| (actual.position[i] - sample.state.position[i]).powi(2))
                .sum::<f64>()
                .sqrt();
            replay_error = replay_error.max(error);
        }
        let ok = max_error <= 0.005
            && max_velocity <= 1e-5
            && replay_error <= 0.005
            && state_mismatches == 0;
        passed &= ok;
        results.push(serde_json::json!({"id":trace.id,"steps":trace.trace.len(),"passed":ok,"maxPositionError":max_error,"maxVelocityError":max_velocity,"maxCheckpointReplayError":replay_error,"stateMismatches":state_mismatches,"firstError":first_error}));
    }
    let report = serde_json::json!({"passed":passed,"steps":total,"rapier":"0.30.1","parry":"0.25.3","nalgebra":"0.34.1","positionThreshold":0.005,"results":results});
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
    fs::write(
        dir.join("rust-parity.json"),
        serde_json::to_vec_pretty(&report).unwrap(),
    )
    .unwrap();
    if !passed {
        std::process::exit(1);
    }
}
