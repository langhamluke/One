"""Alerts: email (SMTP), SMS via carrier email-to-SMS gateway (free), SMS via Twilio (optional).

Env vars:
  SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO (comma list), ALERT_EMAIL_FROM
  SMS_GATEWAY_TO   e.g. 5551234567@vtext.com (Verizon), @txt.att.net (AT&T), @tmomail.net (T-Mobile)
  TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, TWILIO_TO   (optional; needs a verified toll-free or 10DLC-registered number)
"""
from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage

try:
    import requests
except Exception:  # pragma: no cover
    requests = None


def _smtp_send(to: list[str], subject: str, body: str) -> bool:
    host, user, pw = os.environ.get("SMTP_HOST"), os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASS")
    if not (host and user and pw and to):
        return False
    port = int(os.environ.get("SMTP_PORT", "587"))
    msg = EmailMessage()
    msg["From"] = os.environ.get("ALERT_EMAIL_FROM", user)
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls(context=ssl.create_default_context())
            s.login(user, pw)
            s.send_message(msg)
        return True
    except Exception as e:  # pragma: no cover
        print(f"[notify] smtp failed: {e}")
        return False


def send_email(subject: str, body: str) -> bool:
    to = [x.strip() for x in os.environ.get("ALERT_EMAIL_TO", "").split(",") if x.strip()]
    return _smtp_send(to, subject, body)


def send_sms(text: str) -> bool:
    """Try Twilio first if configured, else the email-to-SMS gateway. Keep under 160 chars."""
    text = text[:155]
    sid, tok, frm, to = (os.environ.get(k) for k in ("TWILIO_SID", "TWILIO_TOKEN", "TWILIO_FROM", "TWILIO_TO"))
    if sid and tok and frm and to and requests is not None:
        try:
            r = requests.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", auth=(sid, tok),
                              data={"From": frm, "To": to, "Body": text}, timeout=20)
            if r.status_code < 300:
                return True
            print(f"[notify] twilio {r.status_code}: {r.text[:200]}")
        except Exception as e:  # pragma: no cover
            print(f"[notify] twilio failed: {e}")
    gw = os.environ.get("SMS_GATEWAY_TO")
    if gw:
        return _smtp_send([gw], "", text)
    return False


def alert(subject: str, body: str, sms_text: str | None = None) -> dict:
    return {"email": send_email(subject, body), "sms": send_sms(sms_text or subject)}
