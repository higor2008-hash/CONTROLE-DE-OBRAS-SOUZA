"""Resolve the simple defined-name shapes the Múltipla uses for Import.* ranges."""
import re
from openpyxl.utils import column_index_from_string as ci

REF = r"(?:'?([^'!]+)'?)!\$?([A-Z]+)\$?(\d+)"

def _cell(s):
    m = re.fullmatch(REF, s.strip())
    return m.group(1), ci(m.group(2)), int(m.group(3))

def _offset(s):
    m = re.fullmatch(r"OFFSET\((.+),(-?\d+),(-?\d+)\)", s.strip())
    if not m:
        return _cell(s)
    sh, c, r = _cell(m.group(1))
    return sh, c + int(m.group(3)), r + int(m.group(2))

def resolve(text):
    """Return (sheet, c1, r1, c2, r2) or None when the name is not a plain range."""
    t = text.strip()
    if t.startswith("="):
        t = t[1:]
    m = re.fullmatch(r"(?:'?([^'!]+)'?)!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)", t)
    if m:
        return m.group(1), ci(m.group(2)), int(m.group(3)), ci(m.group(4)), int(m.group(5))
    m = re.fullmatch(r"(?:'?([^'!]+)'?)!\$?(\d+):\$?(\d+)", t)
    if m:  # linhas inteiras, ex.: ORÇAMENTO!$14:$14
        return m.group(1), 1, int(m.group(2)), 16384, int(m.group(3))
    parts = re.split(r":(?=OFFSET|'?[^!:]+!)", t)
    try:
        if len(parts) == 2:
            a, b = _offset(parts[0]), _offset(parts[1])
            return a[0], a[1], a[2], b[1], b[2]
        a = _offset(t)
        return a[0], a[1], a[2], a[1], a[2]
    except Exception:
        return None

