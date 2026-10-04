"""Prove the keyboard-target tests fail against the pre-fix behaviour.

Temporarily makes shouldDeferToField always return false, which is what the app
did before the guard existed: every keystroke went to the calculator and '='
was preventDefault()ed away. Restores the file afterwards.
"""
import io
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, 'js', 'keyboard-target.js')
TEST = os.path.join(ROOT, 'tests', 'keyboard-target.test.js')

# The test under scrutiny is JavaScript, so it must run under node.
# (sys.executable here is Python and would only report a syntax error.)
NODE = 'node'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, 'js', 'keyboard-target.js')
TEST = os.path.join(ROOT, 'tests', 'keyboard-target.test.js')

with io.open(TARGET, encoding='utf-8') as f:
    original = f.read()

needle = "    if (!isTextEntry(target)) return false;\n    return key !== 'Escape';"
if needle not in original:
    print('could not find the guard to mutate')
    sys.exit(2)

buggy = original.replace(needle, "    return false;", 1)

# Keep the backup on the same volume as the target: os.replace cannot move
# across drives, and the temp dir is usually on C: while the repo is on E:.
backup = TARGET + '.selftest-backup'


def restore():
    # copy2, not replace/move: the two paths are on different drives here.
    shutil.copyfile(backup, TARGET)
    os.remove(backup)


try:
    shutil.copyfile(TARGET, backup)
    with io.open(TARGET, 'w', encoding='utf-8', newline='\n') as f:
        f.write(buggy)

    proc = subprocess.run([NODE, TEST], capture_output=True, text=True)
    output = (proc.stdout or '') + (proc.stderr or '')

    fail_lines = [l for l in output.splitlines() if l.startswith('FAIL ')]
    print('with the guard removed:')
    print('  exit code    : %d' % proc.returncode)
    print('  failing tests: %d' % len(fail_lines))
    for line in fail_lines[:4]:
        print('    ' + line[:96])
    caught = proc.returncode != 0 and len(fail_lines) > 0
finally:
    restore()

with io.open(TARGET, encoding='utf-8') as f:
    assert f.read() == original, 'keyboard-target.js was not restored'
print('restored : byte-identical = True')

proc2 = subprocess.run([NODE, TEST], capture_output=True, text=True)
print('clean run: exit %d' % proc2.returncode)

if not caught:
    print('SELFTEST FAILED: the tests pass even without the guard')
    sys.exit(1)
print('SELFTEST PASSED - the tests have teeth')
