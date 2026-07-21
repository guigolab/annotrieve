import json
from datetime import date, datetime
from typing import Any, Iterable, Iterator, Optional

from fastapi import HTTPException

from helpers import constants as constants_helper
from helpers import parameters as params_helper


def resolve_tsv_field_map(selected_fields: str | list[str] | None) -> dict[str, str]:
    """
    Resolve the TSV column map for export.

    When selected_fields is omitted, returns the frozen production default map.
    When present, appends validated extended columns after the defaults.
    """
    if selected_fields is None:
        return dict(constants_helper.FIELD_TSV_MAP)

    requested = params_helper.normalize_to_list(selected_fields)
    if not requested:
        return dict(constants_helper.FIELD_TSV_MAP)

    invalid = [key for key in requested if key not in constants_helper.FIELD_TSV_EXTENDED_MAP]
    if invalid:
        allowed = ", ".join(constants_helper.FIELD_TSV_EXTENDED_MAP.keys())
        raise HTTPException(
            status_code=400,
            detail=f"Invalid selected_fields: {', '.join(invalid)}. Allowed extended fields: {allowed}",
        )

    redundant = [key for key in requested if key in constants_helper.FIELD_TSV_MAP]
    if redundant:
        raise HTTPException(
            status_code=400,
            detail=f"selected_fields must only contain extended columns. Redundant default fields: {', '.join(redundant)}",
        )

    field_map = dict(constants_helper.FIELD_TSV_MAP)
    requested_set = set(requested)
    for key in constants_helper.FIELD_TSV_EXTENDED_MAP:
        if key in requested_set:
            field_map[key] = constants_helper.FIELD_TSV_EXTENDED_MAP[key]
    return field_map


def dig_mongo_value(doc: dict, mongo_path: str) -> Any:
    """
    Null-safe nested lookup for mongoengine-style paths (double-underscore).

    Returns None when any parent is missing, None, or not a dict — unlike
    mongoengine .scalar(), which raises AttributeError on None parents.
    """
    current: Any = doc
    for part in mongo_path.split("__"):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
        if current is None:
            return None
    return current


def iter_tsv_rows(
    annotations,
    mongo_paths: Iterable[str],
    batch_size: Optional[int] = None,
) -> Iterator[tuple]:
    """
    Project annotation fields via .only().as_pymongo() and yield value tuples.

    Missing nested parents become None instead of crashing mid-stream.
    """
    paths = list(mongo_paths)
    queryset = annotations.only(*paths)
    if batch_size is not None:
        queryset = queryset.batch_size(batch_size)
    for doc in queryset.as_pymongo():
        yield tuple(dig_mongo_value(doc, path) for path in paths)


def format_tsv_cell(value, *, extended: bool = False) -> str:
    if value is None:
        return ""

    if not extended:
        return str(value)

    if isinstance(value, bool):
        return "true" if value else "false"

    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, date):
        return value.isoformat()

    if isinstance(value, list):
        return ";".join("" if item is None else str(item) for item in value)

    if isinstance(value, dict):
        return json.dumps(value, default=str, separators=(",", ":"))

    return str(value)
