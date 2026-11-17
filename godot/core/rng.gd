## Deterministic PRNG (mulberry32 + Box-Muller), mirrored from the web build.
## Every random decision in the simulation comes from this stream so a save file
## can be restored and replayed exactly. No global RNG is used anywhere.
class_name SmaRng
extends RefCounted

const MASK := 0xFFFFFFFF
const TWO_POW_32 := 4294967296.0

var state: int = 1
var spare: Variant = null


func _init(seed_value: Variant = "") -> void:
	var hashed := _hash_seed(str(seed_value))
	state = hashed if hashed != 0 else 1


## FNV-1a over UTF-16 code units, matching String.prototype.charCodeAt in the web build.
static func _hash_seed(value: String) -> int:
	var h := 2166136261
	var bytes := value.to_utf16_buffer()
	var index := 0
	while index + 1 < bytes.size():
		var code: int = bytes[index] | (bytes[index + 1] << 8)
		h = h ^ code
		h = (h * 16777619) & MASK
		index += 2
	return h & MASK


## 32-bit signed multiply emulation; GDScript ints are 64-bit so a direct
## product of two 32-bit values can overflow before the mask is applied.
static func _imul(a: int, b: int) -> int:
	var al: int = a & 0xFFFF
	var ah: int = (a >> 16) & 0xFFFF
	var bl: int = b & 0xFFFF
	var bh: int = (b >> 16) & 0xFFFF
	var low: int = al * bl
	var cross: int = ah * bl + al * bh
	return (low + ((cross & 0xFFFF) << 16)) & MASK


func next() -> float:
	state = (state + 0x6D2B79F5) & MASK
	var t := state
	t = _imul(t ^ (t >> 15), t | 1)
	t = (t ^ (t + _imul(t ^ (t >> 7), t | 61))) & MASK
	return float((t ^ (t >> 14)) & MASK) / TWO_POW_32


func normal() -> float:
	if spare != null:
		var cached: float = spare
		spare = null
		return cached
	var u := 0.0
	var v := 0.0
	while u == 0.0:
		u = next()
	while v == 0.0:
		v = next()
	var radius := sqrt(-2.0 * log(u))
	spare = radius * sin(2.0 * PI * v)
	return radius * cos(2.0 * PI * v)


func range_float(min_value: float, max_value: float) -> float:
	return min_value + (max_value - min_value) * next()


func rand_int(min_value: int, max_value: int) -> int:
	return int(floor(range_float(float(min_value), float(max_value + 1))))


func pick(items: Array) -> Variant:
	if items.is_empty():
		return null
	return items[int(floor(next() * float(items.size())))]


func shuffled(items: Array) -> Array:
	var copy := items.duplicate()
	for index in range(copy.size() - 1, 0, -1):
		var other := int(floor(next() * float(index + 1)))
		var tmp: Variant = copy[index]
		copy[index] = copy[other]
		copy[other] = tmp
	return copy


func get_state() -> Dictionary:
	return {"state": state, "spare": spare}


func set_state(saved: Dictionary) -> void:
	if saved.is_empty():
		return
	state = int(saved.get("state", state)) & MASK
	var cached: Variant = saved.get("spare", null)
	spare = float(cached) if cached != null else null
