import optuna
from typing import Any, Callable


def run_hpo(
    n_trials: int,
    train_fn: Callable[[dict[str, Any]], float],
    study_name: str = "hpo_study",
) -> dict[str, Any]:
    def objective(trial: optuna.Trial) -> float:
        params = {
            "learning_rate": trial.suggest_float("learning_rate", 1e-5, 1e-1, log=True),
            "batch_size": trial.suggest_categorical("batch_size", [8, 16, 32, 64]),
            "augment_hsv_h": trial.suggest_float("augment_hsv_h", 0.0, 0.1),
            "augment_hsv_s": trial.suggest_float("augment_hsv_s", 0.0, 0.9),
            "augment_hsv_v": trial.suggest_float("augment_hsv_v", 0.0, 0.9),
        }
        return train_fn(params)

    study = optuna.create_study(direction="maximize", study_name=study_name)
    study.optimize(objective, n_trials=n_trials)

    return {
        "best_params": study.best_params,
        "best_value": study.best_value,
        "n_trials": len(study.trials),
    }
