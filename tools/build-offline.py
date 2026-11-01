#!/usr/bin/env python3
"""Build the single-file offline HTML version of Stock Market Academy.

The source project uses ES modules and fetches JSON locales, which browsers block
on file:// URLs. This script inlines the module graph, both dictionaries and all
CSS into one classic-script HTML file that works by double-clicking.

Usage:
    python3 tools/build-offline.py
Output:
    dist/stock-market-academy-offline.html
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENTRY = 'js/app.js'
OUT = ROOT / 'dist' / 'stock-market-academy-offline.html'

CSS_FILES = ['theme.css', 'layout.css', 'components.css', 'academy.css', 'views.css', 'history.css']
HISTORY_DATA_DIR = ROOT / 'data' / 'history'

IMPORT_RE = re.compile(r"import\s*\{([^}]*)\}\s*from\s*['\"]([^'\"]+)['\"]\s*;", re.S)
EXPORT_DECL_RE = re.compile(
    r"^export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)",
    re.M,
)
EXPORT_STRIP_RE = re.compile(
    r"^export\s+(?=(async\s+function|function|class|const|let|var)\s+)",
    re.M,
)


def module_id(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def resolve(importer: Path, spec: str) -> Path:
    if not spec.startswith('.'):
        raise SystemExit(f'Non-relative import is not supported: {spec} in {importer}')
    target = (importer.parent / spec).resolve()
    if not target.exists():
        raise SystemExit(f'Missing module: {spec} imported by {importer}')
    return target


class Module:
    def __init__(self, path: Path):
        self.path = path
        self.id = module_id(path)
        source = path.read_text(encoding='utf-8')
        self.body, self.imports, self.exports = self._parse(source)

    def _parse(self, source: str):
        imports = []
        for match in IMPORT_RE.finditer(source):
            names = [name.strip() for name in match.group(1).split(',') if name.strip()]
            for name in names:
                if ' as ' in name:
                    raise SystemExit(f'Aliased imports are not supported: {name} in {self.path}')
            imports.append((match.group(2), names))

        source = IMPORT_RE.sub('', source)

        if re.search(r"^\s*import\s", source, re.M):
            raise SystemExit(f'Unsupported import syntax in {self.path}')
        if re.search(r"^\s*export\s*\{", source, re.M) or re.search(r"^\s*export\s+default", source, re.M):
            raise SystemExit(f'Unsupported export syntax in {self.path}')

        exports = [m.group(2) for m in EXPORT_DECL_RE.finditer(source)]
        body = EXPORT_STRIP_RE.sub('', source)
        if re.search(r"^\s*export\s", body, re.M):
            raise SystemExit(f'Unsupported export remains in {self.path}')
        return body, imports, exports


def load_graph():
    modules = {}
    order = []
    visiting = set()

    def visit(path: Path):
        if path in modules:
            return
        if path in visiting:
            raise SystemExit(f'Circular import detected at {module_id(path)}')
        visiting.add(path)
        module = Module(path)
        modules[path] = module
        for spec, _names in module.imports:
            visit(resolve(path, spec))
        visiting.remove(path)
        order.append(module)

    visit((ROOT / ENTRY).resolve())

    # Validate every imported name exists in the target module.
    for module in modules.values():
        for spec, names in module.imports:
            target = modules[resolve(module.path, spec)]
            exported = set(target.exports)
            missing = [name for name in names if name not in exported]
            if missing:
                raise SystemExit(
                    f'Module {module.id} imports {missing} from {target.id}, '
                    f'but {target.id} exports {sorted(exported)}'
                )
    return order


def build_bundle(modules):
    chunks = [
        '(function () {',
        '  "use strict";',
        '  var __modules = Object.create(null);',
        '  var __cache = Object.create(null);',
        '  function __def(id, factory) { __modules[id] = factory; }',
        '  function __import(id) {',
        '    if (__cache[id]) return __cache[id];',
        '    if (!__modules[id]) throw new Error("Unknown module: " + id);',
        '    var exports = __modules[id](__import);',
        '    __cache[id] = exports;',
        '    return exports;',
        '  }',
    ]
    for module in modules:
        chunks.append(f'  __def({json.dumps(module.id)}, function (__import) {{')
        for spec, names in module.imports:
            target = module_id(resolve(module.path, spec))
            chunks.append(f'    var {{ {", ".join(names)} }} = __import({json.dumps(target)});')
        chunks.append(module.body)
        if module.exports:
            chunks.append(f'    return {{ {", ".join(module.exports)} }};')
        else:
            chunks.append('    return {};')
        chunks.append('  });')
    chunks.append(f'  __import({json.dumps(module_id((ROOT / ENTRY).resolve()))});')
    chunks.append('})();')
    return '\n'.join(chunks)


def build_html(bundle, locales, css, history_data):
    locales_json = json.dumps(locales, ensure_ascii=False, separators=(',', ':'))
    history_json = json.dumps(history_data, ensure_ascii=False, separators=(',', ':'))
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Stock Market Academy · 股票市场学院</title>
<meta name="description" content="Bilingual financial education and stock trading simulator. Virtual companies, virtual money, real concepts. Offline single-file build.">
<meta name="color-scheme" content="dark">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230b1421'/%3E%3Cpath d='M16 40l10-10 8 8 14-16' stroke='%235eead4' stroke-width='5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<style>
{css}
</style>
</head>
<body>
<div id="app">
  <div class="boot-splash">
    <span class="boot-mark">SMA</span>
    <span class="spinner"></span>
  </div>
</div>
<div id="toast-layer" class="toast-layer" aria-live="polite"></div>
<div id="modal-root" class="modal-root"></div>
<noscript><div class="protocol-warning"><strong>需要启用 JavaScript / JavaScript is required</strong><span>Stock Market Academy 在浏览器本地运行。</span></div></noscript>
<script>
window.__SMA_OFFLINE__ = true;
window.__SMA_EMBEDDED_LOCALES__ = {locales_json};
window.__SMA_HISTORY_DATA__ = {history_json};
</script>
<script>
{bundle}
</script>
</body>
</html>
"""


def load_history_data():
    files = sorted(HISTORY_DATA_DIR.glob('*.json'))
    if not files:
        raise SystemExit(f'No historical data found in {HISTORY_DATA_DIR}')
    return {
        path.stem: json.loads(path.read_text(encoding='utf-8'))
        for path in files
    }


def main():
    modules = load_graph()
    bundle = build_bundle(modules)
    locales = {
        'zh-CN': json.loads((ROOT / 'locales/zh-CN.json').read_text(encoding='utf-8')),
        'en': json.loads((ROOT / 'locales/en.json').read_text(encoding='utf-8')),
    }
    css = '\n'.join((ROOT / 'css' / name).read_text(encoding='utf-8') for name in CSS_FILES)
    history_data = load_history_data()
    html = build_html(bundle, locales, css, history_data)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding='utf-8')
    size_kb = OUT.stat().st_size / 1024
    print(f'Built {OUT.relative_to(ROOT)}')
    print(f'Modules bundled: {len(modules)}')
    print(f'History datasets: {", ".join(history_data.keys())}')
    print(f'Size: {size_kb:.1f} KB')


if __name__ == '__main__':
    main()
