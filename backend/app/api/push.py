"""This device's push subscription, and a test notification."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .. import notify
from ..auth import current_user
from ..config import settings
from ..db import get_db
from ..models import PushSubscription, User

router = APIRouter(prefix="/api/push", tags=["push"])


class PushConfig(BaseModel):
    enabled: bool
    public_key: str | None
    # How many of the user's devices get notifications.
    devices: int


class SubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=255)
    auth: str = Field(min_length=1, max_length=255)


class SubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=10, max_length=2000)
    keys: SubscriptionKeys
    language: str = "de"


class Unsubscribe(BaseModel):
    endpoint: str


@router.get("/config", response_model=PushConfig)
def push_config(user: User = Depends(current_user), db: Session = Depends(get_db)) -> PushConfig:
    devices = db.scalar(select(func.count(PushSubscription.id)).where(PushSubscription.user_id == user.id)) or 0
    return PushConfig(enabled=settings.push_enabled, public_key=settings.vapid_public_key or None, devices=devices)


@router.post("/subscriptions", status_code=201)
def subscribe(body: SubscriptionIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Registers this device; an endpoint that moves to another user follows the browser."""
    if not body.endpoint.startswith("https://"):
        raise HTTPException(status_code=422, detail="Invalid push endpoint")
    subscription = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint))
    if subscription is None:
        subscription = PushSubscription(endpoint=body.endpoint)
        db.add(subscription)
    subscription.user_id = user.id
    subscription.p256dh = body.keys.p256dh
    subscription.auth = body.keys.auth
    subscription.language = body.language if body.language in notify.TEXTS else "de"
    db.commit()
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(body: Unsubscribe, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    db.execute(delete(PushSubscription).where(PushSubscription.endpoint == body.endpoint, PushSubscription.user_id == user.id))
    db.commit()
    return {"ok": True}


@router.post("/test")
def send_test(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    if not settings.push_enabled:
        raise HTTPException(status_code=503, detail="Push is not configured on the server (VAPID keys)")
    return {"sent": notify.test_message(db, user)}
