#!/usr/bin/env python3
"""Minimal IMAP reader for GreenMail (plain IMAP). Zero deps (stdlib imaplib).

Reads IMAP_HOST, IMAP_PORT, IMAP_USERNAME, IMAP_PASSWORD from env.
Usage: greenmail-imap.py emails <folder> | read <folder> <uid> | delete <folder> <uid>
Outputs JSON on stdout.

Used instead of `imap-tool` because imap-tool's --no-ssl path crashes against
GreenMail (AttributeError: property 'file' has no setter). imaplib works fine.
"""
import email
import imaplib
import json
import os
import sys
from email.header import decode_header, make_header


def _conn():
    host = os.environ.get("IMAP_HOST")
    port = int(os.environ.get("IMAP_PORT", "3143"))
    user = os.environ.get("IMAP_USERNAME")
    pw = os.environ.get("IMAP_PASSWORD", "greenmail")
    if not host or not user:
        print(json.dumps({"error": "IMAP_HOST and IMAP_USERNAME required"}))
        sys.exit(1)
    m = imaplib.IMAP4(host, port)
    m.login(user, pw)
    return m


def _hdr(v):
    try:
        return str(make_header(decode_header(v or "")))
    except Exception:
        return v or ""


def cmd_emails(folder):
    m = _conn()
    m.select(folder)
    _, data = m.uid("search", None, "ALL")  # type: ignore[arg-type]
    out = []
    for uid_bytes in data[0].split():
        uid = int(uid_bytes)
        _, msg_data = m.uid("fetch", uid_bytes, "(BODY.PEEK[HEADER])")
        for part in msg_data:
            if isinstance(part, tuple):
                msg = email.message_from_bytes(part[1])
                out.append(
                    {
                        "uid": uid,
                        "subject": _hdr(msg.get("Subject")),
                        "from": _hdr(msg.get("From")),
                        "to": _hdr(msg.get("To")),
                        "date": _hdr(msg.get("Date")),
                    }
                )
    m.logout()
    print(json.dumps(out))


def _body(msg):
    if msg.is_multipart():
        for p in msg.walk():
            if p.get_content_type() == "text/plain":
                return (p.get_payload(decode=True) or b"").decode("utf-8", "replace")
        for p in msg.walk():
            if p.get_content_type() == "text/html":
                return (p.get_payload(decode=True) or b"").decode("utf-8", "replace")
        return ""
    payload = msg.get_payload(decode=True)
    return payload.decode("utf-8", "replace") if payload else ""


def cmd_read(folder, uid):
    m = _conn()
    m.select(folder)
    _, msg_data = m.uid("fetch", str(uid), "(BODY.PEEK[])")
    raw = next((p[1] for p in msg_data if isinstance(p, tuple)), None)
    if not raw:
        print(json.dumps({"error": "not found"}))
        m.logout()
        return
    msg = email.message_from_bytes(raw)
    print(
        json.dumps(
            {
                "uid": int(uid),
                "subject": _hdr(msg.get("Subject")),
                "from": _hdr(msg.get("From")),
                "to": _hdr(msg.get("To")),
                "date": _hdr(msg.get("Date")),
                "body": _body(msg),
            }
        )
    )
    m.logout()


def cmd_delete(folder, uid):
    m = _conn()
    m.select(folder)
    m.uid("store", str(uid), "+FLAGS", "(\\Deleted)")
    m.expunge()
    m.logout()
    print(json.dumps({"deleted": int(uid)}))


if __name__ == "__main__":
    args = sys.argv[1:]
    try:
        if args and args[0] == "emails":
            cmd_emails(args[1] if len(args) > 1 else "INBOX")
        elif args and args[0] == "read":
            cmd_read(args[1], args[2])
        elif args and args[0] == "delete":
            cmd_delete(args[1], args[2])
        else:
            print(json.dumps({"error": "unknown command"}))
            sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": repr(e)}))
        sys.exit(1)
