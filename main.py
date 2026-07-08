from flask import Flask, jsonify, render_template, request, session

import config
from models.db import db
from routes.api import api_bp
from routes.channels import channels_bp
from routes.csrf import validate_csrf
from routes.docs import docs_bp
from routes.kanban import kanban_bp
from routes.onboarding import onboarding_bp, org_bp
from routes.pages import pages_bp
from routes.polls import polls_bp
from routes.reminders import reminders_bp
from routes.search import search_bp
from services.migrate import migrate_channel_data, run_migrations
from services.seed import ensure_demo_organization, seed_database


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["SECRET_KEY"] = config.SECRET_KEY
    app.config["SQLALCHEMY_DATABASE_URI"] = config.DATABASE_URL
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)

    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(channels_bp)
    app.register_blueprint(onboarding_bp)
    app.register_blueprint(org_bp)
    app.register_blueprint(docs_bp)
    app.register_blueprint(kanban_bp)
    app.register_blueprint(polls_bp)
    app.register_blueprint(search_bp)
    app.register_blueprint(reminders_bp)

    @app.context_processor
    def inject_timeweb_ai():
        return {"timeweb_ai_embed_url": config.timeweb_ai_embed_url()}

    @app.before_request
    def ensure_database():
        if app.config.get("_DB_READY"):
            return

        with app.app_context():
            run_migrations()
            db.create_all()
            migrate_channel_data()
            seed_database()
            ensure_demo_organization()
            app.config["_DB_READY"] = True

    @app.before_request
    def csrf_protect():
        if not validate_csrf(request):
            return jsonify({"error": "CSRF validation failed"}), 403

    _error_pages = {
        403: ("403", "Доступ запрещён", "У вас нет прав для просмотра этой страницы."),
        404: ("404", "Страница не найдена", "Возможно, ссылка устарела или страница была удалена."),
        500: ("500", "Внутренняя ошибка сервера", "Что-то пошло не так на нашей стороне. Мы уже разбираемся."),
        502: ("502", "Сервер недоступен", "Не удалось получить ответ от сервера. Попробуйте обновить страницу."),
    }

    def _wants_json() -> bool:
        return request.path.startswith("/api/") or request.accept_mimetypes.best == "application/json"

    @app.errorhandler(403)
    def err_403(e):
        if _wants_json():
            return jsonify({"error": "Forbidden"}), 403
        code, title, desc = _error_pages[403]
        return render_template("error.html", code=code, title=title, description=desc), 403

    @app.errorhandler(404)
    def err_404(e):
        if _wants_json():
            return jsonify({"error": "Not found"}), 404
        code, title, desc = _error_pages[404]
        return render_template("error.html", code=code, title=title, description=desc), 404

    @app.errorhandler(500)
    def err_500(e):
        if _wants_json():
            return jsonify({"error": "Internal server error"}), 500
        code, title, desc = _error_pages[500]
        return render_template("error.html", code=code, title=title, description=desc), 500

    @app.errorhandler(502)
    def err_502(e):
        if _wants_json():
            return jsonify({"error": "Bad gateway"}), 502
        code, title, desc = _error_pages[502]
        return render_template("error.html", code=code, title=title, description=desc), 502

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=8000)
