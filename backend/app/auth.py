from functools import wraps

from flask import current_app, g, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .models import Employee


def _serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="agro-pipes-auth")


def generate_token(employee):
    return _serializer().dumps({"employee_id": employee.id, "role": employee.role})


def verify_token(token):
    try:
        payload = _serializer().loads(token, max_age=current_app.config["TOKEN_MAX_AGE"])
    except (BadSignature, SignatureExpired):
        return None

    employee = Employee.query.filter_by(id=payload.get("employee_id"), is_active=True).first()
    return employee


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "", 1).strip() if auth_header.startswith("Bearer ") else None
        if not token:
            return {"error": "Authentication required."}, 401

        employee = verify_token(token)
        if not employee:
            return {"error": "Invalid or expired token."}, 401

        g.current_user = employee
        return view(*args, **kwargs)

    return wrapped


def require_role(*roles):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            current_user = getattr(g, "current_user", None)
            if current_user is None:
                return {"error": "Authentication required."}, 401
            if current_user.role not in roles:
                return {"error": "You do not have permission for this action."}, 403
            return view(*args, **kwargs)

        return wrapped

    return decorator
