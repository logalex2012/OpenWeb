from functools import wraps

from flask import jsonify, redirect, request, session, url_for


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("user_id"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Требуется авторизация"}), 401
            return redirect(url_for("pages.landing"))
        return view(*args, **kwargs)

    return wrapped


def current_user_id() -> int | None:
    return session.get("user_id")
