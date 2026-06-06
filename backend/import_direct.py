"""
Thêm compliance_alerts vào MySQL (KHÔNG DROP TABLE — giữ nguyên schema + FK).
Dùng INSERT IGNORE để không bị lỗi duplicate.
"""
import subprocess
import re
import sys

import pathlib

# Tìm file SQL ở nhiều vị trí
CANDIDATES = [
    "compliance_alert_export.sql",
    "compliance_alerts_export.sql",
    "exports/compliance_alerts_export.sql",
    "exports/compliance_alert_export.sql",
    "../compliance_alert_export.sql",
]
SQL_FILE = None
for c in CANDIDATES:
    if pathlib.Path(c).exists():
        SQL_FILE = c
        break

if SQL_FILE is None:
    # List tất cả .sql files tìm được
    found = list(pathlib.Path(".").rglob("*.sql"))
    if found:
        SQL_FILE = str(found[0])
        print(f"[AUTO] Using: {SQL_FILE}")
    else:
        print("[ERR] No .sql file found. Please save your compliance_alert_export.sql file to backend folder.")
        sys.exit(1)

print(f"[FILE] {SQL_FILE}")

with open(SQL_FILE, "rb") as f:
    raw = f.read()

content = raw.decode("utf-8", errors="replace")
print(f"File: {len(raw)} bytes")

# ── 2. Tìm INSERT block và split thành các rows ─────────────────────────────
insert_start = content.find("INSERT INTO")
if insert_start == -1:
    print("[ERR] No INSERT found"); sys.exit(1)

insert_block = content[insert_start:]

# Split theo ),\n( giữa các rows
rows_raw = re.split(r'\),\s*\n?\s*\((?=\d+,)', insert_block)
print(f"[INFO] {len(rows_raw)} potential rows")

# ── 3. Lọc các rows hoàn chỉnh ──────────────────────────────────────────────
complete_rows = []
for i, row in enumerate(rows_raw):
    row = row.strip()
    if row.startswith("INSERT"):
        m = re.search(r'VALUES\s*\(', row, re.IGNORECASE)
        if m:
            row = row[m.end()-1:]
    if re.search(r"'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}'\s*$", row.rstrip(');').rstrip()):
        complete_rows.append(row.strip("(),; \r\n"))
    else:
        print(f"[SKIP] Row {i+1} incomplete (truncated)")

print(f"[INFO] {len(complete_rows)} complete rows to insert")

# ── 4. CMD base ──────────────────────────────────────────────────────────────
cmd_base = ["docker", "compose", "exec", "-T", "mysql",
            "mysql", "--default-character-set=utf8mb4",
            "-uroot", "-ppassword", "law_db"]

# ── 5. Xóa rows seeded mặc định (id=1,2) và insert dữ liệu thật ─────────────
# Đầu tiên xóa action_plans liên quan (FK cascade)
clean_sql = (
    "SET NAMES utf8mb4;\n"
    "SET FOREIGN_KEY_CHECKS=0;\n"
    "DELETE FROM action_plans WHERE alert_id IN (1, 2);\n"
    "DELETE FROM compliance_alerts WHERE id IN (1, 2);\n"
    "SET FOREIGN_KEY_CHECKS=1;\n"
)
r = subprocess.run(cmd_base, input=clean_sql.encode("utf-8"), capture_output=True)
if r.returncode == 0:
    print("[OK] Cleared seed data (id=1,2)")
else:
    print("[WARN] Clear seed:", r.stderr.decode("utf-8", errors="replace").splitlines()[-1])

# ── 6. Insert từng row ───────────────────────────────────────────────────────
success = 0
for i, row_vals in enumerate(complete_rows):
    insert_sql = (
        "SET NAMES utf8mb4;\n"
        "SET FOREIGN_KEY_CHECKS=0;\n"
        f"INSERT IGNORE INTO `compliance_alerts` VALUES ({row_vals});\n"
        "SET FOREIGN_KEY_CHECKS=1;\n"
    )
    r = subprocess.run(cmd_base, input=insert_sql.encode("utf-8"), capture_output=True)
    err = r.stderr.decode("utf-8", errors="replace")
    if r.returncode == 0:
        success += 1
        id_m = re.match(r'\(?(\d+),', row_vals)
        rid = id_m.group(1) if id_m else f"#{i+1}"
        print(f"  [OK] Row id={rid}")
    else:
        last = [l for l in err.splitlines() if l.strip()]
        print(f"  [ERR] Row {i+1}: {last[-1] if last else 'unknown'}")

print(f"\n[DONE] {success}/{len(complete_rows)} rows inserted")

# ── 7. Verify ────────────────────────────────────────────────────────────────
verify_sql = "SELECT id, code, severity, LEFT(title,40) as title FROM compliance_alerts ORDER BY id;\n"
r = subprocess.run(cmd_base, input=verify_sql.encode("utf-8"), capture_output=True)
out = r.stdout.decode("utf-8", errors="replace")
print("\n--- DB state ---")
print(out)
