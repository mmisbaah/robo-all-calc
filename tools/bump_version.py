"""Bump the asset version used for cache busting.

Rewrites every `?v=N` query string in index.html and sw.js, and CACHE_NAME in
sw.js. Always operates on bytes/UTF-8 — never via PowerShell text cmdlets,
which mangle multi-byte characters.

Usage:  python tools/bump_version.py [<new-version>]
        python tools/bump_version.py --show
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
SW = os.path.join(ROOT, 'sw.js')

QUERY_RE = re.compile(r'\?v=\d+')
CACHE_RE = re.compile(r"CACHE_NAME = 'calculator-v\d+'")


def read(path):
    with io.open(path, encoding='utf-8') as f:
        return f.read()


def write(path, text):
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def current_version():
    m = QUERY_RE.search(read(INDEX))
    if not m:
        raise SystemExit('no ?v=N found in index.html')
    return int(m.group(0).split('=')[1])


def show():
    print('current version: v%d' % current_version())
    print('index.html versions: %s' % sorted(set(QUERY_RE.findall(read(INDEX)))))
    print('sw.js versions:     %s' % sorted(set(QUERY_RE.findall(read(SW)))))
    print('cache name:         %s' % CACHE_RE.search(read(SW)).group(0))


def bump(new):
    if new == current_version():
        print('already v%d' % new)
        return
    for path in (INDEX, SW):
        text = read(path)
        text = QUERY_RE.sub('?v=%d' % new, text)
        text = CACHE_RE.sub("CACHE_NAME = 'calculator-v%d'" % new, text)
        write(path, text)
        print('bumped %s -> v%d' % (os.path.basename(path), new))


if __name__ == '__main__':
    if '--show' in sys.argv:
        show()
    elif len(sys.argv) > 1:
        bump(int(sys.argv[1]))
    else:
        bump(current_version() + 1)
