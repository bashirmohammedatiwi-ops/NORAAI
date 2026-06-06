"""Re-queue training jobs when the Celery worker died but the DB still shows RUNNING/PENDING."""
from __future__ import annotations

import sys
import uuid

from celery import Celery
from sqlalchemy import create_engine, text

from app.core.config import get_settings
ACTIVE_TASK_STATES = frozenset({"STARTED", "PROGRESS", "RETRY"})


def main() -> int:
    settings = get_settings()
    engine = create_engine(settings.database_url_sync)
    app = Celery(broker=settings.celery_broker_url, backend=settings.celery_result_backend)
    inspect = app.control.inspect()
    stats = inspect.stats() or {}
    workers_up = bool(stats)

    active_ids: set[str] = set()
    for bucket in (inspect.active() or {}, inspect.reserved() or {}):
        for tasks in bucket.values():
            for task in tasks or []:
                tid = task.get("id")
                if tid:
                    active_ids.add(tid)

    from workers.training.tasks import run_training_job

    requeued = 0
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id, status, celery_task_id
                FROM training_jobs
                WHERE status IN ('PENDING', 'RUNNING')
                ORDER BY created_at DESC
                """
            )
        ).fetchall()

        for job_id, status, celery_task_id in rows:
            job_id_str = str(job_id)
            stale = False
            if not workers_up:
                stale = True
            elif celery_task_id:
                if celery_task_id in active_ids:
                    print(f"skip {job_id_str}: task active on worker")
                    continue
                result = app.AsyncResult(celery_task_id)
                if result.state in ACTIVE_TASK_STATES:
                    print(f"skip {job_id_str}: celery state {result.state}")
                    continue
                stale = result.state in (None, "PENDING")
            else:
                stale = str(status).upper() == "PENDING"

            if not stale:
                print(f"skip {job_id_str}: not stale (status={status})")
                continue

            task = run_training_job.delay(job_id_str)
            conn.execute(
                text("UPDATE training_jobs SET celery_task_id = :tid WHERE id = :jid"),
                {"tid": task.id, "jid": uuid.UUID(job_id_str)},
            )
            conn.commit()
            print(f"requeued {job_id_str} -> {task.id}")
            requeued += 1

    if requeued:
        print(f"Re-queued {requeued} training job(s).")
    else:
        print("No stuck training jobs to re-queue.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
