import secrets

from flask import jsonify, request, session


CSRF_EXEMPT_PATHS = {"/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/csrf-token"}


def generate_csrf_token() -> str:
    token = secrets.token_hex(32)
    session["csrf_token"] = token
    return token


def get_or_create_csrf_token() -> str:
    if "csrf_token" not in session:
        return generate_csrf_token()
    return session["csrf_token"]


def validate_csrf(request_obj) -> bool:
    if request_obj.method not in ("POST", "PUT", "DELETE", "PATCH"):
        return True
    if request_obj.path in CSRF_EXEMPT_PATHS:
        return True
    if request_obj.path.startswith("/api/invite/") and request_obj.path.endswith("/accept"):
        return True
    token = request_obj.headers.get("X-CSRF-Token") or ""
    session_token = session.get("csrf_token") or ""
    return token == session_token and bool(token)
