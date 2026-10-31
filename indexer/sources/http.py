"""Polite HTTP: an honest User-Agent, a timeout, and a few retries with backoff."""
from __future__ import annotations

import time
import urllib.error
import urllib.request

USER_AGENT = "MelodyOverlapChecker-indexer/0.2 (personal portfolio project; builds a public domain melody index)"


def fetch(url: str, retries: int = 3, timeout: float = 60) -> bytes:
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404 or attempt == retries:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == retries:
                raise
        time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")
