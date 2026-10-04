"""Repair mojibake caused by a PowerShell Get-Content/Set-Content round-trip.

PowerShell's default ANSI decoding mangles multi-byte UTF-8 into a sequence of
cp1252 characters. To undo it:

  1. Park characters that are not cp1252-encodable (real CJK, emoji, ...) on a
     private-use sentinel so they survive the byte round-trip untouched.
  2. Encode the remainder to cp1252 bytes -- these bytes ARE the original UTF-8.
  3. Decode those bytes as UTF-8.

Usage:  python tools/fix_mojibake.py <path> [<path> ...]
"""
import io
import sys

SENTINEL = '\ue000'


def repair(path):
    with io.open(path, encoding='utf-8') as f:
        s = f.read()

    parked = []
    chars = []
    for ch in s:
        try:
            ch.encode('cp1252')
            chars.append(ch)
        except UnicodeEncodeError:
            parked.append(ch)
            chars.append(SENTINEL)

    try:
        original_bytes = ''.join(chars).encode('cp1252')
    except UnicodeEncodeError as exc:
        print('%s: cannot re-encode (%s)' % (path, exc))
        return s

    try:
        fixed = original_bytes.decode('utf-8')
        mode = 'full'
    except UnicodeDecodeError:
        # Mixed content: repair byte runs that are valid UTF-8, keep the rest.
        out = bytearray()
        repaired = 0
        kept = 0
        for i in range(0, len(original_bytes)):
            out.append(original_bytes[i])
            try:
                chunk = bytes(out).decode('utf-8')
            except UnicodeDecodeError:
                continue
            repaired += len(chunk)
            out.clear()
        fixed_bytes = bytes(out)
        # Anything still undecodable is passed through as latin-1.
        fixed = (original_bytes[:repaired].decode('utf-8')
                 + fixed_bytes.decode('cp1252'))
        kept = len(fixed_bytes)
        mode = 'partial (kept %d raw bytes)' % kept

    # Restore parked characters, in order.
    it = iter(parked)
    fixed = ''.join(next(it) if part == SENTINEL else part
                    for part in fixed.split(SENTINEL))

    print('%s: %s repair' % (path, mode))
    if fixed != s:
        with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(fixed)
        print('  -> written (%d chars)' % len(fixed))
    else:
        print('  -> already clean')
    return fixed


if __name__ == '__main__':
    for target in sys.argv[1:]:
        repair(target)
