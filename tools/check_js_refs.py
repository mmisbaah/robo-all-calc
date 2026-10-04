"""Static check for identifiers used but never declared.

An earlier revision referenced `fxStatusBtnEl` while the declaration was named
`fxRefreshBtnEl`. Because the mistake sat inside an event listener, it only
surfaced at runtime as a ReferenceError. This catches that class of bug
without needing a full linter.

Scope: app-scoped identifiers -- those ending in `El`, plus a few naming
conventions used throughout this project. Genuine globals are allow-listed.

Usage:  python tools/check_js_refs.py
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = ['js/app.js', 'js/grapher-ui.js', 'js/grapher.js',
         'js/currency.js', 'js/units.js', 'js/calculator.js', 'js/i18n.js']

# Names provided by the browser, Node, or sibling modules.
GLOBALS = set("""
window document navigator location console fetch setTimeout clearTimeout
Promise Error Object Array Number String Math JSON Date RegExp Boolean Symbol
Map Set WeakMap WeakSet globalThis localStorage sessionStorage FileReader
Blob URL Image CustomEvent Event EventTarget AbortController Intl
isFinite isNaN parseFloat parseInt undefined NaN Infinity
module require process exports global
Calculator CalculatorLib Grapher GrapherMath Units Currency I18n CURRENCY_NAMES
requestAnimationFrame cancelAnimationFrame ResizeObserver IntersectionObserver
TextEncoder TextDecoder structuredClone queueMicrotask alert confirm
""".split())

# Identifiers we consider "app-scoped" and therefore worth verifying.
SUFFIXES = ('El', 'BtnEl', 'PanelEl', 'ViewEl')

DECL_RES = [
    re.compile(r'\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)'),
    re.compile(r'\bfunction\s+([A-Za-z_$][\w$]*)'),
    re.compile(r'\bclass\s+([A-Za-z_$][\w$]*)'),
]
# Destructuring: const { a, b } = x  /  const [a, b] = x
DESTRUCTURE_RES = [
    re.compile(r'\b(?:const|let|var)\s*\{([^}]*)\}\s*='),
    re.compile(r'\b(?:const|let|var)\s*\[([^\]]*)\]\s*='),
]
# Function parameters: (a, b) => and function f(a, b)
PARAM_RES = [
    re.compile(r'function[^(]*\(([^)]*)\)'),
    re.compile(r'\(([^()]*)\)\s*=>'),
    re.compile(r'([A-Za-z_$][\w$]*)\s*=>'),
]
CATCH_RES = [re.compile(r'catch\s*\(\s*([A-Za-z_$][\w$]*)')]
FOR_RES = [re.compile(r'\bfor\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)')]


def declared_names(src):
    names = set()
    for rx in DECL_RES:
        names.update(rx.findall(src))
    for rx in DESTRUCTURE_RES:
        for group in rx.findall(src):
            for part in group.split(','):
                part = part.strip()
                # Handle "a = default" and "a: b" rename forms.
                part = re.split(r'[=:]', part)[0].strip()
                if re.fullmatch(r'[A-Za-z_$][\w$]*(\.\.\.)?', part):
                    names.add(part.rstrip('.'))
    for rx in PARAM_RES:
        for group in rx.findall(src):
            for part in group.split(','):
                part = part.strip()
                if re.fullmatch(r'[A-Za-z_$][\w$]*', part):
                    names.add(part)
    for rx in CATCH_RES + FOR_RES:
        names.update(rx.findall(src))
    return names


def used_names(src):
    """Identifiers that look app-scoped: suffixed `El` or used more than once."""
    counts = {}
    for rx in (re.compile(r'\b([A-Za-z_$][\w$]*)\b'),):
        for m in rx.finditer(src):
            counts[m.group(1)] = counts.get(m.group(1), 0) + 1

    used = set()
    for name, count in counts.items():
        if name.endswith(SUFFIXES) or (count > 1 and re.search(r'^(?!if|for|while|switch|catch|return|typeof|new|function|var|let|const|this|null|true|false)$', name) and re.match(r'^[a-z][\w$]*$', name)):
            used.add(name)
    return used


def main():
    problems = 0
    for rel in FILES:
        path = os.path.join(ROOT, *rel.split('/'))
        with io.open(path, encoding='utf-8') as f:
            src = f.read()

        declared = declared_names(src) | GLOBALS
        # Property names after a dot are not bare identifiers.
        stripped = re.sub(r'\.\s*[A-Za-z_$][\w$]*', '', src)
        # Strip strings and comments so doc text doesn't create false hits.
        stripped = re.sub(r'//[^\n]*', '', stripped)
        stripped = re.sub(r'/\*.*?\*/', '', stripped, flags=re.S)
        stripped = re.sub(r"'[^'\n]*'", "''", stripped)
        stripped = re.sub(r'"[^"\n]*"', '""', stripped)
        stripped = re.sub(r'`[^`]*`', '``', stripped)

        undefined = sorted(
            n for n in used_names(stripped)
            if n not in declared and not n.startswith('Math.')
        )
        if undefined:
            print('%s: possibly undefined -> %s' % (rel, ', '.join(undefined)))
            problems += 1
        else:
            print('%s: ok' % rel)

    print('---- files with findings: %d' % problems)
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
