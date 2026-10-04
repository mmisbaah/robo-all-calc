"""Inject one deliberate aria-label violation, prove the check catches it, restore.

Run:  python selftest_check_html_labels.py
"""
import io
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
CHECK = os.path.join(ROOT, 'tools', 'check_html.py')

with io.open(INDEX, encoding='utf-8') as f:
    original = f.read()

# A realistic mistake: the label was written before the glyph was shortened.
victim = 'aria-label="x² (Square)"'
if victim not in original:
    print('could not find the expected label to mutate: %r' % victim)
    sys.exit(2)

mutated = original.replace(victim, 'aria-label="Square"', 1)

backup = os.path.join(tempfile.gettempdir(), 'index_selftest_backup.html')
shutil.copy2(INDEX, backup)

try:
    with io.open(INDEX, 'w', encoding='utf-8', newline='\n') as f:
        f.write(mutated)

    proc = subprocess.run([sys.executable, CHECK], capture_output=True, text=True)
    output = proc.stdout + proc.stderr

    caught = proc.returncode != 0 and 'ARIA LABEL DOES NOT CONTAIN VISIBLE TEXT' in output
    mentioned = "'Square'" in output

    print('injected : %s  ->  %s' % (victim, 'aria-label="Square"'))
    print('exit code: %d' % proc.returncode)
    print('reported : %s' % mentioned)
    print('caught   : %s' % caught)
finally:
    shutil.copy2(backup, INDEX)
    os.remove(backup)

# Confirm the file is back and clean.
with io.open(INDEX, encoding='utf-8') as f:
    restored = f.read()
assert restored == original, 'index.html was not restored byte-for-byte'

proc2 = subprocess.run([sys.executable, CHECK], capture_output=True, text=True)
print('restored : byte-identical = True')
print('clean run: exit %d' % proc2.returncode)

if not caught:
    print('SELFTEST FAILED: the checker did not catch the injected violation')
    sys.exit(1)
print('SELFTEST PASSED')
