"""Structural sanity checks for index.html.

Verifies every element the JS references actually exists, that tag nesting is
balanced, and that no attribute value has been clipped by an encoding mishap.
"""
import io
import os
import re
import sys
from html import unescape as html_unescape

# Resolve relative to this file so the check works in any checkout, on any
# platform, and in CI.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
        'meta', 'param', 'source', 'track', 'wbr'}


def main():
    problems = 0

    with io.open(INDEX, encoding='utf-8') as f:
        html = f.read()

    # 1. Balanced tag nesting.
    stack = []
    for m in re.finditer(r'<(/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(/?)>', html):
        closing, tag, attrs, self_close = m.group(1), m.group(2).lower(), m.group(3), m.group(4)
        if tag in VOID or self_close:
            continue
        if closing:
            if not stack:
                print('UNBALANCED: stray </%s>' % tag)
                problems += 1
            elif stack[-1] != tag:
                print('UNBALANCED: </%s> closes <%s> at offset %d'
                      % (tag, stack[-1], m.start()))
                problems += 1
                if tag in stack:
                    while stack and stack.pop() != tag:
                        pass
            else:
                stack.pop()
        else:
            stack.append(tag)
    if stack:
        print('UNBALANCED: unclosed tags %s' % stack)
        problems += 1

    # 2. Every getElementById target in the JS must exist in the HTML.
    ids_in_html = set(re.findall(r'\bid="([^"]+)"', html))
    wanted = set()
    for js in ('app.js', 'grapher-ui.js', 'grapher.js'):
        path = os.path.join(ROOT, 'js', js)
        with io.open(path, encoding='utf-8') as f:
            src = f.read()
        wanted |= set(re.findall(r"getElementById\('([^']+)'\)", src))
    # Ids that are created at runtime by the graph UI.
    runtime = {'import-file', 'fn-text', 'fn-main', 'fn-second', 'fn-tmin', 'fn-tmax'}
    missing = sorted(w for w in wanted if w not in ids_in_html and w not in runtime)
    if missing:
        print('MISSING IDS referenced by JS: %s' % ', '.join(missing))
        problems += 1

    # 3. Clipped attributes: a quoted value that never closes before '>'.
    for m in re.finditer(r'<[a-zA-Z][^>]*?="[^"<]*$', html, re.M):
        seg = html[max(0, m.start() - 60):m.end() + 40].replace('\n', ' ')
        print('CLIPPED ATTR near: ...%s...' % seg)
        problems += 1

    # 4. Duplicate ids.
    dupes = [i for i in ids_in_html if len(re.findall(r'\bid="%s"' % re.escape(i), html)) > 1]
    if dupes:
        print('DUPLICATE IDS: %s' % ', '.join(sorted(dupes)))
        problems += 1

    # 5. Every data-i18n key must exist in the dictionaries.
    with io.open(os.path.join(ROOT, 'js', 'i18n.js'), encoding='utf-8') as f:
        i18n = f.read()
    en_block = i18n.split('en: {')[1].split('ja: {')[0]
    en_keys = set(re.findall(r"'([a-zA-Z]+\.[a-zA-Z]+)':", en_block))
    used = set(re.findall(r'data-i18n(?:-aria|-title)?="([^"]+)"', html))
    missing_keys = sorted(used - en_keys)
    if missing_keys:
        print('MISSING i18n KEYS: %s' % ', '.join(missing_keys))
        problems += 1

    # 6. An aria-label must contain the button's own visible text
    #    (axe `label-content-name-mismatch`).
    #
    #    This went unnoticed for a long time because the 30 scientific-pad
    #    buttons ship inside a `hidden` section, so audits skipped them until
    #    someone switched scientific mode on. Checking the source catches it
    #    regardless of what is visible at load time.
    #
    #    Only buttons with a genuine *text* label are checked. A button whose
    #    content is just an icon (the toolbar's emoji) has no visible text for
    #    the name to match, and axe correctly ignores those.
    mismatched = []
    for m in re.finditer(r'<button\b([^>]*)>([^<]*)</button>', html, re.S):
        attrs, visible = m.group(1), html_unescape(m.group(2)).strip()
        label_match = re.search(r'aria-label="([^"]*)"', attrs)
        if not label_match:
            continue
        if not visible:
            continue
        # Skip icon-only content: no letter or digit means it is a glyph.
        if not re.search(r'[0-9A-Za-z]', visible):
            continue
        label = html_unescape(label_match.group(1)).strip()
        if not label.lower().startswith(visible.lower()):
            mismatched.append('%r labelled %r' % (visible, label))
    if mismatched:
        print('ARIA LABEL DOES NOT CONTAIN VISIBLE TEXT:')
        for item in mismatched:
            print('    ' + item)
        problems += 1

    print('ids in html: %d | js refs: %d | i18n keys used: %d' %
          (len(ids_in_html), len(wanted), len(used)))
    print('---- problems: %d' % problems)
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
