#!/usr/bin/env python3
"""Export web-build content into the Godot project.

This is a build-time bridge, not runtime code:
  - selected, flattened locale keys (academy / history / glossary / unlocks)
  - Academy units 1-32, quiz banks 1-32, glossary terms
  - history scenario catalog and converted daily datasets

Run from anywhere:
    python3 godot/tools/export_from_web.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

WEB_ROOT = Path(__file__).resolve().parents[2]
GODOT_ROOT = Path(__file__).resolve().parents[1]
LOCALE_PREFIXES = {
    "curriculum", "lesson", "quiz", "practice", "glossary", "unlock",
    "achievement", "stage", "history", "branch", "academy", "common",
    "options", "strategies", "futures", "branches", "multiasset",
    "bond", "fx", "commodity", "crypto", "news", "dashboard", "macroPage",
    "nav", "error", "demo", "career", "challenges", "fund", "quant", "tax",
    "sandbox", "settings", "boundaries", "roadmap", "exchange", "clock",
    "liveFeed", "locked", "shell", "toast",
}

# ---------------------------------------------------------------------------
# Minimal JS literal parser (objects, arrays, calls, strings, numbers).
# Only the data-bearing parts of the source files are parsed; functions and
# executable code are skipped. This keeps the port data-driven.
# ---------------------------------------------------------------------------


class Parser:
    def __init__(self, text: str, start: int = 0) -> None:
        self.text = text
        self.i = start
        self.n = len(text)

    def error(self, message: str) -> None:
        raise ValueError(f"{message} at {self.i}: {self.text[self.i:self.i + 80]!r}")

    def skip(self) -> None:
        while self.i < self.n:
            ch = self.text[self.i]
            if ch in " \t\r\n":
                self.i += 1
            elif self.text.startswith("//", self.i):
                end = self.text.find("\n", self.i)
                self.i = self.n if end < 0 else end + 1
            elif self.text.startswith("/*", self.i):
                end = self.text.find("*/", self.i + 2)
                self.i = self.n if end < 0 else end + 2
            else:
                return

    def peek(self) -> str:
        self.skip()
        return self.text[self.i] if self.i < self.n else ""

    def consume(self, expected: str) -> None:
        self.skip()
        if not self.text.startswith(expected, self.i):
            self.error(f"expected {expected!r}")
        self.i += len(expected)

    def parse_value(self) -> Any:
        self.skip()
        ch = self.peek()
        if ch == "{":
            return self.parse_object()
        if ch == "[":
            return self.parse_array()
        if ch in "'\"":
            return self.parse_string()
        if ch == "`":
            return self.parse_template()
        if ch.isdigit() or ch == "-":
            return self.parse_number()
        if ch == "(":
            self.skip_balanced("(", ")")
            self.skip()
            if self.text.startswith("=>", self.i):
                self.i += 2
                self.skip_arrow_body()
            return {"__arrow__": True}
        if ch.isalpha() or ch == "_" or ch == "$":
            name = self.parse_identifier()
            self.skip()
            if self.i < self.n and self.text[self.i] == "(":
                args = self.parse_call_args()
                return {"__call__": name, "args": args}
            # Method chains such as TRUE_FALSE.map((o, i) => ({ ...o, correct: i === 1 }))
            if self.i < self.n and self.text[self.i] == ".":
                self.i += 1
                method = self.parse_identifier()
                self.skip()
                if self.i < self.n and self.text[self.i] == "(":
                    self.skip_arrow_call()
                    if name == "TRUE_FALSE" and method == "map":
                        return [
                            {"key": "common.true"},
                            {"key": "common.false", "correct": True},
                        ]
                return {"__ident__": name}
            if name == "true":
                return True
            if name == "false":
                return False
            if name == "null":
                return None
            if name == "undefined":
                return None
            return {"__ident__": name}
        self.error("unexpected value")

    def parse_object(self) -> dict:
        self.consume("{")
        result: dict[str, Any] = {}
        while True:
            self.skip()
            if self.peek() == "}":
                self.i += 1
                return result
            if self.text.startswith("...", self.i):
                self.skip_spread()
                continue
            key = self.parse_key()
            self.consume(":")
            result[key] = self.parse_value()
            self.skip()
            if self.peek() == ",":
                self.i += 1
            elif self.peek() == "}":
                continue
            else:
                self.error("expected , or }")

    def parse_array(self) -> list:
        self.consume("[")
        result = []
        while True:
            self.skip()
            if self.peek() == "]":
                self.i += 1
                return result
            if self.text.startswith("...", self.i):
                self.skip_spread()
                continue
            result.append(self.parse_value())
            self.skip()
            if self.peek() == ",":
                self.i += 1
            elif self.peek() == "]":
                continue
            else:
                self.error("expected , or ]")

    def parse_key(self) -> str:
        self.skip()
        if self.peek() in "'\"":
            return self.parse_string()
        if self.peek().isdigit():
            return str(self.parse_number())
        return self.parse_identifier()

    def parse_identifier(self) -> str:
        self.skip()
        start = self.i
        while self.i < self.n and (self.text[self.i].isalnum() or self.text[self.i] in "_$"):
            self.i += 1
        if start == self.i:
            self.error("expected identifier")
        return self.text[start:self.i]

    def parse_string(self) -> str:
        quote = self.peek()
        self.i += 1
        out = []
        while self.i < self.n:
            ch = self.text[self.i]
            if ch == "\\":
                self.i += 1
                if self.i >= self.n:
                    break
                esc = self.text[self.i]
                out.append({"n": "\n", "t": "\t", "r": "\r"}.get(esc, esc))
                self.i += 1
            elif ch == quote:
                self.i += 1
                return "".join(out)
            else:
                out.append(ch)
                self.i += 1
        self.error("unterminated string")

    def parse_template(self) -> str:
        self.consume("`")
        out = []
        while self.i < self.n:
            ch = self.text[self.i]
            if ch == "\\":
                self.i += 2
                continue
            if ch == "`":
                self.i += 1
                return "".join(out)
            out.append(ch)
            self.i += 1
        self.error("unterminated template")

    def parse_number(self) -> float | int:
        self.skip()
        start = self.i
        if self.text[self.i] == "-":
            self.i += 1
        while self.i < self.n and (self.text[self.i].isdigit() or self.text[self.i] in ".eE+-"):
            self.i += 1
        raw = self.text[start:self.i]
        try:
            return int(raw) if re.fullmatch(r"-?\d+", raw) else float(raw)
        except ValueError:
            self.error("invalid number")

    def parse_call_args(self) -> list:
        self.consume("(")
        args = []
        while True:
            self.skip()
            if self.peek() == ")":
                self.i += 1
                return args
            args.append(self.parse_value())
            self.skip()
            if self.peek() == ",":
                self.i += 1
            elif self.peek() == ")":
                continue
            else:
                self.error("expected , or )")

    def skip_balanced(self, opening: str, closing: str) -> None:
        self.consume(opening)
        depth = 1
        while self.i < self.n and depth > 0:
            ch = self.text[self.i]
            if ch in "'\"":
                self.parse_string()
                continue
            if ch == "`":
                self.parse_template()
                continue
            if self.text.startswith("//", self.i):
                end = self.text.find("\n", self.i)
                self.i = self.n if end < 0 else end + 1
                continue
            if self.text.startswith("/*", self.i):
                end = self.text.find("*/", self.i + 2)
                self.i = self.n if end < 0 else end + 2
                continue
            if ch == opening:
                depth += 1
            elif ch == closing:
                depth -= 1
            self.i += 1

    def skip_arrow_call(self) -> None:
        self.skip_balanced("(", ")")

    def skip_arrow_body(self) -> None:
        self.skip()
        if self.peek() == "{":
            self.skip_balanced("{", "}")
            return
        while self.i < self.n and self.text[self.i] not in ",)]}":
            if self.text[self.i] in "'\"":
                self.parse_string()
            else:
                self.i += 1

    def skip_spread(self) -> None:
        self.consume("...")
        self.skip()
        if self.peek() == "(":
            self.skip_balanced("(", ")")
        elif self.peek() == "[":
            self.parse_array()
        elif self.peek() == "{":
            self.parse_object()
        else:
            self.parse_value()


def transform(node: Any) -> Any:
    if isinstance(node, list):
        return [transform(item) for item in node]
    if not isinstance(node, dict):
        return node
    if "__call__" in node:
        name = node["__call__"]
        args = [transform(arg) for arg in node["args"]]
        if name == "p":
            return {"type": "p", "key": args[0]}
        if name == "list":
            return {"type": "list", "titleKey": args[0], "items": args[1],
                    "variant": args[2] if len(args) > 2 else "plain"}
        if name == "callout":
            return {"type": "callout", "variant": args[0], "titleKey": args[1], "key": args[2]}
        if name == "formula":
            return {"type": "formula", "key": args[0],
                    "noteKey": args[1] if len(args) > 1 else ""}
        if name == "example":
            return {"type": "example", "titleKey": args[0], "lines": args[1]}
        if name == "term":
            return {"type": "term", "termId": args[0]}
        if name == "demo":
            return {"type": "demo", "id": args[0]}
        if name == "table":
            return {"type": "table", "headKeys": args[0], "rows": args[1]}
        if name == "T":
            return {"key": args[1]}
        if name in ("single", "multi"):
            question_id, prompt, options, explain = args[0], args[1], args[2], args[3]
            normalized = []
            for option in options:
                if isinstance(option, dict):
                    normalized.append({"key": str(option.get("key", "")),
                                       "correct": bool(option.get("correct", False))})
            return {"__question__": True, "id": question_id, "type": name,
                    "promptKey": prompt, "explainKey": explain,
                    "options": normalized,
                    "correctIds": [o["key"] for o in normalized if o["correct"]]}
        if name == "numeric":
            question_id = str(args[0])
            return {"__question__": True, "id": question_id, "type": "numeric",
                    "promptKey": args[1], "explainKey": args[2],
                    "workKey": "quiz.%s.work" % question_id.replace("-", "."),
                    "numericKind": question_id}
        if name == "map":
            return args
        return {"__call__": name, "args": args}
    return {key: transform(value) for key, value in node.items() if key != "__ident__"}


def load_object(text: str, regex: str) -> dict:
    match = re.search(regex, text)
    if not match:
        raise ValueError(f"marker not found: {regex}")
    start = text.index("{", match.end() - 1)
    return Parser(text, start).parse_value()


def load_array(text: str, regex: str) -> list:
    match = re.search(regex, text)
    if not match:
        raise ValueError(f"marker not found: {regex}")
    start = text.index("[", match.end() - 1)
    return Parser(text, start).parse_value()


# ---------------------------------------------------------------------------
# Locales
# ---------------------------------------------------------------------------

def flatten(data: dict, prefix: str = "") -> dict:
    result = {}
    for key, value in data.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            result.update(flatten(value, path))
        elif isinstance(value, (str, int, float, bool)):
            result[path] = str(value)
    return result


def merge_locales() -> None:
    merged = {}
    for code, godot_name in (("zh-CN", "zh_CN"), ("en", "en")):
        source = json.loads((WEB_ROOT / "locales" / f"{code}.json").read_text(encoding="utf-8"))
        selected = {k: v for k, v in flatten(source).items()
                    if k.split(".")[0] in LOCALE_PREFIXES}
        current_path = GODOT_ROOT / "locales" / f"{godot_name}.json"
        current = json.loads(current_path.read_text(encoding="utf-8"))
        combined = dict(selected)
        combined.update(current)
        current_path.write_text(json.dumps(dict(sorted(combined.items())),
                                           ensure_ascii=False, indent=2) + "\n",
                                encoding="utf-8")
        merged[godot_name] = combined
        print(f"locales {godot_name}: {len(combined)} keys "
              f"({len(selected)} from web, {len(current)} preserved)")
    zh, en = merged["zh_CN"], merged["en"]
    missing_en = sorted(set(zh) - set(en))
    missing_zh = sorted(set(en) - set(zh))
    if missing_en or missing_zh:
        print("WARNING locale parity:", len(missing_en), len(missing_zh))
        print(" missing en sample:", missing_en[:10])
        print(" missing zh sample:", missing_zh[:10])


# ---------------------------------------------------------------------------
# Academy
# ---------------------------------------------------------------------------

def _ident(value: Any, default: str) -> str:
    if isinstance(value, dict):
        return str(value.get("__ident__", default))
    return value if isinstance(value, str) else default


def _branch_unit(curriculum_text: str, number: int) -> dict:
    match = re.search(rf"const BRANCH_UNIT_{number} = branchUnit\(", curriculum_text)
    if not match:
        raise ValueError(f"BRANCH_UNIT_{number} not found")
    start = curriculum_text.index("{", match.end())
    raw = Parser(curriculum_text, start).parse_value()
    unit_id = str(raw["id"])
    sections = []
    for index, spec in enumerate(raw.get("sections", [])):
        base = f"lesson.{unit_id}.s{index + 1}"
        variant = _ident(spec.get("variant"), "key")
        blocks = [
            {"type": "p", "key": f"{base}.p1"},
            {"type": "p", "key": f"{base}.p2"},
            {"type": "list", "titleKey": f"{base}.list.title",
             "items": [f"{base}.list.i{n}" for n in (1, 2, 3)], "variant": "plain"},
            {"type": "term", "termId": str(spec["termId"])},
        ]
        demo_id = spec.get("demoId")
        if demo_id:
            blocks.append({"type": "demo", "id": str(demo_id)})
        blocks.append({"type": "example", "titleKey": f"{base}.example.title",
                       "lines": [f"{base}.example.l1", f"{base}.example.l2"]})
        blocks.append({"type": "callout", "variant": variant,
                       "titleKey": f"{base}.key.title", "key": f"{base}.key.text"})
        sections.append({"id": f"s{index + 1}", "titleKey": f"{base}.title",
                         "blocks": blocks})
    practice_raw = raw.get("practice", {})
    practice = {
        "id": f"{unit_id}-p1",
        "check": str(practice_raw.get("check", "")),
        "titleKey": f"practice.{unit_id}.title",
        "requirementKey": f"practice.{unit_id}.requirement",
        "hintKey": f"practice.{unit_id}.hint",
        "actionKey": f"practice.{unit_id}.action",
        "actionHref": str(practice_raw.get("actionHref", "#/academy")),
    }
    if practice_raw.get("demoId"):
        practice["demoId"] = str(practice_raw["demoId"])
    if practice_raw.get("target") is not None:
        practice["target"] = int(practice_raw["target"])
    return {
        "id": unit_id,
        "number": int(raw.get("number", 0)),
        "stage": "branches",
        "branchId": str(raw.get("branchId", "")),
        "optional": True,
        "implemented": True,
        "ported": True,
        "titleKey": f"curriculum.{unit_id}.title",
        "summaryKey": f"curriculum.{unit_id}.summary",
        "minutes": int(raw.get("minutes", 0)),
        "prerequisites": ["u32"],
        "unlocks": [],
        "sections": sections,
        "practice": practice,
        "quiz": {"id": unit_id, "passScore": 80},
    }


def _branch_quizzes(quiz_text: str) -> dict:
    match = re.search(r"Object\.assign\(QUIZ_BANKS,\s*", quiz_text)
    if not match:
        return {}
    start = quiz_text.index("{", match.end())
    raw = Parser(quiz_text, start).parse_value()
    result = {}
    for unit_id in ("b1", "b2", "b3", "b4", "b5", "b6"):
        node = raw.get(unit_id)
        if not isinstance(node, dict) or node.get("__call__") != "branchBank":
            continue
        args = node.get("args", [])
        specs = args[1] if len(args) > 1 else []
        questions = []
        for index, spec in enumerate(specs):
            number = index + 1
            base = f"quiz.{unit_id}.q{number}"
            correct = spec.get("correct", []) if isinstance(spec, dict) else []
            options = [{"key": f"{base}.o{n}", "correct": n in correct} for n in range(1, 5)]
            qtype = "multi" if isinstance(spec, dict) and spec.get("multi") else "single"
            questions.append({
                "id": f"{unit_id}-q{number}",
                "type": qtype,
                "promptKey": f"{base}.prompt",
                "explainKey": f"{base}.explain",
                "options": options,
                "correctIds": [option["key"] for option in options if option["correct"]],
            })
        result[unit_id] = questions
    return result


def export_academy() -> None:
    curriculum_text = (WEB_ROOT / "js" / "education" / "curriculum.js").read_text(encoding="utf-8")
    quiz_text = (WEB_ROOT / "js" / "education" / "quizEngine.js").read_text(encoding="utf-8")
    glossary_text = (WEB_ROOT / "js" / "education" / "glossary.js").read_text(encoding="utf-8")

    units = []
    for number in range(1, 33):
        match = re.search(rf"const UNIT_{number} = ", curriculum_text)
        if not match:
            raise ValueError(f"UNIT_{number} not found")
        start = curriculum_text.index("{", match.end())
        raw = Parser(curriculum_text, start).parse_value()
        unit = transform(raw)
        unit["ported"] = True
        unit["stage"] = f"stage{(number - 1) // 4 + 1}"
        units.append(unit)
    for number in range(1, 7):
        units.append(_branch_unit(curriculum_text, number))

    quiz_banks_raw = load_object(quiz_text, r"export const QUIZ_BANKS\s*=")
    quizzes = {}
    for number in range(1, 33):
        unit_id = f"u{number}"
        raw_questions = quiz_banks_raw.get(unit_id, [])
        questions = []
        for raw in raw_questions:
            question = transform(raw)
            if question.get("__question__"):
                question.pop("__question__", None)
                questions.append(question)
        quizzes[unit_id] = questions
    quizzes.update(_branch_quizzes(quiz_text))

    glossary_terms = transform(load_array(glossary_text, r"export const GLOSSARY_TERMS\s*="))
    branches = transform(load_array(curriculum_text, r"export const BRANCHES\s*="))

    stage_defs = [
        ("stage1", 1, [1, 2, 3, 4], True),
        ("stage2", 2, [5, 6, 7, 8], True),
        ("stage3", 3, [9, 10, 11, 12], True),
        ("stage4", 4, [13, 14, 15, 16], True),
        ("stage5", 5, [17, 18, 19, 20], True),
        ("stage6", 6, [21, 22, 23, 24], True),
        ("stage7", 7, [25, 26, 27, 28], True),
        ("stage8", 8, [29, 30, 31, 32], True),
    ]
    stages = []
    roadmap = []
    for stage_id, number, unit_numbers, ported in stage_defs:
        stages.append({
            "id": stage_id, "number": number,
            "titleKey": f"stage.{stage_id}.title",
            "summaryKey": f"stage.{stage_id}.summary",
            "unitIds": [f"u{n}" for n in unit_numbers],
            "ported": ported,
        })
        for unit_number in unit_numbers:
            if unit_number > 32:
                roadmap.append({
                    "id": f"u{unit_number}", "number": unit_number,
                    "titleKey": f"curriculum.u{unit_number}.title",
                    "summaryKey": f"curriculum.u{unit_number}.summary",
                    "stageId": stage_id, "ported": False,
                })

    payload = {
        "version": 1,
        "units": units,
        "quizzes": quizzes,
        "glossary": glossary_terms,
        "branches": branches,
        "stages": stages,
        "roadmap": roadmap,
    }
    out = GODOT_ROOT / "data" / "academy" / "curriculum.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"academy: {len(units)} units, "
          f"{sum(len(q) for q in quizzes.values())} questions, "
          f"{len(glossary_terms)} glossary terms -> {out}")


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def _scenario_blocks(text: str) -> list[str]:
    match = re.search(r"export const HISTORY_SCENARIOS\s*=\s*\[", text)
    if not match:
        raise ValueError("HISTORY_SCENARIOS not found")
    start = match.end() - 1
    blocks = []
    depth = 1  # we are already inside the outer array
    block_start = None
    i = start + 1
    while i < len(text):
        ch = text[i]
        if ch in "'\"`":
            quote = ch
            i += 1
            while i < len(text):
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == quote:
                    break
                i += 1
        elif ch == "{":
            depth += 1
            if depth == 2 and block_start is None:
                block_start = i
        elif ch == "}":
            depth -= 1
            if depth == 1 and block_start is not None:
                blocks.append(text[block_start:i + 1])
                block_start = None
        elif ch == "]" and depth == 1:
            break
        i += 1
    return blocks


def _events_from(block: str) -> list[dict]:
    events = []
    for match in re.finditer(
            r"\{\s*date:\s*'([^']+)',\s*titleKey:\s*'([^']+)',\s*textKey:\s*'([^']+)',\s*tone:\s*'([^']+)'\s*\}",
            block):
        events.append({"date": match.group(1), "titleKey": match.group(2),
                       "textKey": match.group(3), "tone": match.group(4)})
    return events


def export_history() -> None:
    scenarios_text = (WEB_ROOT / "js" / "data" / "historyScenarios.js").read_text(encoding="utf-8")
    events_2022 = _events_from(
        scenarios_text[scenarios_text.index("const EVENTS_2022"):scenarios_text.index("export const HISTORY_SCENARIOS")]
    )
    scenarios = []
    for block in _scenario_blocks(scenarios_text):
        scenario_id = re.search(r"id:\s*'([^']+)'", block).group(1)
        file_name = re.search(r"fileName:\s*'([^']+)'", block).group(1)
        dataset_path = WEB_ROOT / "data" / "history" / file_name
        dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
        events = events_2022 if "EVENTS_2022" in block else _events_from(block)
        tips = re.findall(r"'(history\.scenario\.[^']+\.tip\d+)'", block)
        scenario = {
            "id": scenario_id,
            "fileName": file_name,
            "source": dataset.get("source", ""),
            "adjusted": bool(dataset.get("adjusted", True)),
            "currency": dataset.get("currency", "USD"),
            "benchmark": dataset.get("benchmark", "QQQ"),
            "start": dataset.get("start", ""),
            "end": dataset.get("end", ""),
            "tickerCount": len(dataset.get("tickers", [])),
            "barCount": len(dataset.get("tickers", [{}])[0].get("bars", [])),
            "titleKey": re.search(r"titleKey:\s*'([^']+)'", block).group(1),
            "subtitleKey": re.search(r"subtitleKey:\s*'([^']+)'", block).group(1),
            "descKey": re.search(r"descKey:\s*'([^']+)'", block).group(1),
            "periodKey": re.search(r"periodKey:\s*'([^']+)'", block).group(1),
            "difficultyKey": re.search(r"difficultyKey:\s*'([^']+)'", block).group(1),
            "tips": tips,
            "events": events,
        }
        scenarios.append(scenario)

        compact = {
            "id": scenario_id,
            "source": dataset.get("source", ""),
            "adjusted": bool(dataset.get("adjusted", True)),
            "currency": dataset.get("currency", "USD"),
            "benchmark": dataset.get("benchmark", "QQQ"),
            "start": dataset.get("start", ""),
            "end": dataset.get("end", ""),
            "tickers": [],
        }
        for ticker in dataset.get("tickers", []):
            compact["tickers"].append({
                "symbol": ticker.get("symbol"),
                "name": ticker.get("name"),
                "sector": ticker.get("sector", ""),
                "exchange": ticker.get("exchange", ""),
                "benchmark": ticker.get("benchmark", ""),
                "pack": ticker.get("pack", ""),
                "bars": ticker.get("bars", []),
                **({"splits": ticker["splits"]} if ticker.get("splits") else {}),
            })
        payload = json.dumps(compact, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        out = GODOT_ROOT / "data" / "history" / f"{scenario_id}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(payload)
        print(f"history {scenario_id}: {len(compact['tickers'])} tickers, "
              f"{len(payload) / 1e6:.2f} MB -> {out.stat().st_size / 1e6:.2f} MB")

    catalog = {
        "version": 1,
        "scenarios": scenarios,
        "warmupDays": 20,
        "startCash": 10000,
        "fee": 1,
        "ticksPerDay": 8,
    }
    out = GODOT_ROOT / "data" / "history" / "catalog.json"
    out.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"history catalog -> {out}")


def main() -> None:
    merge_locales()
    export_academy()
    export_history()


if __name__ == "__main__":
    main()
