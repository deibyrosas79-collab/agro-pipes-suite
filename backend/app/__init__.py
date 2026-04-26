from flask import Flask, send_from_directory
from flask_cors import CORS

from .config import Config
from .extensions import db
from .routes import api
from .seed import seed_database


def create_app():
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
        return send_from_directory(app.static_folder, "index.html")

    @app.errorhandler(404)
    def not_found(e):
        if hasattr(e, "description") and "/api/" in str(e):
            return {"error": "Endpoint not found."}, 404
        return send_from_directory(app.static_folder, "index.html")

    return app
