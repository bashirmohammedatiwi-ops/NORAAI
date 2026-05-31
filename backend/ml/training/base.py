from abc import ABC, abstractmethod
from typing import Any


class TrainingAdapter(ABC):
    architecture: str

    @abstractmethod
    def train(
        self,
        dataset_path: str,
        output_dir: str,
        config: dict[str, Any],
        metrics_callback: callable | None = None,
    ) -> dict[str, Any]:
        pass

    @abstractmethod
    def export_onnx(self, weights_path: str, output_path: str) -> str:
        pass
