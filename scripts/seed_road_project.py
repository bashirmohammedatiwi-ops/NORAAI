"""Seed Road Infrastructure Monitoring project with default classes and models."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from scripts.init_db import init_db

if __name__ == "__main__":
    asyncio.run(init_db())
