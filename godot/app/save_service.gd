## Atomic JSON save files under user://. The game uses one career slot by
## default; tests and future sandbox modes can pass an explicit path.
class_name SmaSaveService
extends RefCounted

const SAVE_PATH := "user://saves/career.json"


static func _ensure_dir(dir_path: String) -> bool:
	var global := ProjectSettings.globalize_path(dir_path)
	if DirAccess.dir_exists_absolute(global):
		return true
	return DirAccess.make_dir_recursive_absolute(global) == OK


static func exists(path: String = SAVE_PATH) -> bool:
	return FileAccess.file_exists(path)


static func write(payload: Dictionary, path: String = SAVE_PATH) -> bool:
	var dir_path := path.get_base_dir()
	if not _ensure_dir(dir_path):
		push_error("SmaSaveService: cannot create save directory %s" % dir_path)
		return false
	var tmp_path := path + ".tmp"
	var file := FileAccess.open(tmp_path, FileAccess.WRITE)
	if file == null:
		push_error("SmaSaveService: cannot open temp save %s" % tmp_path)
		return false
	file.store_string(JSON.stringify(payload))
	file.close()
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return false
	var file_name := path.get_file()
	if dir.file_exists(file_name):
		dir.remove(file_name)
	return dir.rename(file_name + ".tmp", file_name) == OK


static func read(path: String = SAVE_PATH) -> Dictionary:
	if not exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed


static func clear(path: String = SAVE_PATH) -> void:
	if not exists(path):
		return
	var dir := DirAccess.open(path.get_base_dir())
	if dir != null:
		dir.remove(path.get_file())


static func export_to(path: String, payload: Dictionary) -> bool:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(payload))
	file.close()
	return true


static func import_from(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	return parsed if typeof(parsed) == TYPE_DICTIONARY else {}
