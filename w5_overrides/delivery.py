from __future__ import annotations

import asyncio
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Any, Protocol


class EmailSender(Protocol):
    async def send(self, *, to: str, subject: str, text: str, idempotency_key: str) -> str: ...


@dataclass(frozen=True)
class SmtpConfig:
    host: str
    port: int
    from_email: str
    username: str | None = None
    password: str | None = None
    use_starttls: bool = False
    timeout_seconds: float = 10.0


class SmtpEmailSender:
    def __init__(self, config: SmtpConfig) -> None:
        self.config = config

    async def send(self, *, to: str, subject: str, text: str, idempotency_key: str) -> str:
        message = EmailMessage()
        message["From"] = self.config.from_email
        message["To"] = to
        message["Subject"] = subject
        message["Message-ID"] = f"<{idempotency_key}@hackathon-intelligence.local>"
        message["X-Idempotency-Key"] = idempotency_key
        message.set_content(text)

        def _send() -> str:
            with smtplib.SMTP(self.config.host, self.config.port, timeout=self.config.timeout_seconds) as client:
                if self.config.use_starttls:
                    client.starttls()
                if self.config.username:
                    client.login(self.config.username, self.config.password or "")
                refused = client.send_message(message)
                if refused:
                    raise RuntimeError(f"SMTP recipients refused: {sorted(refused)}")
            return idempotency_key

        return await asyncio.to_thread(_send)


def render_email(*, event_name: str, event_url: str, alert_type: str, payload: dict[str, Any]) -> tuple[str, str]:
    subject = f"{event_name}: {alert_type.replace('_', ' ').title()}"
    lines = [event_name, "", f"Update: {alert_type.replace('_', ' ').lower()}."]
    if payload.get("changed_field"):
        lines.append(f"Changed field: {payload['changed_field']}")
    if payload.get("deadline_local"):
        lines.append(f"Deadline: {payload['deadline_local']} ({payload.get('timezone', 'UTC')})")
    elif payload.get("deadline"):
        lines.append(f"Deadline: {payload['deadline']}")
    if payload.get("old_value") is not None or payload.get("new_value") is not None:
        lines.append(f"Before: {payload.get('old_value')}")
        lines.append(f"Now: {payload.get('new_value')}")
    lines.extend(["", f"Open event: {event_url}"])
    return subject, "\n".join(lines)

@dataclass(frozen=True)
class DeliveryResult:
    status: str
    provider_message_id: str | None = None
    retry_scheduled: bool = False


class DeliveryStore(Protocol):
    def delivery_context(self, delivery_id: str) -> dict[str, Any]: ...
    def channel_enabled(self, user_id: str, alert_type: str, channel: str) -> bool: ...
    def mark_sent(self, delivery_id: str, provider_message_id: str, response: dict[str, Any] | None = None) -> None: ...
    def mark_failed(self, delivery_id: str, error: str, next_attempt_at: Any) -> None: ...
    def mark_skipped(self, delivery_id: str, reason: str) -> None: ...


async def deliver_email(
    *,
    delivery_id: str,
    store: DeliveryStore,
    sender: EmailSender,
    web_base_url: str,
    now: Any,
) -> DeliveryResult:
    from hackathon_alerts.retry import retry_delay

    context = store.delivery_context(delivery_id)
    if context["status"] == "SENT":
        return DeliveryResult("SENT", context.get("provider_message_id"), False)
    if not store.channel_enabled(context["user_id"], context["alert_type"], "EMAIL"):
        store.mark_skipped(delivery_id, "email disabled by user preference")
        return DeliveryResult("SKIPPED")
    if not context.get("email"):
        store.mark_skipped(delivery_id, "user has no email")
        return DeliveryResult("SKIPPED")
    event_slug = context.get("event_slug")
    event_url = f"{web_base_url.rstrip('/')}/hackathons/{event_slug}" if event_slug else web_base_url.rstrip("/")
    subject, body = render_email(
        event_name=context.get("event_name") or "Hackathon update",
        event_url=event_url,
        alert_type=context["alert_type"],
        payload=dict(context.get("payload") or {}),
    )
    try:
        provider_id = await sender.send(
            to=context["email"],
            subject=subject,
            text=body,
            idempotency_key=context["idempotency_key"],
        )
    except Exception as exc:
        next_attempt_number = int(context["attempt_count"]) + 1
        delay = retry_delay(next_attempt_number)
        next_attempt_at = None if delay is None else now + delay
        store.mark_failed(delivery_id, str(exc), next_attempt_at)
        return DeliveryResult("FAILED", retry_scheduled=delay is not None)
    store.mark_sent(delivery_id, provider_id, {"provider": "smtp"})
    return DeliveryResult("SENT", provider_id, False)
