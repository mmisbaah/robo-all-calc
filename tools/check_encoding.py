"""Scan project text files for mojibake introduced by PowerShell round-trips."""
import io
import os
import re
import sys

# Resolve relative to this file so the check works in any checkout, on any
# platform, and in CI. A hardcoded absolute path would silently pass on the
# author's machine while failing (or scanning nothing) everywhere else.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = ('.js', '.html', '.css', '.json', '.md', '.py', '.yml', '.svg')

# Sequences that only appear when UTF-8 is decoded as cp1252/latin-1.
# Note: a bare "ã" (U+00E3) is legitimate (São, João) and is NOT flagged; the
# mojibake signature of U+00E3 is the pair U+00C3 followed by U+00A3.
MOJIBAKE = re.compile(
    '[\u00c2\u00e2\u00ef\u00c5\u00c6]'
    '|[\u00c3][\u0080-\u00bf]'
    '|[\u00e2][\u0080-\u00bf]'
    '|[\ufffd]'
)

# The project has ~40 text files. Scanning far fewer than this means the walk
# found nothing, which must be treated as a failure rather than a clean bill of
# health.
MIN_FILES = 20


def main():
    bad_total = 0
    scanned = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        # Skip dependencies and VCS metadata.
        dirnames[:] = [d for d in dirnames
                       if d not in ('node_modules', '.git', '__pycache__')]
        for name in filenames:
            if name.startswith('.'):
                continue
            if not name.lower().endswith(EXT):
                continue
            path = os.path.join(dirpath, name)
            scanned += 1
            try:
                with io.open(path, encoding='utf-8') as f:
                    text = f.read()
            except Exception as exc:
                print('UNREADABLE %s : %s' % (path, exc))
                bad_total += 1
                continue
            for m in MOJIBAKE.finditer(text):
                line = text.count('\n', 0, m.start()) + 1
                snippet = text[max(0, m.start() - 45):m.start() + 25].replace('\n', ' ')
                print('%s:%d  %r' % (path, line, snippet))
                bad_total += 1

    # A check that silently inspects nothing is worse than no check at all: a
    # wrong ROOT would report "0 problems" while validating zero files, which is
    # exactly what happened in CI before the paths were made relative.
    print('---- files scanned: %d' % scanned)
    if scanned < MIN_FILES:
        print('FATAL: only %d files scanned (expected at least %d); '
              'ROOT is probably wrong' % (scanned, MIN_FILES))
        return 1

    print('---- suspicious sequences: %d' % bad_total)
    return 1 if bad_total else 0


if __name__ == '__main__':
    sys.exit(main())
