from pathlib import Path

from flask import Flask, send_from_directory
from flask_cors import CORS

from .config import Config
from .extensions import db
from .routes import api
from .seed import seed_database


def create_app():
    project_root = Path(__file__).resolve().parents[2]
    web_dist_dir = project_root / "web" / "dist"

    app = Flask(
        __name__,
        instance_relative_config=True,
        static_folder="static",
        static_url_path="/static",
    )
    app.config.from_object(Config)

    CORS(
        app,
        origins=app.config["CORS_ORIGINS"] + ["*"],
        supports_credentials=True,
        allow_headers=["Authorization", "Content-Type"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    )

    db.init_app(app)

    with app.app_context():
        db.create_all()
        seed_database()

    app.register_blueprint(api)

    @app.get("/")
    def index():
        if web_dist_dir.exists():
            return send_from_directory(web_dist_dir, "index.html")
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/assets/<path:filename>")
    def web_assets(filename):
        if web_dist_dir.exists():
            asset_path = web_dist_dir / "assets" / filename
            if asset_path.exists():
                return send_from_directory(web_dist_dir / "assets", filename)
        return send_from_directory(app.static_folder, filename)

    @app.get("/<path:filename>")
    def spa_static(filename):
        if web_dist_dir.exists():
            target = web_dist_dir / filename
            if target.exists() and target.is_file():
                return send_from_directory(web_dist_dir, filename)
        static_target = Path(app.static_folder) / filename
        if static_target.exists() and static_target.is_file():
            return send_from_directory(app.static_folder, filename)
        return send_from_directory(web_dist_dir if web_dist_dir.exists() else app.static_folder, "index.html")

    @app.errorhandler(404)
    def not_found(e):
        if hasattr(e, "description") and "/api/" in str(e):
            return {"error": "Endpoint not found."}, 404
        return send_from_directory(web_dist_dir if web_dist_dir.exists() else app.static_folder, "index.html")

    return app
