from calendar import monthrange
from datetime import date, datetime

from flask import Blueprint, g, request
from sqlalchemy import func

from .auth import generate_token, require_auth, require_role
from .extensions import db
from .models import Employee, FuelPurchase, HarvestLog, Lot, LotActivity, Machinery, WorkLog


api = Blueprint("api", __name__, url_prefix="/api")


def parse_date(value, field_name):
    if not value:
        raise ValueError(f"{field_name} es requerido.")
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as error:
        raise ValueError(f"{field_name} debe usar formato YYYY-MM-DD.") from error


def get_fortnight_range(reference_date=None):
    reference_date = reference_date or date.today()
    if reference_date.day <= 15:
        return reference_date.replace(day=1), reference_date.replace(day=15)
    last_day = monthrange(reference_date.year, reference_date.month)[1]
    return reference_date.replace(day=16), reference_date.replace(day=last_day)


def serialize_payroll_row(row):
    employee, total_hours = row
    return {
        "employeeId": employee.id,
        "employeeName": employee.name,
        "role": employee.role,
        "totalHours": round(float(total_hours or 0), 2),
    }


# ─── Health ───────────────────────────────────────────────────────────────────

@api.get("/health")
def health():
    return {"status": "ok", "service": "agro-pipes-api"}


# ─── Auth ─────────────────────────────────────────────────────────────────────

@api.post("/auth/login")
def login():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not email or not password:
        return {"error": "Correo y contraseña son requeridos."}, 400

    employee = Employee.query.filter(
        func.lower(Employee.email) == email, Employee.is_active.is_(True)
    ).first()
    if not employee or not employee.check_password(password):
        return {"error": "Credenciales inválidas."}, 401

    token = generate_token(employee)
    return {"token": token, "user": employee.to_dict()}


@api.get("/auth/me")
@require_auth
def me():
    return {"user": g.current_user.to_dict()}


# ─── Dashboard ────────────────────────────────────────────────────────────────

@api.get("/dashboard/summary")
@require_auth
def dashboard_summary():
    start, end = get_fortnight_range()
    total_hours = db.session.query(
        func.coalesce(func.sum(WorkLog.hours_worked), 0)
    ).filter(WorkLog.work_date.between(start, end)).scalar()
    total_hoppers = db.session.query(
        func.coalesce(func.sum(HarvestLog.hoppers_harvested), 0)
    ).filter(HarvestLog.harvest_date.between(start, end)).scalar()
    total_fuel = db.session.query(
        func.coalesce(func.sum(FuelPurchase.quantity_liters), 0)
    ).filter(FuelPurchase.purchase_date.between(start, end)).scalar()
    lot_count = db.session.query(func.count(Lot.id)).filter(Lot.status == "active").scalar()
    employee_count = db.session.query(func.count(Employee.id)).filter(Employee.is_active.is_(True)).scalar()
    machinery_count = db.session.query(func.count(Machinery.id)).filter(Machinery.status == "active").scalar()

    recent_work_logs = WorkLog.query.order_by(WorkLog.work_date.desc(), WorkLog.created_at.desc()).limit(8).all()
    recent_activities = LotActivity.query.order_by(LotActivity.performed_on.desc(), LotActivity.created_at.desc()).limit(8).all()
    recent_harvest = HarvestLog.query.order_by(HarvestLog.harvest_date.desc(), HarvestLog.created_at.desc()).limit(8).all()
    recent_fuel = FuelPurchase.query.order_by(FuelPurchase.purchase_date.desc(), FuelPurchase.created_at.desc()).limit(6).all()

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "metrics": {
            "hoursThisFortnight": round(float(total_hours or 0), 2),
            "hoppersThisFortnight": int(total_hoppers or 0),
            "fuelLitersFortnight": round(float(total_fuel or 0), 1),
            "activeLots": lot_count,
            "activeEmployees": employee_count,
            "activeMachinery": machinery_count,
        },
        "recentWorkLogs": [item.to_dict() for item in recent_work_logs],
        "recentActivities": [item.to_dict() for item in recent_activities],
        "recentHarvestLogs": [item.to_dict() for item in recent_harvest],
        "recentFuelPurchases": [item.to_dict() for item in recent_fuel],
    }


# ─── Employees ────────────────────────────────────────────────────────────────

@api.get("/employees")
@require_auth
def list_employees():
    all_employees = request.args.get("all", "false").lower() == "true"
    query = Employee.query.order_by(Employee.name.asc())
    if not all_employees:
        query = query.filter_by(is_active=True)
    return {"items": [e.to_dict() for e in query.all()]}


@api.post("/employees")
@require_auth
@require_role("admin")
def create_employee():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    role = (payload.get("role") or "operator").strip()
    password = payload.get("password") or ""
    phone = (payload.get("phone") or "").strip()
    id_number = (payload.get("idNumber") or "").strip()

    if not name or not email or not password:
        return {"error": "Nombre, correo y contraseña son requeridos."}, 400
    if role not in ("admin", "supervisor", "machinist", "operator"):
        return {"error": "Rol inválido."}, 400
    if Employee.query.filter(func.lower(Employee.email) == email).first():
        return {"error": "Ya existe un empleado con ese correo."}, 409

    emp = Employee(name=name, email=email, role=role, phone=phone or None, id_number=id_number or None)
    emp.set_password(password)
    db.session.add(emp)
    db.session.commit()
    return emp.to_dict(), 201


@api.put("/employees/<int:emp_id>")
@require_auth
@require_role("admin")
def update_employee(emp_id):
    emp = Employee.query.get_or_404(emp_id)
    payload = request.get_json(silent=True) or {}

    if "name" in payload:
        emp.name = (payload["name"] or "").strip()
    if "role" in payload:
        role = (payload["role"] or "").strip()
        if role not in ("admin", "supervisor", "machinist", "operator"):
            return {"error": "Rol inválido."}, 400
        emp.role = role
    if "phone" in payload:
        emp.phone = (payload["phone"] or "").strip() or None
    if "idNumber" in payload:
        emp.id_number = (payload["idNumber"] or "").strip() or None
    if "isActive" in payload:
        emp.is_active = bool(payload["isActive"])
    if payload.get("password"):
        emp.set_password(payload["password"])

    db.session.commit()
    return emp.to_dict()


# ─── Lots ─────────────────────────────────────────────────────────────────────

@api.get("/lots")
@require_auth
def list_lots():
    lots = Lot.query.order_by(Lot.code.asc()).all()
    return {"items": [lot.to_dict() for lot in lots]}


@api.post("/lots")
@require_auth
@require_role("admin", "supervisor")
def create_lot():
    payload = request.get_json(silent=True) or {}
    code = (payload.get("code") or "").strip().upper()
    name = (payload.get("name") or "").strip()
    crop_type = (payload.get("cropType") or "Arroz").strip()
    rice_variety = (payload.get("riceVariety") or "").strip()
    notes = (payload.get("notes") or "").strip()

    try:
        hectares = float(payload.get("hectares") or 0)
    except (TypeError, ValueError):
        return {"error": "hectáreas debe ser un número."}, 400

    if not code or not name:
        return {"error": "Código y nombre son requeridos."}, 400
    if Lot.query.filter_by(code=code).first():
        return {"error": "Ya existe un lote con ese código."}, 409

    sowing_date = None
    expected_harvest_date = None
    try:
        if payload.get("sowingDate"):
            sowing_date = parse_date(payload["sowingDate"], "sowingDate")
        if payload.get("expectedHarvestDate"):
            expected_harvest_date = parse_date(payload["expectedHarvestDate"], "expectedHarvestDate")
    except ValueError as error:
        return {"error": str(error)}, 400

    lot = Lot(
        code=code,
        name=name,
        crop_type=crop_type,
        rice_variety=rice_variety or None,
        hectares=hectares,
        status=payload.get("status", "active"),
        sowing_date=sowing_date,
        expected_harvest_date=expected_harvest_date,
        notes=notes or None,
    )
    db.session.add(lot)
    db.session.commit()
    return lot.to_dict(), 201


@api.put("/lots/<int:lot_id>")
@require_auth
@require_role("admin", "supervisor")
def update_lot(lot_id):
    lot = Lot.query.get_or_404(lot_id)
    payload = request.get_json(silent=True) or {}

    if "name" in payload:
        lot.name = (payload["name"] or "").strip()
    if "cropType" in payload:
        lot.crop_type = (payload["cropType"] or "Arroz").strip()
    if "riceVariety" in payload:
        lot.rice_variety = (payload["riceVariety"] or "").strip() or None
    if "hectares" in payload:
        try:
            lot.hectares = float(payload["hectares"])
        except (TypeError, ValueError):
            return {"error": "hectáreas debe ser un número."}, 400
    if "status" in payload:
        lot.status = (payload["status"] or "active").strip()
    if "notes" in payload:
        lot.notes = (payload["notes"] or "").strip() or None
    try:
        if "sowingDate" in payload:
            lot.sowing_date = parse_date(payload["sowingDate"], "sowingDate") if payload["sowingDate"] else None
        if "expectedHarvestDate" in payload:
            lot.expected_harvest_date = parse_date(payload["expectedHarvestDate"], "expectedHarvestDate") if payload["expectedHarvestDate"] else None
    except ValueError as error:
        return {"error": str(error)}, 400

    db.session.commit()
    return lot.to_dict()


# ─── Machinery ────────────────────────────────────────────────────────────────

@api.get("/machinery")
@require_auth
def list_machinery():
    items = Machinery.query.order_by(Machinery.type.asc(), Machinery.name.asc()).all()
    return {"items": [m.to_dict() for m in items]}


@api.post("/machinery")
@require_auth
@require_role("admin", "supervisor")
def create_machinery():
    payload = request.get_json(silent=True) or {}
    code = (payload.get("code") or "").strip().upper()
    name = (payload.get("name") or "").strip()
    mtype = (payload.get("type") or "").strip()
    brand = (payload.get("brand") or "").strip()
    fuel_type = (payload.get("fuelType") or "ACPPM").strip()
    license_plate = (payload.get("licensePlate") or "").strip()
    notes = (payload.get("notes") or "").strip()

    if not code or not name or not mtype:
        return {"error": "Código, nombre y tipo son requeridos."}, 400
    if mtype not in ("cosechadora", "tractor", "fumigadora", "vehiculo", "otro"):
        return {"error": "Tipo de maquinaria inválido."}, 400
    if Machinery.query.filter_by(code=code).first():
        return {"error": "Ya existe una máquina con ese código."}, 409

    try:
        model_year = int(payload["modelYear"]) if payload.get("modelYear") else None
        current_hours = float(payload.get("currentHours") or 0)
    except (TypeError, ValueError):
        return {"error": "Año o horómetro inválido."}, 400

    machine = Machinery(
        code=code,
        name=name,
        type=mtype,
        brand=brand or None,
        model_year=model_year,
        license_plate=license_plate or None,
        fuel_type=fuel_type,
        status=payload.get("status", "active"),
        current_hours=current_hours,
        notes=notes or None,
    )
    db.session.add(machine)
    db.session.commit()
    return machine.to_dict(), 201


@api.put("/machinery/<int:machine_id>")
@require_auth
@require_role("admin", "supervisor")
def update_machinery(machine_id):
    machine = Machinery.query.get_or_404(machine_id)
    payload = request.get_json(silent=True) or {}

    for field, attr in [("name", "name"), ("brand", "brand"), ("fuelType", "fuel_type"),
                        ("licensePlate", "license_plate"), ("status", "status"), ("notes", "notes")]:
        if field in payload:
            setattr(machine, attr, (payload[field] or "").strip() or None)
    if "currentHours" in payload:
        try:
            machine.current_hours = float(payload["currentHours"])
        except (TypeError, ValueError):
            return {"error": "Horómetro inválido."}, 400

    db.session.commit()
    return machine.to_dict()


@api.delete("/machinery/<int:machine_id>")
@require_auth
@require_role("admin")
def delete_machinery(machine_id):
    machine = Machinery.query.get_or_404(machine_id)
    machine.status = "inactive"
    db.session.commit()
    return {"message": "Máquina desactivada."}


# ─── Fuel Purchases ───────────────────────────────────────────────────────────

@api.get("/fuel-purchases")
@require_auth
def list_fuel_purchases():
    query = FuelPurchase.query.order_by(FuelPurchase.purchase_date.desc(), FuelPurchase.created_at.desc())
    machine_id = request.args.get("machineId", type=int)
    if machine_id:
        query = query.filter_by(machine_id=machine_id)
    return {"items": [item.to_dict() for item in query.limit(200).all()]}


@api.post("/fuel-purchases")
@require_auth
def create_fuel_purchase():
    payload = request.get_json(silent=True) or {}
    try:
        purchase_date = parse_date(payload.get("purchaseDate"), "purchaseDate")
        quantity_liters = float(payload.get("quantityLiters") or 0)
    except (TypeError, ValueError) as error:
        return {"error": str(error)}, 400

    if quantity_liters <= 0:
        return {"error": "La cantidad de litros debe ser mayor a 0."}, 400

    fuel_type = (payload.get("fuelType") or "ACPPM").strip()
    supplier = (payload.get("supplier") or "").strip()
    invoice_number = (payload.get("invoiceNumber") or "").strip()
    notes = (payload.get("notes") or "").strip()

    price_per_liter = None
    total_cost = None
    try:
        if payload.get("pricePerLiter"):
            price_per_liter = float(payload["pricePerLiter"])
            total_cost = round(price_per_liter * quantity_liters, 2)
        if payload.get("totalCost"):
            total_cost = float(payload["totalCost"])
    except (TypeError, ValueError):
        return {"error": "Precio inválido."}, 400

    machine_id = None
    if payload.get("machineId"):
        try:
            machine_id = int(payload["machineId"])
            if not Machinery.query.get(machine_id):
                return {"error": "Máquina no encontrada."}, 404
        except (TypeError, ValueError):
            return {"error": "machineId inválido."}, 400

    employee_id = g.current_user.id
    if payload.get("employeeId"):
        try:
            employee_id = int(payload["employeeId"])
        except (TypeError, ValueError):
            pass

    purchase = FuelPurchase(
        purchase_date=purchase_date,
        fuel_type=fuel_type,
        quantity_liters=quantity_liters,
        price_per_liter=price_per_liter,
        total_cost=total_cost,
        supplier=supplier or None,
        machine_id=machine_id,
        employee_id=employee_id,
        invoice_number=invoice_number or None,
        notes=notes or None,
    )
    db.session.add(purchase)
    db.session.commit()
    return purchase.to_dict(), 201


@api.delete("/fuel-purchases/<int:purchase_id>")
@require_auth
@require_role("admin", "supervisor")
def delete_fuel_purchase(purchase_id):
    purchase = FuelPurchase.query.get_or_404(purchase_id)
    db.session.delete(purchase)
    db.session.commit()
    return {"message": "Registro eliminado."}


# ─── Work Logs ────────────────────────────────────────────────────────────────

@api.get("/work-logs")
@require_auth
def list_work_logs():
    query = WorkLog.query.order_by(WorkLog.work_date.desc(), WorkLog.created_at.desc())
    if request.args.get("employeeId", type=int):
        query = query.filter_by(employee_id=request.args.get("employeeId", type=int))
    if request.args.get("lotId", type=int):
        query = query.filter_by(lot_id=request.args.get("lotId", type=int))
    return {"items": [item.to_dict() for item in query.limit(200).all()]}


@api.post("/work-logs")
@require_auth
def create_work_log():
    payload = request.get_json(silent=True) or {}
    try:
        employee_id = int(payload.get("employeeId"))
        lot_id = int(payload.get("lotId"))
        work_date = parse_date(payload.get("workDate"), "workDate")
        hours_worked = float(payload.get("hoursWorked"))
        function_name = (payload.get("functionName") or "").strip()
        notes = (payload.get("notes") or "").strip()
    except (TypeError, ValueError) as error:
        return {"error": str(error)}, 400

    if not function_name:
        return {"error": "La función diaria es requerida."}, 400
    if hours_worked <= 0 or hours_worked > 24:
        return {"error": "Las horas deben estar entre 0 y 24."}, 400

    employee = Employee.query.get(employee_id)
    lot = Lot.query.get(lot_id)
    if not employee or not employee.is_active:
        return {"error": "Empleado no encontrado."}, 404
    if not lot:
        return {"error": "Lote no encontrado."}, 404

    machine_id = None
    if payload.get("machineId"):
        try:
            machine_id = int(payload["machineId"])
        except (TypeError, ValueError):
            pass

    work_log = WorkLog(
        employee_id=employee_id,
        lot_id=lot_id,
        work_date=work_date,
        function_name=function_name,
        hours_worked=hours_worked,
        machine_id=machine_id,
        notes=notes or None,
    )
    db.session.add(work_log)
    db.session.commit()
    return work_log.to_dict(), 201


@api.delete("/work-logs/<int:log_id>")
@require_auth
@require_role("admin", "supervisor")
def delete_work_log(log_id):
    log = WorkLog.query.get_or_404(log_id)
    db.session.delete(log)
    db.session.commit()
    return {"message": "Registro eliminado."}


# ─── Lot Activities ───────────────────────────────────────────────────────────

@api.get("/lot-activities")
@require_auth
def list_lot_activities():
    query = LotActivity.query.order_by(LotActivity.performed_on.desc(), LotActivity.created_at.desc())
    if request.args.get("lotId", type=int):
        query = query.filter_by(lot_id=request.args.get("lotId", type=int))
    if request.args.get("activityType"):
        query = query.filter_by(activity_type=request.args.get("activityType"))
    return {"items": [item.to_dict() for item in query.limit(200).all()]}


@api.post("/lot-activities")
@require_auth
def create_lot_activity():
    payload = request.get_json(silent=True) or {}
    try:
        lot_id = int(payload.get("lotId"))
        performed_on = parse_date(payload.get("performedOn"), "performedOn")
    except (TypeError, ValueError) as error:
        return {"error": str(error)}, 400

    activity_type = (payload.get("activityType") or "").strip()
    input_name = (payload.get("inputName") or "").strip()
    dose = (payload.get("dose") or "").strip()
    notes = (payload.get("notes") or "").strip()
    unit = (payload.get("unit") or "").strip()

    if not activity_type:
        return {"error": "El tipo de actividad es requerido."}, 400
    if not Lot.query.get(lot_id):
        return {"error": "Lote no encontrado."}, 404

    quantity = None
    area_covered = None
    machine_id = None
    try:
        if payload.get("quantity"):
            quantity = float(payload["quantity"])
        if payload.get("areaCovered"):
            area_covered = float(payload["areaCovered"])
        if payload.get("machineId"):
            machine_id = int(payload["machineId"])
    except (TypeError, ValueError):
        return {"error": "Cantidad, área o máquina inválidos."}, 400

    activity = LotActivity(
        lot_id=lot_id,
        activity_type=activity_type,
        performed_on=performed_on,
        input_name=input_name or None,
        dose=dose or None,
        quantity=quantity,
        unit=unit or None,
        area_covered=area_covered,
        machine_id=machine_id,
        notes=notes or None,
        created_by_id=g.current_user.id,
    )
    db.session.add(activity)
    db.session.commit()
    return activity.to_dict(), 201


@api.delete("/lot-activities/<int:activity_id>")
@require_auth
@require_role("admin", "supervisor")
def delete_lot_activity(activity_id):
    activity = LotActivity.query.get_or_404(activity_id)
    db.session.delete(activity)
    db.session.commit()
    return {"message": "Registro eliminado."}


# ─── Harvest Logs ─────────────────────────────────────────────────────────────

@api.get("/harvest-logs")
@require_auth
def list_harvest_logs():
    query = HarvestLog.query.order_by(HarvestLog.harvest_date.desc(), HarvestLog.created_at.desc())
    if request.args.get("lotId", type=int):
        query = query.filter_by(lot_id=request.args.get("lotId", type=int))
    return {"items": [item.to_dict() for item in query.limit(200).all()]}


@api.post("/harvest-logs")
@require_auth
@require_role("admin", "supervisor", "machinist")
def create_harvest_log():
    payload = request.get_json(silent=True) or {}
    try:
        employee_id = int(payload.get("employeeId"))
        lot_id = int(payload.get("lotId"))
        harvest_date = parse_date(payload.get("harvestDate"), "harvestDate")
        hoppers_harvested = int(payload.get("hoppersHarvested"))
        hours_operated = float(payload.get("hoursOperated"))
    except (TypeError, ValueError) as error:
        return {"error": str(error)}, 400

    machine_name = (payload.get("machineName") or "").strip()
    notes = (payload.get("notes") or "").strip()

    if not machine_name:
        return {"error": "El nombre de la máquina es requerido."}, 400
    if hoppers_harvested < 0:
        return {"error": "Las tolvas deben ser cero o más."}, 400
    if hours_operated <= 0 or hours_operated > 24:
        return {"error": "Las horas de operación deben estar entre 0 y 24."}, 400

    employee = Employee.query.get(employee_id)
    lot = Lot.query.get(lot_id)
    if not employee or not employee.is_active:
        return {"error": "Empleado no encontrado."}, 404
    if not lot:
        return {"error": "Lote no encontrado."}, 404

    machine_id = None
    if payload.get("machineId"):
        try:
            machine_id = int(payload["machineId"])
        except (TypeError, ValueError):
            pass

    harvest_log = HarvestLog(
        employee_id=employee_id,
        lot_id=lot_id,
        harvest_date=harvest_date,
        machine_id=machine_id,
        machine_name=machine_name,
        hoppers_harvested=hoppers_harvested,
        hours_operated=hours_operated,
        notes=notes or None,
    )
    db.session.add(harvest_log)
    db.session.commit()
    return harvest_log.to_dict(), 201


@api.delete("/harvest-logs/<int:log_id>")
@require_auth
@require_role("admin", "supervisor")
def delete_harvest_log(log_id):
    log = HarvestLog.query.get_or_404(log_id)
    db.session.delete(log)
    db.session.commit()
    return {"message": "Registro eliminado."}


# ─── Payroll ──────────────────────────────────────────────────────────────────

@api.get("/payroll/fortnight")
@require_auth
@require_role("admin", "supervisor")
def fortnight_payroll():
    start = request.args.get("start")
    end = request.args.get("end")
    if start and end:
        try:
            start_date = parse_date(start, "start")
            end_date = parse_date(end, "end")
        except ValueError as error:
            return {"error": str(error)}, 400
    else:
        start_date, end_date = get_fortnight_range()

    rows = (
        db.session.query(Employee, func.coalesce(func.sum(WorkLog.hours_worked), 0))
        .outerjoin(
            WorkLog,
            (WorkLog.employee_id == Employee.id) & (WorkLog.work_date.between(start_date, end_date)),
        )
        .filter(Employee.is_active.is_(True))
        .group_by(Employee.id)
        .order_by(Employee.name.asc())
        .all()
    )

    return {
        "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "items": [serialize_payroll_row(row) for row in rows],
    }


# ─── Reports ──────────────────────────────────────────────────────────────────

@api.get("/reports/lot/<int:lot_id>")
@require_auth
def lot_report(lot_id):
    lot = Lot.query.get_or_404(lot_id)
    activities = LotActivity.query.filter_by(lot_id=lot_id).order_by(LotActivity.performed_on.desc()).all()
    harvests = HarvestLog.query.filter_by(lot_id=lot_id).order_by(HarvestLog.harvest_date.desc()).all()
    work_logs = WorkLog.query.filter_by(lot_id=lot_id).order_by(WorkLog.work_date.desc()).all()

    total_hoppers = sum(h.hoppers_harvested for h in harvests)
    total_hours = sum(w.hours_worked for w in work_logs)

    return {
        "lot": lot.to_dict(),
        "totalHoppers": total_hoppers,
        "totalWorkHours": round(total_hours, 2),
        "activities": [a.to_dict() for a in activities],
        "harvests": [h.to_dict() for h in harvests],
        "workLogs": [w.to_dict() for w in work_logs],
    }
