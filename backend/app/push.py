"""Web Push delivery (VAPID), as in the Todo app. Tests replace `deliver_payload` with a recorder."""
import json
import logging

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import PushSubscription

log = logging.getLogger("day.push")


class Gone(Exception):
    """The push service says this subscription no longer exists (uninstalled, revoked)."""


def deliver_payload(subscription: PushSubscription, payload: dict) -> None:
    try:
        webpush(
            subscription_info={"endpoint": subscription.endpoint, "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth}},
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            ttl=12 * 3600,
        )
    except WebPushException as e:
        status = e.response.status_code if e.response is not None else None
        if status in (404, 410):
            raise Gone() from e
        raise


def send(db: Session, user_id: int, build) -> int:
    """Sends to every device of the user. `build(language)` returns the payload
    {title, body, url, tag}. Returns the number of devices reached."""
    if not settings.push_enabled:
        return 0
    sent = 0
    for subscription in db.scalars(select(PushSubscription).where(PushSubscription.user_id == user_id)):
        try:
            deliver_payload(subscription, build(subscription.language))
            sent += 1
        except Gone:
            db.delete(subscription)
        except Exception:  # one broken device must not stop the others
            log.exception("Push to subscription %s failed", subscription.id)
    db.commit()
    return sent
