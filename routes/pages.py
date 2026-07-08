from flask import Blueprint, jsonify, redirect, render_template, request, session, url_for

from routes.auth import login_required

pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/")
def landing():
    if session.get("user_id"):
        return redirect(url_for("pages.app"))
    return render_template("landing.html")


@pages_bp.route("/app")
@login_required
def app():
    return render_template("app.html")
