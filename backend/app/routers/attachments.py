from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..constants import KIND_CERTIFICATE, KIND_IMAGE
from ..database import get_db
from ..deps import get_current_user
from ..files import clean_filename, delete_file, is_pdf, resolve, save_bytes, sniff_image
from ..models import Attachment, Gauge, User
from ..schemas import AttachmentOut

router = APIRouter(prefix="/api", tags=["attachments"], dependencies=[Depends(get_current_user)])

MB = 1024 * 1024


@router.post("/gauges/{gauge_id}/attachments", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
def upload_attachment(
    gauge_id: int,
    kind: Literal["image", "certificate"] = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # lock the gauge row so two simultaneous uploads cannot exceed the limit
    gauge = db.scalar(select(Gauge).where(Gauge.id == gauge_id).with_for_update())
    if gauge is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gauge not found")

    limit = settings.max_images if kind == KIND_IMAGE else settings.max_certificates
    count = db.scalar(select(func.count()).select_from(Attachment).where(Attachment.gauge_id == gauge_id, Attachment.kind == kind)) or 0
    if count >= limit:
        what = "images" if kind == KIND_IMAGE else "calibration certificates"
        raise HTTPException(status.HTTP_409_CONFLICT, f"Maximum of {limit} {what} reached. Delete one first.")

    data = file.file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"File is larger than {settings.max_upload_bytes // MB} MB.")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty.")

    if kind == KIND_IMAGE:
        sniffed = sniff_image(data[:16])
        if sniffed is None:
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only JPG, PNG, GIF or WEBP images are allowed.")
        content_type, ext = sniffed
        fallback = "image" + ext
    else:
        if not is_pdf(data):
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only PDF files are allowed for certificates.")
        content_type, ext, fallback = "application/pdf", ".pdf", "certificate.pdf"

    att = Attachment(
        gauge_id=gauge_id,
        kind=kind,
        original_name=clean_filename(file.filename, fallback),
        stored_name=save_bytes(gauge_id, data, ext),
        content_type=content_type,
        size_bytes=len(data),
        uploaded_by_id=user.id,
    )
    db.add(att)
    db.commit()
    return att


@router.get("/attachments/{attachment_id}/file")
def get_attachment_file(attachment_id: int, download: bool = False, db: Session = Depends(get_db)):
    att = db.get(Attachment, attachment_id)
    if att is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    try:
        path = resolve(att.stored_name)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File is missing on the server")
    return FileResponse(
        path,
        media_type=att.content_type,
        filename=att.original_name,
        content_disposition_type="attachment" if download else "inline",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600"},
    )


@router.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(attachment_id: int, db: Session = Depends(get_db)):
    att = db.get(Attachment, attachment_id)
    if att is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    stored = att.stored_name
    db.delete(att)
    db.commit()
    delete_file(stored)
