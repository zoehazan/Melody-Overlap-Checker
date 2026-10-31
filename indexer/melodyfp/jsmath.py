"""JavaScript number behaviour where Python differs, so ports give bit-identical results."""
import math


def js_round(x: float) -> int:
    """JavaScript Math.round: halves round up (towards +infinity).

    Python's round() uses banker's rounding (round(0.5) == 0, round(2.5) == 2), which would
    give different rhythm values from the web app for gaps in an exact sqrt(2) ratio.
    """
    return math.floor(x + 0.5)


# Characters that JavaScript's String.prototype.trim() removes. Python's str.strip() removes a
# slightly different set (it also strips \x1c-\x1f and \x85), which could rename a track.
_JS_WHITESPACE = "\t\n\v\f\r                  　﻿"


def js_trim(s: str) -> str:
    return s.strip(_JS_WHITESPACE)
