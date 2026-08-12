from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    default_project_id: str | None = None

    model_config = {"from_attributes": True}


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str | None = None

    model_config = {"from_attributes": True}


class RoadEventCreate(BaseModel):
    event_type: str
    latitude: float
    longitude: float
    confidence: float | None = None
    metadata: dict = Field(default_factory=dict)


class FleetDeviceResponse(BaseModel):
    id: str
    device_id: str
    vehicle_id: str
    driver_name: str | None = None
    phone_number: str | None = None
    is_online: bool
    gps_status: str
    camera_status: str
    latitude: float | None
    longitude: float | None
    last_communication: str | None

    model_config = {"from_attributes": True}


class ModelArtifactResponse(BaseModel):
    id: str
    name: str
    architecture: str
    lifecycle: str
    is_active: bool = False
    created_at: str | None = None

    @classmethod
    def from_artifact(cls, artifact, *, is_active: bool = False) -> "ModelArtifactResponse":
        return cls(
            id=str(artifact.id),
            name=artifact.name,
            architecture=artifact.architecture,
            lifecycle=artifact.lifecycle.value if hasattr(artifact.lifecycle, "value") else str(artifact.lifecycle),
            is_active=is_active,
            created_at=artifact.created_at.isoformat() if artifact.created_at else None,
        )
