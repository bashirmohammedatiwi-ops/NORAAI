"""Quick local stack status (DB jobs + Celery)."""
from sqlalchemy import create_engine, text
from celery import Celery
import redis

from app.core.config import get_settings

s = get_settings()
e = create_engine(s.database_url_sync)
with e.connect() as c:
    print("=== training_jobs ===")
    for row in c.execute(
        text("SELECT id, name, status, created_at FROM training_jobs ORDER BY created_at DESC LIMIT 5")
    ):
        print(row)
    print("=== ingestion_records ===")
    for row in c.execute(
        text("SELECT status, count(*) FROM ingestion_records GROUP BY status")
    ):
        print(row)
    print("=== dataset images ===")
    try:
        n = c.execute(text("SELECT count(*) FROM dataset_images")).scalar()
        print("dataset_images", n)
    except Exception as ex:
        print("dataset_images error", ex)

r = redis.Redis(host="127.0.0.1", port=6379, db=1)
print("redis ingestion", r.llen("ingestion"), "training", r.llen("training"), "unacked", r.hlen("unacked"))

app = Celery(broker=s.celery_broker_url, backend=s.celery_result_backend)
ins = app.control.inspect()
print("workers", list((ins.stats() or {}).keys()))
print("active", ins.active())
print("reserved", ins.reserved())
