from datetime import date, timedelta

from .extensions import db
from .models import Employee, FuelPurchase, HarvestLog, Lot, LotActivity, Machinery, WorkLog


def seed_database():
    if Employee.query.first():
        return

    # ─── Empleados ────────────────────────────────────────────────────────────
    admin = Employee(name="Laura Pineda", email="admin@agropipes.com", role="admin", phone="3001234567")
    admin.set_password("AgroPipes2026!")

    supervisor = Employee(name="Carlos Mejia", email="supervisor@agropipes.com", role="supervisor", phone="3109876543")
    supervisor.set_password("AgroPipes2026!")

    machinist = Employee(name="Duvan Torres", email="maquinista@agropipes.com", role="machinist", phone="3204567890")
    machinist.set_password("AgroPipes2026!")

    operator = Employee(name="Martha Rojas", email="operario@agropipes.com", role="operator", phone="3157654321")
    operator.set_password("AgroPipes2026!")

    # ─── Lotes (solo arroz) ───────────────────────────────────────────────────
    lots = [
        Lot(code="L-01", name="Lote La Palma", crop_type="Arroz", rice_variety="IR-42", hectares=18.5, status="active"),
        Lot(code="L-02", name="Lote El Molino", crop_type="Arroz", rice_variety="Fedearroz 473", hectares=24.0, status="active"),
        Lot(code="L-03", name="Lote Las Garzas", crop_type="Arroz", rice_variety="IR-42", hectares=11.2, status="preparacion"),
        Lot(code="L-04", name="Lote El Palmar", crop_type="Arroz", rice_variety="Fedearroz 60", hectares=32.0, status="active"),
    ]

    # ─── Maquinaria ──────────────────────────────────────────────────────────
    cosechadora1 = Machinery(
        code="COS-01", name="Cosechadora Case IH AFS", type="cosechadora",
        brand="Case IH", model_year=2019, license_plate="ABC-123",
        fuel_type="ACPPM", status="active", current_hours=2840.5,
        notes="Motor en excelente estado. Mantenimiento al día."
    )
    cosechadora2 = Machinery(
        code="COS-02", name="Cosechadora John Deere S560", type="cosechadora",
        brand="John Deere", model_year=2021, license_plate="DEF-456",
        fuel_type="ACPPM", status="active", current_hours=1200.0,
    )
    tractor1 = Machinery(
        code="TRA-01", name="Tractor New Holland T7", type="tractor",
        brand="New Holland", model_year=2018, license_plate="GHI-789",
        fuel_type="ACPPM", status="active", current_hours=3500.0,
        notes="Equipo principal de preparación de suelo."
    )
    tractor2 = Machinery(
        code="TRA-02", name="Tractor John Deere 6110J", type="tractor",
        brand="John Deere", model_year=2020, license_plate="JKL-012",
        fuel_type="ACPPM", status="active", current_hours=1800.0,
    )
    fumigadora = Machinery(
        code="FUM-01", name="Fumigadora Jacto Uniport 2500", type="fumigadora",
        brand="Jacto", model_year=2020, fuel_type="gasolina",
        status="active", current_hours=450.0,
    )

    db.session.add_all([admin, supervisor, machinist, operator, *lots,
                        cosechadora1, cosechadora2, tractor1, tractor2, fumigadora])
    db.session.flush()

    today = date.today()
    start = today.replace(day=1) if today.day <= 15 else today.replace(day=16)

    # ─── Jornales diarios ─────────────────────────────────────────────────────
    work_logs = [
        WorkLog(employee_id=operator.id, lot_id=lots[0].id, work_date=start,
                function_name="Siembra manual", hours_worked=8,
                notes="Cobertura completa del frente norte."),
        WorkLog(employee_id=operator.id, lot_id=lots[1].id, work_date=start + timedelta(days=1),
                function_name="Riego por gravedad", hours_worked=7.5,
                notes="Ajuste de compuertas canal principal."),
        WorkLog(employee_id=supervisor.id, lot_id=lots[0].id, work_date=start + timedelta(days=2),
                function_name="Supervisión de abono", hours_worked=6,
                notes="Validación de dosis y calibración."),
        WorkLog(employee_id=machinist.id, lot_id=lots[1].id, work_date=start + timedelta(days=3),
                function_name="Preparación de maquinaria", hours_worked=8,
                machine_id=cosechadora1.id, notes="Chequeo preventivo pre-cosecha."),
        WorkLog(employee_id=operator.id, lot_id=lots[2].id, work_date=start + timedelta(days=4),
                function_name="Preparación de suelo", hours_worked=8,
                machine_id=tractor1.id, notes="Rastrillado y nivelación."),
        WorkLog(employee_id=machinist.id, lot_id=lots[3].id, work_date=start + timedelta(days=5),
                function_name="Cosecha mecanizada", hours_worked=10,
                machine_id=cosechadora2.id, notes="Jornada completa sin contratiempos."),
    ]

    # ─── Actividades de lote ──────────────────────────────────────────────────
    activities = [
        LotActivity(
            lot_id=lots[0].id, activity_type="Abono", performed_on=start,
            input_name="Urea 46%", dose="120 kg/ha", quantity=18.5, unit="bultos",
            area_covered=18.5, notes="Aplicación en banda pre-siembra.",
            created_by_id=supervisor.id
        ),
        LotActivity(
            lot_id=lots[1].id, activity_type="Fumigacion", performed_on=start + timedelta(days=2),
            input_name="Lambda-cialotrina", dose="1.5 L/ha", quantity=36.0, unit="litros",
            area_covered=24.0, machine_id=fumigadora.id,
            notes="Control preventivo de chicharrita y falso medidor.",
            created_by_id=admin.id
        ),
        LotActivity(
            lot_id=lots[0].id, activity_type="Abono", performed_on=start + timedelta(days=3),
            input_name="DAP 18-46-0", dose="80 kg/ha", quantity=22.0, unit="bultos",
            area_covered=18.5, notes="Segunda fertilización etapa macollamiento.",
            created_by_id=supervisor.id
        ),
        LotActivity(
            lot_id=lots[1].id, activity_type="Fumigacion", performed_on=start + timedelta(days=5),
            input_name="Tricyclazole 75 WP", dose="0.6 kg/ha", quantity=14.4, unit="kg",
            area_covered=24.0, machine_id=fumigadora.id,
            notes="Aplicación preventiva pyricularia.",
            created_by_id=supervisor.id
        ),
        LotActivity(
            lot_id=lots[2].id, activity_type="Preparacion suelo", performed_on=start + timedelta(days=4),
            input_name="N/A", dose="N/A", notes="Primer pase de rastra.",
            created_by_id=supervisor.id, machine_id=tractor1.id
        ),
        LotActivity(
            lot_id=lots[3].id, activity_type="Abono", performed_on=start + timedelta(days=1),
            input_name="KCl (Cloruro de potasio)", dose="100 kg/ha", quantity=32.0, unit="bultos",
            area_covered=32.0, notes="Aplicación a voleo.",
            created_by_id=admin.id
        ),
    ]

    # ─── Cosecha ──────────────────────────────────────────────────────────────
    harvest_logs = [
        HarvestLog(employee_id=machinist.id, lot_id=lots[1].id,
                   harvest_date=start + timedelta(days=5),
                   machine_id=cosechadora1.id, machine_name=cosechadora1.name,
                   hoppers_harvested=11, hours_operated=9,
                   notes="Cosecha estable durante toda la jornada. Humedad grano 22%."),
        HarvestLog(employee_id=machinist.id, lot_id=lots[0].id,
                   harvest_date=start + timedelta(days=6),
                   machine_id=cosechadora1.id, machine_name=cosechadora1.name,
                   hoppers_harvested=9, hours_operated=8,
                   notes="Avance condicionado por humedad suelo 30%."),
        HarvestLog(employee_id=machinist.id, lot_id=lots[3].id,
                   harvest_date=start + timedelta(days=7),
                   machine_id=cosechadora2.id, machine_name=cosechadora2.name,
                   hoppers_harvested=14, hours_operated=11,
                   notes="Excelente rendimiento. Lote 4 terminado."),
    ]

    # ─── Compras de combustible ───────────────────────────────────────────────
    fuel_purchases = [
        FuelPurchase(
            purchase_date=start, fuel_type="ACPPM", quantity_liters=500,
            price_per_liter=5800, total_cost=2900000,
            supplier="Estación el Progreso", machine_id=cosechadora1.id,
            employee_id=supervisor.id, invoice_number="FE-0012345",
            notes="Tanque lleno antes de inicio de cosecha.",
        ),
        FuelPurchase(
            purchase_date=start + timedelta(days=2), fuel_type="ACPPM", quantity_liters=350,
            price_per_liter=5800, total_cost=2030000,
            supplier="Estación el Progreso", machine_id=tractor1.id,
            employee_id=supervisor.id, invoice_number="FE-0012346",
        ),
        FuelPurchase(
            purchase_date=start + timedelta(days=4), fuel_type="ACPPM", quantity_liters=420,
            price_per_liter=5850, total_cost=2457000,
            supplier="Biomax La Avenida", machine_id=cosechadora2.id,
            employee_id=machinist.id, invoice_number="FE-0098765",
        ),
        FuelPurchase(
            purchase_date=start + timedelta(days=5), fuel_type="gasolina", quantity_liters=80,
            price_per_liter=9200, total_cost=736000,
            supplier="Terpel Central", machine_id=fumigadora.id,
            employee_id=operator.id, invoice_number="FE-0011111",
            notes="Combustible para fumigadora semana 1.",
        ),
    ]

    db.session.add_all(work_logs + activities + harvest_logs + fuel_purchases)
    db.session.commit()
