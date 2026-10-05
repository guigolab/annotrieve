"""GFF column-9 attribute parsing (stdlib only)."""
from __future__ import annotations

from urllib.parse import unquote


def _maybe_unquote(token: str) -> str:
    if "%" in token:
        return unquote(token)
    return token


def parse_attributes(
    attr_column: str,
    single_valued_keys: frozenset[str] | None = None,
    keep_keys: frozenset[str] | None = None,
) -> dict[str, list[str]]:
    """
    Parse GFF column 9 into key → list of values.

    Keys in ``single_valued_keys`` keep commas intact.
    When ``keep_keys`` is set, skip ``key=`` parts not in the set before
    unquote/split (efficient per-file / per-level gating).
    """
    out: dict[str, list[str]] = {}
    if not attr_column or attr_column == ".":
        return out
    single = single_valued_keys or frozenset()
    keep = keep_keys
    for part in attr_column.strip().split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        key, raw = part.split("=", 1)
        key = key.strip()
        if not key:
            continue
        if keep is not None and key not in keep:
            continue
        if key in single:
            token = _maybe_unquote(raw.strip())
            values = [token] if token else []
        else:
            values = []
            for token in raw.split(","):
                token = _maybe_unquote(token.strip())
                if token:
                    values.append(token)
        if not values:
            continue
        if key in out:
            out[key].extend(values)
        else:
            out[key] = values
    return out


def first_attr(attrs: dict[str, list[str]], key: str) -> str | None:
    vals = attrs.get(key)
    if not vals:
        return None
    return vals[0]


def strip_id_prefixes(raw_id: str, prefixes: tuple[str, ...]) -> str:
    for prefix in prefixes:
        if raw_id.startswith(prefix):
            return raw_id[len(prefix) :]
    return raw_id
