extends "res://tests/test_base.gd"


func run() -> void:
	describe("rng")
	var rng := SmaRng.new("sim-exchange-v1")
	var expected := [0.5272678590845317, 0.3293657419271767, 0.602008517133072,
		0.16212835372425616, 0.8143840860575438, 0.7870144105982035]
	for index in expected.size():
		approx(rng.next(), float(expected[index]), 1e-12, "mulberry32 sequence %d" % index)
	eq(rng.get_state()["state"], 2674255374, "rng state after six draws")

	describe("rng-normal")
	var normal_rng := SmaRng.new("sim-exchange-v1")
	var normals := [-0.541106440122269, 0.9936281983603701, 0.5283986838337065, 0.8577658202251018]
	for index in normals.size():
		approx(normal_rng.normal(), float(normals[index]), 1e-12, "normal %d" % index)

	describe("rng-state")
	var state_rng := SmaRng.new("restore-me")
	state_rng.next()
	var saved := state_rng.get_state()
	var first := state_rng.next()
	state_rng.set_state(saved)
	approx(state_rng.next(), first, 1e-15, "restored stream matches")

	describe("rng-normal-state")
	var spare_rng := SmaRng.new("spare")
	spare_rng.normal()
	check(spare_rng.get_state()["spare"] != null, "Box-Muller caches the spare value")
	var spare_state := spare_rng.get_state()
	var next_normal := spare_rng.normal()
	spare_rng.set_state(spare_state)
	approx(spare_rng.normal(), next_normal, 1e-15, "spare value survives restore")

	describe("rng-seeds")
	check(SmaRng.new("a").next() != SmaRng.new("b").next(), "different seeds differ")
	approx(SmaRng.new("same").next(), SmaRng.new("same").next(), 0.0, "same seed replays")
