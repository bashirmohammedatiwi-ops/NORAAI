"""In-memory cache for model weight bytes — avoids MinIO download on every camera frame."""

from __future__ import annotations

import threading
from collections import OrderedDict
from typing import Callable

_lock = threading.Lock()
_store: OrderedDict[str, bytes] = OrderedDict()
_MAX_ENTRIES = 6


def get_weights_bytes(weights_key: str, loader: Callable[[], bytes]) -> bytes:
    with _lock:
        if weights_key in _store:
            _store.move_to_end(weights_key)
            return _store[weights_key]

    data = loader()
    if not data:
        raise ValueError("Empty weights")

    with _lock:
        _store[weights_key] = data
        _store.move_to_end(weights_key)
        while len(_store) > _MAX_ENTRIES:
            _store.popitem(last=False)
    return data


def invalidate_weights_bytes(weights_key: str) -> None:
    with _lock:
        _store.pop(weights_key, None)
