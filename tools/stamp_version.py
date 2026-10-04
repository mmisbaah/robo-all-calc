"""Stamp a content-derived asset version for cache busting.

Why this exists
---------------
The version used to be a hand-incremented integer, bumped by hand. That is a
trap: forget the bump after editing styles.css and the service worker keeps
serving the old file, the page looks broken for no visible reason, and the
mistake is invisible in review. It happened repeatedly during development.

The token is now a hash of the actual asset contents, so it cannot go stale:
change a byte of styles.css or any js/ module and the token changes with it.

What is hashed
--------------
Everything the browser caches as part of the app shell:

    styles.css, js/*.js

Deliberately NOT hashed:
  - sw.js and index.html, which *carry* the token (hashing them would be
    self-referential and never converge)
  - vendor/nerdamer.js, which is cached on demand rather than precached

Usage:
    python tools/stamp_version.py           # rewrite index.html and sw.js
    python tools/stamp_version.py --check   # exit 1 if either is out of date
    python tools/stamp_version.py --show
"""
import hashlib
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
SW = os.path.join(ROOT, 'sw.js')
# The browser test runner loads the same modules and tests. It was left on an
# old ?v=27 token, which served a stale copy of a test file and made a passing
# suite look like it had silently skipped it.
TESTS_INDEX = os.path.join(ROOT, 'tests', 'index.html')
JS_DIR = os.path.join(ROOT, 'js')
CSS = os.path.join(ROOT, 'styles.css')

# The token is hex, so it matches digits too; ordering matters not.
QUERY_RE = re.compile(r'\?v=[0-9a-f]+')
CACHE_RE = re.compile(r"CACHE_NAME = 'calculator-v[0-9a-f]+'")


def read(path):
    with io.open(path, encoding='utf-8') as f:
        return f.read()


def write(path, text):
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def hashed_files():
    """Assets whose contents define the version, in a stable order."""
    files = [CSS]
    if os.path.isdir(JS_DIR):
        for name in sorted(os.listdir(JS_DIR)):
            if name.endswith('.js'):
                files.append(os.path.join(JS_DIR, name))
    return files


def compute_token():
    digest = hashlib.sha256()
    for path in hashed_files():
        rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
        digest.update(rel.encode('utf-8'))
        with open(path, 'rb') as f:
            digest.update(f.read())
    return digest.hexdigest()[:8]


def current_token():
    m = QUERY_RE.search(read(INDEX))
    if not m:
        raise SystemExit('no ?v=<token> found in index.html')
    return m.group(0).split('=', 1)[1]


def stamp_targets():
    """Files carrying the token. sw.js has no query strings of its own but is
    still stamped for its CACHE_NAME."""
    targets = [(INDEX, True), (SW, True)]
    if os.path.exists(TESTS_INDEX):
        targets.append((TESTS_INDEX, True))
    return targets


def show():
    token = current_token()
    expected = compute_token()
    print('current token : v%s' % token)
    print('content hash  : v%s' % expected)
    print('index.html    : %s' % ', '.join(sorted(set(QUERY_RE.findall(read(INDEX))))))
    print('sw.js         : %s' % ', '.join(sorted(set(QUERY_RE.findall(read(SW))))))
    cache = CACHE_RE.search(read(SW))
    print('cache name    : %s' % (cache.group(0) if cache else '(not found)'))
    print('hashed inputs : %d files' % len(hashed_files()))
    print('status        : %s' % ('UP TO DATE' if token == expected else 'STALE - run npm run bump'))


def apply(expected=None):
    token = expected or compute_token()
    before = current_token()
    for path, has_query in stamp_targets():
        text = read(path)
        if has_query:
            text = QUERY_RE.sub('?v=%s' % token, text)
        text = CACHE_RE.sub("CACHE_NAME = 'calculator-v%s'" % token, text)
        write(path, text)
    if before == token:
        print('already v%s (%s)' % (token, ', '.join(
            os.path.basename(p) for p, _ in stamp_targets())))
    else:
        print('stamped v%s -> v%s (%s)' % (before, token, ', '.join(
            os.path.basename(p) for p, _ in stamp_targets())))


def check():
    token = current_token()
    expected = compute_token()
    if token != expected:
        print('STALE: index.html is v%s but the assets hash to v%s' % (token, expected))
        print('run: python tools/stamp_version.py')
        return 1
    # The test runner must not lag behind, or it silently runs stale tests.
    if os.path.exists(TESTS_INDEX):
        m = QUERY_RE.search(read(TESTS_INDEX))
        testToken = m.group(0).split('=', 1)[1] if m else None
        if testToken != token:
            print('STALE: tests/index.html is v%s but should be v%s' % (testToken, token))
            print('run: python tools/stamp_version.py')
            return 1
    print('cache-busting token matches asset contents (v%s)' % token)
    return 0


if __name__ == '__main__':
    if '--show' in sys.argv:
        show()
    elif '--check' in sys.argv:
        sys.exit(check())
    else:
        apply()