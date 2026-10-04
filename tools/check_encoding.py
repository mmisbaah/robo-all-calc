"""Scan project text files for mojibake introduced by PowerShell round-trips."""
import glob
import io
import re
import sys

ROOT = r'E:\OpenCode\Apps\calculator'
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

# Legitimate non-ASCII that must NOT be flagged.
ALLOW = set('\u00d7\u00f7\u00b0\u00b1\u00b7\u2190\u2192\u2191\u2193\u21b5\u21ba\u2318'
            '\u25a0\u25b2\u25bc\u25c6\u25cb\u2600\u2601\u26ab\u2713\u2718\u2014'
            '\u00e9\u00e8\u00ea\u00fc\u00f6\u00e4\u00f1\u00c7\u00b5\u00b0')


def main():
    bad_total = 0
    for path in glob.glob(ROOT + r'\**\*.*', recursive=True):
        if 'node_modules' in path or '\\.' in path.split('\\')[-1]:
            continue
        if not path.lower().endswith(EXT):
            continue
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
    print('---- suspicious sequences: %d' % bad_total)
    return 1 if bad_total else 0


if __name__ == '__main__':
    sys.exit(main())
