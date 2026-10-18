class_name QsRenderProfile
extends RefCounted

# Visual policy only. The owner supplies measured work cost and active frame time;
# loading/paused/diagnostic frames are excluded before observation.
const DOWN_AFTER_SECONDS := 3.0
const UP_AFTER_SECONDS := 12.0
const COOLDOWN_SECONDS := 8.0
var quality := 0
var mobile := false
var target_fps := 60
var automatic_stage := 0
var _configured := false
var _mean_ms := 0.0
var _slow_seconds := 0.0
var _fast_seconds := 0.0
var _cooldown := 0.0

func configure(value: int, touch_device: bool, cap: int = 60) -> Dictionary:
	var next_quality := clampi(value,0,4)
	var next_fps := cap if cap > 0 else 60
	if _configured and next_quality == quality and mobile == touch_device and target_fps == next_fps: return profile()
	quality = next_quality
	mobile = touch_device
	target_fps = next_fps
	automatic_stage = 0
	_configured = true
	_mean_ms = 0.0
	_slow_seconds = 0.0
	_fast_seconds = 0.0
	_cooldown = 0.0
	return profile()

func profile() -> Dictionary:
	if quality == 1: return {"scale":0.65,"msaa":Viewport.MSAA_DISABLED,"shadows":false}
	if quality == 2: return {"scale":1.0,"msaa":Viewport.MSAA_2X,"shadows":true}
	if quality == 3: return {"scale":1.0,"msaa":Viewport.MSAA_4X,"shadows":true}
	if quality == 4: return {"scale":0.55,"msaa":Viewport.MSAA_DISABLED,"shadows":false}
	if automatic_stage == 1: return {"scale":0.75 if mobile else 0.85,"msaa":Viewport.MSAA_DISABLED,"shadows":false}
	if automatic_stage == 2: return {"scale":0.60 if mobile else 0.70,"msaa":Viewport.MSAA_DISABLED,"shadows":false}
	return {"scale":0.85 if mobile else 1.0,"msaa":Viewport.MSAA_DISABLED if mobile else Viewport.MSAA_2X,"shadows":not mobile}

func observe_frame(frame_ms: float, eligible: bool, elapsed_ms: float = -1.0) -> bool:
	if quality != 0: return false
	var active_ms := elapsed_ms if elapsed_ms >= 0 else maxf(frame_ms,1000.0/float(target_fps))
	if not eligible or not is_finite(frame_ms) or not is_finite(active_ms) or frame_ms <= 0 or active_ms <= 0 or frame_ms > 100.0 or active_ms > 100.0:
		_slow_seconds = 0.0
		_fast_seconds = 0.0
		return false
	var seconds := minf(active_ms*0.001,0.1)
	_cooldown = maxf(0.0,_cooldown-seconds)
	_mean_ms = frame_ms if _mean_ms <= 0 else lerpf(_mean_ms,frame_ms,1.0-exp(-seconds/0.75))
	var budget_ms := 1000.0/float(target_fps)
	if _mean_ms > budget_ms*1.20:
		_slow_seconds += seconds
		_fast_seconds = 0.0
	elif _mean_ms < budget_ms*0.95:
		_fast_seconds += seconds
		_slow_seconds = 0.0
	else:
		_slow_seconds = 0.0
		_fast_seconds = 0.0
	if _cooldown > 0: return false
	if _slow_seconds >= DOWN_AFTER_SECONDS and automatic_stage < 2:
		automatic_stage += 1
	elif _fast_seconds >= UP_AFTER_SECONDS and automatic_stage > 0:
		automatic_stage -= 1
	else: return false
	_slow_seconds = 0.0
	_fast_seconds = 0.0
	_cooldown = COOLDOWN_SECONDS
	return true
