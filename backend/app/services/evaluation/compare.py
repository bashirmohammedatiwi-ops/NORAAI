import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EvaluationResult, ModelArtifact


def compute_winner(models: list[dict]) -> dict | None:
    if not models:
        return None

    def score(m: dict) -> float:
        eval_data = m.get("evaluation", {})
        map_score = eval_data.get("map50_95", 0) or 0
        fps = eval_data.get("fps", 0) or 0
        size = m.get("model_size_mb", 100) or 100
        precision = eval_data.get("precision", 0) or 0
        size_penalty = max(0, 1 - size / 500)
        return map_score * 0.4 + (fps / 100) * 0.2 + size_penalty * 0.2 + precision * 0.2

    scored = [(m, score(m)) for m in models]
    winner = max(scored, key=lambda x: x[1])
    return {"model_id": winner[0]["id"], "score": winner[1], "model": winner[0]}


async def compare_models(db: AsyncSession, model_ids: list[uuid.UUID]) -> dict:
    results = []
    for mid in model_ids:
        artifact = await db.get(ModelArtifact, mid)
        if not artifact:
            continue
        eval_result = await db.execute(
            select(EvaluationResult)
            .where(EvaluationResult.model_artifact_id == mid)
            .order_by(EvaluationResult.created_at.desc())
            .limit(1)
        )
        evaluation = eval_result.scalar_one_or_none()
        results.append(
            {
                "id": str(artifact.id),
                "name": artifact.name,
                "architecture": artifact.architecture,
                "metrics": artifact.metrics,
                "model_size_mb": artifact.model_size_mb,
                "evaluation": {
                    "precision": evaluation.precision if evaluation else None,
                    "recall": evaluation.recall if evaluation else None,
                    "map50": evaluation.map50 if evaluation else artifact.metrics.get("map50"),
                    "map50_95": evaluation.map50_95 if evaluation else artifact.metrics.get("map50_95"),
                    "fps": evaluation.fps if evaluation else None,
                    "inference_ms": evaluation.inference_ms if evaluation else None,
                },
            }
        )

    winner = compute_winner(results)
    return {"models": results, "winner": winner}
