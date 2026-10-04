"""Self-test: does check_js_refs.py actually detect an undefined identifier?

Temporarily injects a known-bad reference (the historical `fxStatusBtnEl`
typo) into a copy of app.js and asserts the checker flags it.
"""
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECKER = os.path.join(ROOT, 'tools', 'check_js_refs.py')
APP = os.path.join(ROOT, 'js', 'app.js')

BAD_LINE = "    if (fxStatusBtnEl) fxStatusBtnEl.setAttribute('data-state', 'live');\n"


def run_checker():
    proc = subprocess.run([sys.executable, CHECKER],
                          capture_output=True, text=True)
    return proc.stdout


def main():
    baseline = run_checker()
    if 'files with findings: 0' not in baseline:
        print('baseline is not clean; aborting self-test')
        print(baseline)
        return 1
    print('baseline clean')

    with io.open(APP, encoding='utf-8') as f:
        original = f.read()

    try:
        # Inject the bug into updateFxStatus.
        mutated = original.replace(
            "    fxStatusEl.setAttribute('data-state', degraded ? 'stale' : 'live');",
            "    fxStatusEl.setAttribute('data-state', degraded ? 'stale' : 'live');\n" + BAD_LINE,
            1)
        if mutated == original:
            print('could not find injection point; aborting')
            return 1
        with io.open(APP, 'w', encoding='utf-8', newline='\n') as f:
            f.write(mutated)

        detected = run_checker()
        if 'fxStatusBtnEl' in detected and 'files with findings: 0' not in detected:
            print('PASS: injected bug detected')
            print([l for l in detected.splitlines() if 'fxStatusBtnEl' in l][0])
            return 0
        print('FAIL: injected bug NOT detected')
        print(detected)
        return 1
    finally:
        with io.open(APP, 'w', encoding='utf-8', newline='\n') as f:
            f.write(original)
        after = run_checker()
        print('restored; baseline clean again:', 'files with findings: 0' in after)


if __name__ == '__main__':
    sys.exit(main())
