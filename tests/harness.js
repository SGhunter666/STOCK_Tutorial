/**
 * Minimal test harness for browser-side logic tests.
 * Results are rendered to the page and exposed on window for automation.
 */
const tests = [];
let currentSuite = 'Tests';
const failures = [];
let passed = 0;

export function suite(name) {
  currentSuite = name;
  tests.push({ type: 'suite', name });
}

export function test(name, fn) {
  tests.push({ type: 'test', name, fn, suite: currentSuite });
}

export function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'values differ'} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

export function assertClose(actual, expected, tolerance, message) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message || 'values differ'} (expected ${expected} ± ${tolerance}, got ${actual})`);
  }
}

export function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message || 'structures differ'} (expected ${b}, got ${a})`);
}

export async function runAll() {
  const output = [];
  for (const entry of tests) {
    if (entry.type === 'suite') {
      output.push(`\n── ${entry.name} ──`);
      continue;
    }
    try {
      await entry.fn();
      passed += 1;
      output.push(`PASS  ${entry.suite} · ${entry.name}`);
    } catch (err) {
      failures.push({ suite: entry.suite, name: entry.name, message: String(err && err.message ? err.message : err) });
      output.push(`FAIL  ${entry.suite} · ${entry.name}\n      ${err.message}`);
    }
  }

    const summary = {
    passed,
    failed: failures.length,
    total: passed + failures.length,
    failures,
  };
  window.__SMA_TESTS__ = summary;

  const summaryEl = document.getElementById('summary');
  if (summaryEl) {
    summaryEl.className = failures.length ? 'summary fail' : 'summary pass';
    summaryEl.textContent = failures.length
      ? `${failures.length} failed · ${passed} passed`
      : `All ${passed} tests passed`;
  }
  const outputEl = document.getElementById('output');
  if (outputEl) outputEl.textContent = output.join('\n');
  console.log(output.join('\n'));
  if (window.__SMA_TESTS__.failed > 0) {
    console.error('Test failures:', window.__SMA_TESTS__.failures);
  }
  return summary;
}
