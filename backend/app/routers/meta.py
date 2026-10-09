from fastapi import APIRouter, Depends

from ..config import settings
from ..constants import LOCATIONS, STATUSES
from ..deps import get_current_user
from ..schemas import Limits, OptionsOut

router = APIRouter(prefix="/api/meta", tags=["meta"], dependencies=[Depends(get_current_user)])


@router.get("/options", response_model=OptionsOut)
def options():
    return OptionsOut(
        statuses=STATUSES,
        locations=LOCATIONS,
        limits=Limits(
            max_images=settings.max_images,
            max_certificates=settings.max_certificates,
            max_upload_bytes=settings.max_upload_bytes,
        ),
        due_soon_days=settings.due_soon_days,
    )
