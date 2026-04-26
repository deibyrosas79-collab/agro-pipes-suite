from datetime import datetime

from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


class Employee(db.Model):
    __tablename__ = "employees"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    role = db.Column(db.String(40), nullable=False, default="operator")
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    phone = db.Column(db.String(20))
    id_number = db.Column(db.String(30))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    work_logs = db.relationship("WorkLog", back_populates="employee", cascade="all, delete-orphan")
    harvest_logs = db.relationship("HarvestLog", back_populates="employee", cascade="all, delete-orphan")
    activities = db.relationship("LotActivity", back_populates="created_by")
    fuel_purchases = db.relationship("FuelPurchase", back_populates="employee")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "phone": self.phone or "",
            "idNumber": self.id_number or "",
            "isActive": self.is_active,
            "createdAt": self.created_at.isoformat(),
        }


class Lot(db.Model):
    __tablename__ = "lots"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    crop_type = db.Column(db.String(60), nullable=False, default="Arroz")
    rice_variety = db.Column(db.String(80))
    hectares = db.Column(db.Float, nullable=False, default=0)
    status = db.Column(db.String(40), nullable=False, default="active")
    sowing_date = db.Column(db.Date)
    expected_harvest_date = db.Column(db.Date)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    work_logs = db.relationship("WorkLog", back_populates="lot", cascade="all, delete-orphan")
    activities = db.relationship("LotActivity", back_populates="lot", cascade="all, delete-orphan")
    harvest_logs = db.relationship("HarvestLog", back_populates="lot", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "cropType": self.crop_type,
            "riceVariety": self.rice_variety or "",
            "hectares": self.hectares,
            "status": self.status,
            "sowingDate": self.sowing_date.isoformat() if self.sowing_date else None,
            "expectedHarvestDate": self.expected_harvest_date.isoformat() if self.expected_harvest_date else None,
            "notes": self.notes or "",
        }


class Machinery(db.Model):
    __tablename__ = "machinery"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    type = db.Column(db.String(60), nullable=False)  # cosechadora, tractor, fumigadora, vehiculo
    brand = db.Column(db.String(80))
    model_year = db.Column(db.Integer)
    license_plate = db.Column(db.String(20))
    fuel_type = db.Column(db.String(40), default="ACPPM")
    status = db.Column(db.String(40), nullable=False, default="active")
    current_hours = db.Column(db.Float, default=0)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    fuel_purchases = db.relationship("FuelPurchase", back_populates="machine")
    harvest_logs = db.relationship("HarvestLog", back_populates="machine")
    work_logs = db.relationship("WorkLog", back_populates="machine")
    activities = db.relationship("LotActivity", back_populates="machine")

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "type": self.type,
            "brand": self.brand or "",
            "modelYear": self.model_year,
            "licensePlate": self.license_plate or "",
            "fuelType": self.fuel_type or "ACPPM",
            "status": self.status,
            "currentHours": self.current_hours or 0,
            "notes": self.notes or "",
        }


class FuelPurchase(db.Model):
    __tablename__ = "fuel_purchases"

    id = db.Column(db.Integer, primary_key=True)
    purchase_date = db.Column(db.Date, nullable=False, index=True)
    fuel_type = db.Column(db.String(40), nullable=False, default="ACPPM")
    quantity_liters = db.Column(db.Float, nullable=False)
    price_per_liter = db.Column(db.Float)
    total_cost = db.Column(db.Float)
    supplier = db.Column(db.String(120))
    machine_id = db.Column(db.Integer, db.ForeignKey("machinery.id"), nullable=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=True)
    invoice_number = db.Column(db.String(80))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    machine = db.relationship("Machinery", back_populates="fuel_purchases")
    employee = db.relationship("Employee", back_populates="fuel_purchases")

    def to_dict(self):
        return {
            "id": self.id,
            "purchaseDate": self.purchase_date.isoformat(),
            "fuelType": self.fuel_type,
            "quantityLiters": self.quantity_liters,
            "pricePerLiter": self.price_per_liter,
            "totalCost": self.total_cost,
            "supplier": self.supplier or "",
            "machineId": self.machine_id,
            "machineName": self.machine.name if self.machine else None,
            "employeeId": self.employee_id,
            "employeeName": self.employee.name if self.employee else None,
            "invoiceNumber": self.invoice_number or "",
            "notes": self.notes or "",
        }


class WorkLog(db.Model):
    __tablename__ = "work_logs"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    lot_id = db.Column(db.Integer, db.ForeignKey("lots.id"), nullable=False)
    work_date = db.Column(db.Date, nullable=False, index=True)
    function_name = db.Column(db.String(120), nullable=False)
    hours_worked = db.Column(db.Float, nullable=False)
    machine_id = db.Column(db.Integer, db.ForeignKey("machinery.id"), nullable=True)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    employee = db.relationship("Employee", back_populates="work_logs")
    lot = db.relationship("Lot", back_populates="work_logs")
    machine = db.relationship("Machinery", back_populates="work_logs")

    def to_dict(self):
        return {
            "id": self.id,
            "employeeId": self.employee_id,
            "employeeName": self.employee.name if self.employee else None,
            "lotId": self.lot_id,
            "lotCode": self.lot.code if self.lot else None,
            "lotName": self.lot.name if self.lot else None,
            "workDate": self.work_date.isoformat(),
            "functionName": self.function_name,
            "hoursWorked": self.hours_worked,
            "machineId": self.machine_id,
            "machineName": self.machine.name if self.machine else None,
            "notes": self.notes or "",
        }


class LotActivity(db.Model):
    __tablename__ = "lot_activities"

    id = db.Column(db.Integer, primary_key=True)
    lot_id = db.Column(db.Integer, db.ForeignKey("lots.id"), nullable=False)
    activity_type = db.Column(db.String(60), nullable=False)
    performed_on = db.Column(db.Date, nullable=False, index=True)
    input_name = db.Column(db.String(120))
    dose = db.Column(db.String(80))
    quantity = db.Column(db.Float)
    unit = db.Column(db.String(20))
    area_covered = db.Column(db.Float)
    machine_id = db.Column(db.Integer, db.ForeignKey("machinery.id"), nullable=True)
    notes = db.Column(db.Text)
    created_by_id = db.Column(db.Integer, db.ForeignKey("employees.id"))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    lot = db.relationship("Lot", back_populates="activities")
    created_by = db.relationship("Employee", back_populates="activities")
    machine = db.relationship("Machinery", back_populates="activities")

    def to_dict(self):
        return {
            "id": self.id,
            "lotId": self.lot_id,
            "lotCode": self.lot.code if self.lot else None,
            "lotName": self.lot.name if self.lot else None,
            "activityType": self.activity_type,
            "performedOn": self.performed_on.isoformat(),
            "inputName": self.input_name or "",
            "dose": self.dose or "",
            "quantity": self.quantity,
            "unit": self.unit or "",
            "areaCovered": self.area_covered,
            "machineId": self.machine_id,
            "machineName": self.machine.name if self.machine else None,
            "notes": self.notes or "",
            "createdBy": self.created_by.name if self.created_by else "",
        }


class HarvestLog(db.Model):
    __tablename__ = "harvest_logs"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False)
    lot_id = db.Column(db.Integer, db.ForeignKey("lots.id"), nullable=False)
    harvest_date = db.Column(db.Date, nullable=False, index=True)
    machine_id = db.Column(db.Integer, db.ForeignKey("machinery.id"), nullable=True)
    machine_name = db.Column(db.String(120), nullable=False)
    hoppers_harvested = db.Column(db.Integer, nullable=False, default=0)
    hours_operated = db.Column(db.Float, nullable=False, default=0)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    employee = db.relationship("Employee", back_populates="harvest_logs")
    lot = db.relationship("Lot", back_populates="harvest_logs")
    machine = db.relationship("Machinery", back_populates="harvest_logs")

    def to_dict(self):
        return {
            "id": self.id,
            "employeeId": self.employee_id,
            "employeeName": self.employee.name if self.employee else None,
            "lotId": self.lot_id,
            "lotCode": self.lot.code if self.lot else None,
            "lotName": self.lot.name if self.lot else None,
            "harvestDate": self.harvest_date.isoformat(),
            "machineId": self.machine_id,
            "machineName": (self.machine.name if self.machine else None) or self.machine_name,
            "hoppersHarvested": self.hoppers_harvested,
            "hoursOperated": self.hours_operated,
            "notes": self.notes or "",
        }
