
def create_batches(annotations: list[object], batch_size: int=100) -> list[list[object]]:
    return [annotations[i:i+batch_size] for i in range(0, len(annotations), batch_size)]




def safe_dict_key(key) -> str:
    """MongoDB/mongoengine DictField keys may not start with '$'."""
    key = str(key)
    return f"_{key[1:]}" if key.startswith("$") else key


def sanitize_counts(counts: dict) -> dict:
    """Sorted copy of a {name: count} dict with Mongo-safe keys (colliding keys are summed)."""
    safe: dict = {}
    for key, value in sorted(counts.items(), key=lambda item: str(item[0])):
        safe_key = safe_dict_key(key)
        safe[safe_key] = safe.get(safe_key, 0) + value
    return safe
