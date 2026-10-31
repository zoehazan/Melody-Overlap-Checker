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


def download(url: str, dest, log=print, chunk: int = 1 << 20) -> None:
    """Download a large file to dest, resuming a partial download (dest + ".part") if one exists."""
    from pathlib import Path

    dest = Path(dest)
    if dest.exists():
        return
    part = dest.with_name(dest.name + ".part")
    dest.parent.mkdir(parents=True, exist_ok=True)
    have = part.stat().st_size if part.exists() else 0
    headers = {"User-Agent": USER_AGENT}
    if have:
        headers["Range"] = f"bytes={have}-"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as r:
        if have and r.status != 206:  # server ignored the range: start again
            have = 0
        total = have + int(r.headers.get("Content-Length") or 0)
        with open(part, "ab" if have else "wb") as f:
            done, last = have, 0
            while block := r.read(chunk):
                f.write(block)
                done += len(block)
                if total and done - last > total / 20:
                    log(f"  {url.rsplit('/', 1)[-1]}: {done / 1e6:,.0f} / {total / 1e6:,.0f} MB")
                    last = done
    if total and part.stat().st_size != total:
        raise IOError(f"Incomplete download of {url}; run again to resume.")
    part.rename(dest)
