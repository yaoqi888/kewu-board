# -*- coding: utf-8 -*-
"""
科务看板 1.2.1 正式版服务端
- Flask + SQLite + Waitress
- 局域网集中数据、登录会话、服务端权限校验、周期任务、备份恢复
- 任务来源、删除回收站、日历节假日、托盘运行
"""

import calendar
import ctypes
import hashlib
import hmac
import io
import json
import logging
import os
import re
import secrets
import shutil
import socket
import sqlite3
import sys
import threading
import time
import webbrowser
import winreg
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from flask import Flask, g, jsonify, redirect, render_template_string, request, send_file, send_from_directory, session
from werkzeug.exceptions import HTTPException

APP_VERSION = "1.2.1"
APP_NAME = "科务看板"
INITIAL_PASSWORD = "Kewu@2026"
TASK_SOURCES = ["市委市政府", "省商务厅", "局领导交办", "其他单位", "科室自定"]
DEFAULT_CATEGORIES = [
    ("数据报表", 0), ("文字材料", 1), ("调研督导", 2),
    ("会议活动", 3), ("协调对接", 4), ("其他事务", 5),
]
SESSION_HOURS = 12
MAX_BACKUPS = 40

FROZEN = bool(getattr(sys, "frozen", False))
EXE_DIR = Path(sys.executable).resolve().parent if FROZEN else Path(__file__).resolve().parent
RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", EXE_DIR))
STATIC_DIR = RESOURCE_DIR / "static"
SCHEMA_PATH = RESOURCE_DIR / "schema.sql"
CALENDAR_SEED_PATH = RESOURCE_DIR / "holidays-2026.json"
DATA_DIR = Path(os.environ.get("KEWU_DATA_DIR") or (EXE_DIR / "data"))
DB_PATH = DATA_DIR / "kewu.db"
BACKUP_DIR = DATA_DIR / "backups"
LOG_DIR = DATA_DIR / "logs"
SECRET_PATH = DATA_DIR / "secret.key"
PORT = int(os.environ.get("KEWU_PORT", "5080"))
HOST = os.environ.get("KEWU_HOST", "0.0.0.0")
TIMEZONE = os.environ.get("KEWU_TIMEZONE", "Asia/Shanghai")

for directory in (DATA_DIR, BACKUP_DIR, LOG_DIR):
    directory.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger("kewu")
logger.setLevel(logging.INFO)
if not logger.handlers:
    if sys.stderr is not None:
        stream = logging.StreamHandler()
        stream.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        logger.addHandler(stream)
    file_handler = RotatingFileHandler(LOG_DIR / "app.log", maxBytes=2 * 1024 * 1024, backupCount=5, encoding="utf-8")
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(file_handler)


def load_or_create_secret():
    if SECRET_PATH.exists():
        return SECRET_PATH.read_text(encoding="ascii").strip()
    value = secrets.token_hex(32)
    SECRET_PATH.write_text(value, encoding="ascii")
    return value


app = Flask(__name__, static_folder=None)
app.json.ensure_ascii = False
app.config.update(
    SECRET_KEY=load_or_create_secret(),
    SESSION_COOKIE_NAME="kewu_session",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=False,
    PERMANENT_SESSION_LIFETIME=timedelta(hours=SESSION_HOURS),
    MAX_CONTENT_LENGTH=64 * 1024 * 1024,
    JSON_AS_ASCII=False,
)

DB_WRITE_LOCK = threading.RLock()
LOGIN_FAILS = {}
LOGIN_LOCK = threading.Lock()


class ApiError(Exception):
    def __init__(self, status, message, code=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def new_id(prefix):
    return prefix + "_" + secrets.token_hex(8)


def pad2(value):
    return str(value).zfill(2)


def normalize_time(value):
    match = re.match(r"^(\d{1,2}):(\d{2})", str(value or ""))
    if not match:
        return "18:00"
    hour = max(0, min(23, int(match.group(1))))
    minute = max(0, min(59, int(match.group(2))))
    return f"{pad2(hour)}:{pad2(minute)}"


def valid_iso_date(value):
    try:
        return date.fromisoformat(str(value))
    except Exception:
        return None


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", str(password).encode("utf-8"), salt.encode("ascii"), 260000).hex()
    return "pbkdf2_sha256$260000$" + salt + "$" + digest


def verify_password(password, encoded):
    try:
        algo, rounds, salt, digest = str(encoded).split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        calc = hashlib.pbkdf2_hmac("sha256", str(password).encode("utf-8"), salt.encode("ascii"), int(rounds)).hex()
        return hmac.compare_digest(calc, digest)
    except Exception:
        return False


def password_fingerprint(encoded):
    return hashlib.sha256(str(encoded).encode("utf-8")).hexdigest()[:24]


def password_problem(password):
    text = str(password or "")
    if len(text) < 8:
        return "密码至少需要 8 位。"
    if not re.search(r"[A-Za-z]", text) or not re.search(r"\d", text):
        return "密码需要同时包含字母和数字。"
    return ""


def connect_db(path=None):
    conn = sqlite3.connect(str(path or DB_PATH), timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 8000")
    return conn


def db():
    if "db" not in g:
        g.db = connect_db()
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


@contextmanager
def transaction():
    with DB_WRITE_LOCK:
        conn = db()
        conn.execute("BEGIN IMMEDIATE")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def setting_get(key, fallback=""):
    row = db().execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else fallback


def setting_set(key, value):
    db().execute(
        "INSERT INTO app_settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )


def get_setting_bool(key, fallback=True):
    row = db().execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    if not row:
        return fallback
    return str(row["value"]).lower() in ("1", "true", "yes", "on")


def seed_database(conn):
    now = now_iso()
    people = [
        ("p1", "姚琦", "科长", "manager", "green"),
        ("p2", "郭军", "一级主任科员", "manager", "blue"),
        ("p3", "邢玲", "科员", "staff", "amber"),
        ("p4", "李鹏", "科员", "staff", "purple"),
        ("p5", "张文瑞", "科员", "staff", "rose"),
    ]
    if conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 0:
        for person_id, name, title, role, tone in people:
            conn.execute(
                "INSERT INTO users(id, name, title, role, active, password_hash, must_change_password, avatar_tone, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (person_id, name, title, role, 1, hash_password(INITIAL_PASSWORD), 1, tone, now, now),
            )
    if conn.execute("SELECT COUNT(*) AS n FROM categories").fetchone()["n"] == 0:
        for order, (name, tone) in enumerate(DEFAULT_CATEGORIES):
            conn.execute(
                "INSERT INTO categories(id, name, tone, active, sort_order, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
                ("c" + str(order + 1), name, tone, 1, order, now, now),
            )
    defaults = {
        "auto_backup_enabled": "1",
        "backup_interval_hours": "24",
        "last_auto_backup_at": "",
        "schema_version": "1",
    }
    for key, value in defaults.items():
        conn.execute("INSERT OR IGNORE INTO app_settings(key, value) VALUES(?,?)", (key, value))


def ensure_column(conn, table, column, ddl):
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(" + table + ")").fetchall()}
    if column not in columns:
        conn.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + ddl)


def migrate_database(conn):
    ensure_column(conn, "tasks", "source", "TEXT NOT NULL DEFAULT '科室自定'")
    ensure_column(conn, "templates", "source", "TEXT NOT NULL DEFAULT '科室自定'")
    ensure_column(conn, "tasks", "deleted_at", "TEXT")
    ensure_column(conn, "tasks", "deleted_by", "TEXT")
    old_names = {"经济运行", "企业服务", "项目推进", "安全生产", "综合事务"}
    names = {row["name"] for row in conn.execute("SELECT name FROM categories").fetchall()}
    task_count = conn.execute("SELECT COUNT(*) AS n FROM tasks").fetchone()["n"]
    template_count = conn.execute("SELECT COUNT(*) AS n FROM templates").fetchone()["n"]
    if names and names <= old_names and task_count == 0 and template_count == 0:
        conn.execute("DELETE FROM categories")
        now = now_iso()
        for order, (name, tone) in enumerate(DEFAULT_CATEGORIES):
            conn.execute(
                "INSERT INTO categories(id, name, tone, active, sort_order, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
                ("c" + str(order + 1), name, tone, 1, order, now, now),
            )
    conn.execute("DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?",
                 ((datetime.now().astimezone() - timedelta(days=30)).isoformat(timespec="seconds"),))
    conn.execute("INSERT OR REPLACE INTO app_settings(key, value) VALUES('schema_version', '2')")


def init_database():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect_db()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        schema = SCHEMA_PATH.read_text(encoding="utf-8")
        conn.executescript(schema)
        fresh = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] == 0
        seed_database(conn)
        migrate_database(conn)
        if conn.execute("SELECT COUNT(*) AS n FROM calendar_years").fetchone()["n"] == 0 and CALENDAR_SEED_PATH.exists():
            try:
                payload = json.loads(CALENDAR_SEED_PATH.read_text(encoding="utf-8"))
                days = {}
                for item in payload.get("days", []):
                    if item.get("date"):
                        days[item["date"]] = {"name": item.get("name") or "", "off": bool(item.get("isOffDay", True))}
                conn.execute("INSERT OR REPLACE INTO calendar_years(year, days_json, source, synced_at) VALUES(?,?,?,?)",
                             (2026, json.dumps(days, ensure_ascii=False), "内置 holiday-cn 2026 数据", now_iso()))
            except Exception as exc:
                logger.warning("内置节假日数据载入失败: %s", exc)
        conn.commit()
    finally:
        conn.close()
    logger.info("数据库就绪: %s", DB_PATH)
    return fresh


def row_user(row):
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "title": row["title"],
        "role": row["role"],
        "active": bool(row["active"]),
        "avatarTone": row["avatar_tone"],
        "mustChangePassword": bool(row["must_change_password"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def current_user():
    uid = session.get("uid")
    if not uid:
        return None
    row = db().execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not row or not row["active"]:
        return None
    if session.get("pv") != password_fingerprint(row["password_hash"]):
        session.clear()
        return None
    return row_user(row)


def is_manager(user=None):
    user = user or current_user()
    return bool(user and user.get("role") == "manager")


def session_csrf():
    token = session.get("csrf")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf"] = token
    return token


def login_fail_key():
    name = str((request.get_json(silent=True) or {}).get("name") or "").strip().lower()
    return f"{request.remote_addr}|{name}"


def login_rate_limited():
    key = login_fail_key()
    now = time.time()
    with LOGIN_LOCK:
        attempts = [t for t in LOGIN_FAILS.get(key, []) if now - t < 600]
        LOGIN_FAILS[key] = attempts
        return len(attempts) >= 5


def record_login_failure():
    key = login_fail_key()
    with LOGIN_LOCK:
        LOGIN_FAILS.setdefault(key, []).append(time.time())


def clear_login_failures():
    key = login_fail_key()
    with LOGIN_LOCK:
        LOGIN_FAILS.pop(key, None)


@app.before_request
def guard_api():
    path = request.path
    if not path.startswith("/api/"):
        return None
    if path in ("/api/health", "/api/login"):
        return None
    user = current_user()
    if not user:
        return jsonify({"error": "登录已失效，请重新登录。", "code": "auth_required"}), 401
    if user.get("mustChangePassword") and path not in ("/api/account/password", "/api/logout"):
        return jsonify({"error": "首次登录请先修改初始密码。", "code": "must_change_password"}), 403
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        origin = request.headers.get("Origin")
        if origin:
            parsed = urlparse(origin)
            if parsed.netloc and parsed.netloc != request.host:
                return jsonify({"error": "请求来源无效。", "code": "bad_origin"}), 403
        if path != "/api/login":
            token = request.headers.get("X-CSRF-Token", "")
            if not token or not hmac.compare_digest(token, str(session.get("csrf", ""))):
                return jsonify({"error": "页面会话已过期，请刷新后重试。", "code": "csrf"}), 403
    return None


@app.errorhandler(ApiError)
def handle_api_error(error):
    return jsonify({"error": error.message, "code": error.code or "api_error"}), error.status


@app.errorhandler(HTTPException)
def handle_http_error(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": error.description or "请求失败", "code": "http_" + str(error.code)}), error.code
    return error


@app.errorhandler(Exception)
def handle_unexpected(error):
    logger.exception("未处理异常: %s", error)
    if request.path.startswith("/api/"):
        return jsonify({"error": "服务器处理失败，请稍后重试。", "code": "server_error"}), 500
    return "服务器处理失败，请查看主机日志。", 500


def require_manager():
    if not is_manager():
        raise ApiError(403, "只有科长或主任科员可以执行此操作。")


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "请求数据格式不正确。")
    return data


def text_field(data, key, label, required=True, max_length=800):
    value = str(data.get(key, "") or "").strip()
    if required and not value:
        raise ApiError(400, "请填写" + label + "。")
    if len(value) > max_length:
        raise ApiError(400, label + "内容过长。")
    return value


def task_by_id(conn, task_id):
    return conn.execute("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL", (task_id,)).fetchone()


def task_payload(row, category_map, progress_map, event_map):
    return {
        "id": row["id"],
        "code": row["code"],
        "templateId": row["template_id"],
        "seriesId": row["template_id"],
        "periodKey": row["period_key"],
        "title": row["title"],
        "description": row["description"],
        "category": category_map.get(row["category_id"], "其他事务"),
        "source": row["source"] or "科室自定",
        "type": row["type"],
        "assigneeId": row["assignee_id"],
        "creatorId": row["creator_id"],
        "status": row["status"],
        "dueDate": row["due_date"],
        "dueTime": row["due_time"],
        "startedAt": row["started_at"],
        "submittedAt": row["submitted_at"],
        "completedAt": row["completed_at"],
        "reviewedAt": row["reviewed_at"],
        "reviewerId": row["reviewer_id"],
        "reviewNote": row["review_note"],
        "rejectionCount": row["rejection_count"],
        "version": row["version"],
        "deletedAt": row["deleted_at"] if "deleted_at" in row.keys() else None,
        "deletedBy": row["deleted_by"] if "deleted_by" in row.keys() else None,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "archivedAt": row["completed_at"] if row["status"] == "completed" and row["type"] == "one-time" else None,
        "progress": progress_map.get(row["id"], []),
        "activity": event_map.get(row["id"], []),
    }


def serialize_state(user):
    conn = db()
    people = [row_user(row) for row in conn.execute("SELECT * FROM users ORDER BY created_at, id").fetchall()]
    category_rows = conn.execute("SELECT * FROM categories ORDER BY sort_order, id").fetchall()
    categories = [{"name": row["name"], "tone": row["tone"], "active": bool(row["active"])} for row in category_rows]
    category_map = {row["id"]: row["name"] for row in category_rows}
    progress_map = {}
    for row in conn.execute("SELECT * FROM task_progress ORDER BY created_at, rowid").fetchall():
        progress_map.setdefault(row["task_id"], []).append({
            "id": row["id"], "at": row["created_at"], "actorId": row["actor_id"],
            "type": row["kind"], "content": row["content"],
        })
    event_map = {}
    for row in conn.execute("SELECT * FROM task_events ORDER BY created_at, rowid").fetchall():
        event_map.setdefault(row["task_id"], []).append({
            "at": row["created_at"], "actorId": row["actor_id"],
            "action": row["action"], "note": row["note"],
        })
    tasks = [task_payload(row, category_map, progress_map, event_map)
             for row in conn.execute("SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY created_at, id").fetchall()]
    deleted_tasks = []
    if is_manager(user):
        deleted_tasks = [task_payload(row, category_map, progress_map, event_map)
                         for row in conn.execute("SELECT * FROM tasks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").fetchall()]
    templates = [{
        "id": row["id"], "title": row["title"], "description": row["description"],
        "category": category_map.get(row["category_id"], "其他事务"),
        "source": row["source"] or "科室自定",
        "assigneeId": row["assignee_id"], "cycle": row["cycle"], "anchorDue": row["anchor_due"],
        "dueTime": row["due_time"], "active": bool(row["active"]), "createdBy": row["created_by"],
        "createdAt": row["created_at"], "updatedAt": row["updated_at"],
    } for row in conn.execute("SELECT * FROM templates ORDER BY created_at, id").fetchall()]
    settings = {
        "autoBackupEnabled": get_setting_bool("auto_backup_enabled", True),
        "backupIntervalHours": int(setting_get("backup_interval_hours", "24") or 24),
        "serverVersion": APP_VERSION,
        "isProduction": True,
        "serverName": socket.gethostname(),
        "port": PORT,
        "dataDir": str(DATA_DIR),
    }
    calendar_row = conn.execute("SELECT * FROM calendar_years WHERE year = ?", (date.today().year,)).fetchone()
    calendar = None
    if calendar_row:
        try:
            days = json.loads(calendar_row["days_json"])
        except Exception:
            days = {}
        calendar = {"year": calendar_row["year"], "days": days,
                    "source": calendar_row["source"], "syncedAt": calendar_row["synced_at"]}
    return {
        "version": 2,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
        "currentUserId": user["id"],
        "currentUser": user,
        "people": people,
        "categories": categories,
        "templates": templates,
        "tasks": tasks,
        "deletedTasks": deleted_tasks,
        "calendar": calendar,
        "settings": settings,
        "serverTime": now_iso(),
    }


def list_backups():
    items = []
    for path in BACKUP_DIR.glob("kewu_*.db"):
        match = re.match(r"^kewu_(\d{8}-\d{6})_(manual|auto|pre-restore)(_[0-9a-f]+)?\.db$", path.name)
        if not match:
            continue
        stat = path.stat()
        reason = match.group(2)
        created = datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(timespec="seconds")
        items.append({"id": path.name, "fileName": path.name, "reason": reason,
                      "createdAt": created, "size": stat.st_size})
    items.sort(key=lambda item: item["createdAt"], reverse=True)
    return items


def notify_backups_changed():
    return list_backups()


def create_backup(reason="manual"):
    reason = reason if reason in ("manual", "auto", "pre-restore") else "manual"
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = BACKUP_DIR / f"kewu_{stamp}_{reason}.db"
    if path.exists():
        path = BACKUP_DIR / f"kewu_{stamp}_{reason}_{secrets.token_hex(2)}.db"
    with DB_WRITE_LOCK:
        src = connect_db()
        dest = sqlite3.connect(str(path))
        try:
            src.backup(dest)
            dest.commit()
        finally:
            dest.close()
            src.close()
    backups = sorted(BACKUP_DIR.glob("kewu_*.db"), key=lambda item: item.stat().st_mtime, reverse=True)
    for old in backups[MAX_BACKUPS:]:
        try:
            old.unlink()
        except OSError:
            pass
    logger.info("创建备份: %s", path.name)
    if reason == "auto":
        conn = connect_db()
        try:
            conn.execute(
                "INSERT INTO app_settings(key, value) VALUES('last_auto_backup_at', ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (now_iso(),),
            )
            conn.commit()
        finally:
            conn.close()
    return {"id": path.name, "fileName": path.name, "reason": reason,
            "createdAt": datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat(timespec="seconds"),
            "size": path.stat().st_size}


def validate_backup_file(path):
    if not path.exists() or path.stat().st_size < 1024:
        raise ApiError(400, "备份文件无效。")
    try:
        conn = sqlite3.connect(str(path))
        try:
            check = conn.execute("PRAGMA quick_check").fetchone()
            if not check or check[0] != "ok":
                raise ApiError(400, "备份文件完整性检查失败。")
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
            if not {"users", "tasks", "categories", "app_settings"}.issubset(tables):
                raise ApiError(400, "该文件不是科务看板的数据库备份。")
            if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] < 1:
                raise ApiError(400, "备份文件中没有可用账号。")
        finally:
            conn.close()
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(400, "无法读取备份文件：" + str(exc))


def restore_backup_path(path):
    validate_backup_file(path)
    create_backup("pre-restore")
    with DB_WRITE_LOCK:
        conn = g.pop("db", None)
        if conn is not None:
            conn.close()
        src = sqlite3.connect(str(path))
        dest = sqlite3.connect(str(DB_PATH), timeout=15)
        try:
            src.backup(dest)
            dest.commit()
        finally:
            dest.close()
            src.close()
    # 让所有浏览器会话失效，避免恢复到旧账号后仍保留原登录状态。
    new_secret = secrets.token_hex(32)
    SECRET_PATH.write_text(new_secret, encoding="ascii")
    app.config["SECRET_KEY"] = new_secret
    logger.warning("数据库已从备份恢复: %s", path.name)
    return {"reload": True, "message": "数据已恢复，请重新登录。"}


def normalize_due_clock(due_date, due_time):
    return datetime.strptime(due_date + " " + normalize_time(due_time), "%Y-%m-%d %H:%M")


def period_key_for(cycle, value):
    if cycle == "weekly":
        start = value - timedelta(days=value.weekday())
        return start.isoformat()
    if cycle == "monthly":
        return value.strftime("%Y-%m")
    if cycle == "quarterly":
        return f"{value.year}-Q{((value.month - 1) // 3) + 1}"
    return value.isoformat()


def current_due_for_template(cycle, anchor_due, today):
    try:
        anchor = date.fromisoformat(anchor_due)
    except Exception:
        return today
    if cycle == "weekly":
        offset = anchor.weekday()
        monday = today - timedelta(days=today.weekday())
        return monday + timedelta(days=offset)
    if cycle == "monthly":
        last_day = calendar.monthrange(today.year, today.month)[1]
        return date(today.year, today.month, min(anchor.day, last_day))
    if cycle == "quarterly":
        q_start_month = ((today.month - 1) // 3) * 3 + 1
        month_offset = (anchor.month - 1) % 3
        month = q_start_month + month_offset
        last_day = calendar.monthrange(today.year, month)[1]
        return date(today.year, month, min(anchor.day, last_day))
    return today


def next_task_code(conn):
    year = date.today().year
    prefix = f"RW-{year}-"
    max_num = 0
    for row in conn.execute("SELECT code FROM tasks WHERE code LIKE ?", (prefix + "%",)).fetchall():
        try:
            max_num = max(max_num, int(str(row["code"])[len(prefix):]))
        except Exception:
            continue
    return prefix + f"{max_num + 1:03d}"


def insert_event(conn, task_id, actor_id, action, note=""):
    conn.execute(
        "INSERT INTO task_events(id, task_id, actor_id, action, note, created_at) VALUES(?,?,?,?,?,?)",
        (new_id("ev"), task_id, actor_id, action, note, now_iso()),
    )


def insert_task_row(conn, *, title, description, category_row, assignee_id, creator_id,
                    due_date, due_time, task_type, template_id=None, period_key=None, source="科室自定"):
    task_id = new_id("t")
    created = now_iso()
    code = next_task_code(conn)
    conn.execute(
        "INSERT INTO tasks(id, code, template_id, period_key, title, description, category_id, source, type, assignee_id, creator_id, status, due_date, due_time, version, created_at, updated_at) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (task_id, code, template_id, period_key, title, description, category_row["id"], source, task_type,
         assignee_id, creator_id, "pending", due_date, normalize_time(due_time), 1, created, created),
    )
    insert_event(conn, task_id, creator_id, "created", "创建了任务")
    return task_id


def generate_recurring():
    generated = 0
    with DB_WRITE_LOCK:
        conn = connect_db()
        try:
            conn.execute("BEGIN IMMEDIATE")
            templates = conn.execute("SELECT * FROM templates WHERE active = 1 ORDER BY created_at").fetchall()
            for template in templates:
                anchor = valid_iso_date(template["anchor_due"])
                if not anchor:
                    continue
                today = date.today()
                if period_key_for(template["cycle"], today) < period_key_for(template["cycle"], anchor):
                    continue
                due = current_due_for_template(template["cycle"], template["anchor_due"], today)
                key = period_key_for(template["cycle"], due)
                exists = conn.execute(
                    "SELECT 1 FROM tasks WHERE template_id = ? AND period_key = ?",
                    (template["id"], key),
                ).fetchone()
                if exists:
                    continue
                category = conn.execute("SELECT * FROM categories WHERE id = ?", (template["category_id"],)).fetchone()
                if not category:
                    continue
                insert_task_row(
                    conn,
                    title=template["title"], description=template["description"], category_row=category,
                    assignee_id=template["assignee_id"], creator_id=template["created_by"],
                    due_date=due.isoformat(), due_time=template["due_time"], task_type="recurring",
                    template_id=template["id"], period_key=key, source=template["source"] or "科室自定",
                )
                generated += 1
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    if generated:
        logger.info("已生成本期周期任务 %s 项", generated)
    return generated


def auto_backup_loop():
    while True:
        try:
            with app.app_context():
                enabled = get_setting_bool("auto_backup_enabled", True)
                interval_hours = int(setting_get("backup_interval_hours", "24") or 24)
                if enabled:
                    last = setting_get("last_auto_backup_at", "")
                    last_dt = None
                    if last:
                        try:
                            last_dt = datetime.fromisoformat(last)
                        except Exception:
                            last_dt = None
                    if last_dt is None or (datetime.now().astimezone() - last_dt).total_seconds() >= interval_hours * 3600:
                        create_backup("auto")
        except Exception as exc:
            logger.exception("自动备份失败: %s", exc)
        time.sleep(60)


def recurring_loop():
    while True:
        try:
            generate_recurring()
        except Exception as exc:
            logger.exception("周期任务生成失败: %s", exc)
        time.sleep(60)


def backup_file_by_id(backup_id):
    name = Path(str(backup_id)).name
    if not re.match(r"^kewu_\d{8}-\d{6}_(manual|auto|pre-restore)(_[0-9a-f]+)?\.db$", name):
        raise ApiError(400, "备份文件名称无效。")
    path = BACKUP_DIR / name
    if not path.exists():
        raise ApiError(404, "备份文件不存在。")
    return path


LOGIN_HTML = r"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>登录 · 科务看板 1.0</title>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/styles.css">
<style>
  body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font-family:var(--font);}
  .login-page{min-height:100vh;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(380px,.85fr);}
  .login-brand{position:relative;display:flex;flex-direction:column;justify-content:space-between;padding:44px 54px;background:linear-gradient(155deg,var(--sidebar-deep),var(--sidebar) 65%,#1e5a4b);color:var(--sidebar-text);overflow:hidden;}
  .login-brand:after{content:"";position:absolute;width:480px;height:480px;right:-190px;bottom:-170px;border-radius:50%;border:1px solid rgba(255,255,255,.1);box-shadow:0 0 0 55px rgba(255,255,255,.025),0 0 0 110px rgba(255,255,255,.018);}
  .login-brand-top{display:flex;align-items:center;gap:12px}
  .login-mark{width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.2);display:grid;place-items:center}
  .login-mark svg{width:24px;height:24px}
  .login-brand h1{margin:0;font-size:19px;letter-spacing:.06em}
  .login-brand small{display:block;margin-top:3px;color:var(--sidebar-muted);font-size:11px;letter-spacing:.1em}
  .login-brand-copy{position:relative;z-index:1;max-width:500px}
  .login-brand-copy h2{margin:0 0 14px;font-size:34px;line-height:1.3;font-weight:600;letter-spacing:.02em}
  .login-brand-copy p{margin:0;color:var(--sidebar-muted);font-size:13px;line-height:1.9;max-width:420px}
  .login-brand-foot{color:var(--sidebar-muted);font-size:10px;position:relative;z-index:1}
  .login-form-wrap{display:flex;align-items:center;justify-content:center;padding:36px 28px;background:var(--surface)}
  .login-form{width:100%;max-width:350px}
  .login-form h2{margin:0;font-size:24px;color:var(--ink);font-weight:650}
  .login-form .sub{margin:7px 0 28px;color:var(--muted);font-size:12px;line-height:1.7}
  .login-field{margin-bottom:16px}
  .login-field label{display:block;margin-bottom:7px;color:var(--ink-soft);font-size:12px;font-weight:600}
  .login-field input{width:100%;height:44px;padding:0 13px;border:1px solid var(--line-strong);border-radius:9px;background:var(--surface-soft);color:var(--ink);font:inherit;font-size:13px;outline:none;transition:border-color .15s,box-shadow .15s}
  .login-field input:focus{border-color:var(--primary);background:#fff;box-shadow:0 0 0 3px var(--focus-soft)}
  .login-submit{width:100%;height:44px;border:0;border-radius:9px;background:var(--primary);color:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer;box-shadow:var(--primary-shadow);margin-top:6px}
  .login-submit:hover{background:var(--primary-hover)}
  .login-submit:disabled{opacity:.6;cursor:wait}
  .login-error{min-height:20px;margin:0 0 8px;color:var(--danger);font-size:11px}
  .login-hint{margin-top:20px;padding:11px 12px;border-radius:8px;background:var(--surface-soft);color:var(--muted-light);font-size:10px;line-height:1.7}
  .login-hint strong{color:var(--muted)}
  @media(max-width:760px){.login-page{display:block}.login-brand{padding:28px 24px;min-height:180px}.login-brand-copy h2{font-size:26px;margin-bottom:8px}.login-brand-copy p{display:none}.login-brand-foot{display:none}.login-form-wrap{padding:34px 24px;min-height:calc(100vh - 180px);align-items:flex-start}}
</style>
</head>
<body>
<div class="login-page">
  <section class="login-brand">
    <div class="login-brand-top">
      <span class="login-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="16" height="17" rx="4"/><path d="M8 9h5M8 13h8M8 17h5"/><path d="m15.5 9 1.2 1.2 2.3-2.3"/></svg></span>
      <div><h1>科务看板</h1><small>开发区科 · 工作任务平台</small></div>
    </div>
    <div class="login-brand-copy">
      <h2>把每一项工作，<br>都落到人、落到时。</h2>
      <p>任务集中管理、责任清晰、进度可查。数据保存在本科室主机，局域网内成员通过浏览器访问。</p>
    </div>
    <div class="login-brand-foot">开发区科 · 内部工作平台 · v1.0</div>
  </section>
  <section class="login-form-wrap">
    <form class="login-form" id="login-form" autocomplete="on">
      <h2>登录工作台</h2>
      <p class="sub">请使用姓名和密码登录。首次登录会要求修改初始密码。</p>
      <div class="login-field"><label for="login-name">姓名</label><input id="login-name" name="name" type="text" autocomplete="username" maxlength="20" required autofocus placeholder="请输入姓名"></div>
      <div class="login-field"><label for="login-password">密码</label><input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="请输入密码"></div>
      <p class="login-error" id="login-error"></p>
      <button class="login-submit" id="login-submit" type="submit">登 录</button>
      <div class="login-hint"><strong>首次使用：</strong>初始密码见部署说明；登录后会强制修改。忘记密码请联系科长或主任科员重置。</div>
    </form>
  </section>
</div>
<script>
const form=document.getElementById('login-form'),err=document.getElementById('login-error'),btn=document.getElementById('login-submit');
form.addEventListener('submit',async function(e){
  e.preventDefault(); err.textContent=''; btn.disabled=true; btn.textContent='登录中…';
  try{
    const res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('login-name').value,password:document.getElementById('login-password').value})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok){ err.textContent=data.error||'登录失败，请重试。'; return; }
    location.href=data.mustChangePassword?'/change-password':'/';
  }catch(ex){ err.textContent='无法连接服务器，请确认主机已启动。'; }
  finally{ btn.disabled=false; btn.textContent='登 录'; }
});
</script>
</body>
</html>"""


CHANGE_HTML = r"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>修改密码 · 科务看板 1.0</title>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/styles.css">
<meta name="csrf-token" content="{{ csrf }}">
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--ink);font-family:var(--font);padding:24px}
  .account-card{width:100%;max-width:430px;padding:30px;border:1px solid var(--line);border-radius:18px;background:var(--surface);box-shadow:var(--shadow-md)}
  .account-head{display:flex;align-items:center;gap:11px;margin-bottom:22px}
  .account-mark{width:38px;height:38px;border-radius:10px;background:var(--primary-soft);color:var(--primary);display:grid;place-items:center}
  .account-head h1{margin:0;font-size:18px}.account-head p{margin:3px 0 0;color:var(--muted-light);font-size:10px}
  .account-field{margin-bottom:14px}.account-field label{display:block;margin-bottom:6px;color:var(--ink-soft);font-size:11px;font-weight:600}
  .account-field input{width:100%;height:42px;padding:0 12px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface-soft);font:inherit;font-size:13px;outline:none}
  .account-field input:focus{border-color:var(--primary);background:#fff;box-shadow:0 0 0 3px var(--focus-soft)}
  .account-error{min-height:20px;color:var(--danger);font-size:11px;margin:0 0 6px}
  .account-submit{width:100%;height:42px;border:0;border-radius:8px;background:var(--primary);color:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer;margin-top:4px}
  .account-submit:disabled{opacity:.6}
  .account-note{margin-top:15px;color:var(--muted-light);font-size:10px;line-height:1.7}
</style>
</head>
<body>
<div class="account-card">
  <div class="account-head">
    <span class="account-mark"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>
    <div><h1>修改登录密码</h1><p>首次登录必须修改初始密码</p></div>
  </div>
  <form id="password-form">
    <div class="account-field"><label for="old-password">当前密码</label><input id="old-password" type="password" autocomplete="current-password" required autofocus></div>
    <div class="account-field"><label for="new-password">新密码</label><input id="new-password" type="password" autocomplete="new-password" minlength="8" required placeholder="至少 8 位，含字母和数字"></div>
    <div class="account-field"><label for="confirm-password">确认新密码</label><input id="confirm-password" type="password" autocomplete="new-password" minlength="8" required></div>
    <p class="account-error" id="password-error"></p>
    <button class="account-submit" id="password-submit" type="submit">保存新密码并进入工作台</button>
    <p class="account-note">密码由本人保管。忘记密码请联系科长或主任科员在系统设置中重置。</p>
  </form>
</div>
<script>
const form=document.getElementById('password-form'),err=document.getElementById('password-error'),btn=document.getElementById('password-submit');
form.addEventListener('submit',async function(e){
  e.preventDefault(); err.textContent='';
  const oldPassword=document.getElementById('old-password').value,newPassword=document.getElementById('new-password').value,confirm=document.getElementById('confirm-password').value;
  if(newPassword!==confirm){err.textContent='两次输入的新密码不一致。';return;}
  btn.disabled=true; btn.textContent='保存中…';
  try{
    const res=await fetch('/api/account/password',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':document.querySelector('meta[name=csrf-token]').content},body:JSON.stringify({currentPassword:oldPassword,newPassword:newPassword})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok){err.textContent=data.error||'修改失败。';return;}
    location.href='/';
  }catch(ex){err.textContent='无法连接服务器，请稍后重试。';}
  finally{btn.disabled=false;btn.textContent='保存新密码并进入工作台';}
});
</script>
</body>
</html>"""


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "version": APP_VERSION, "time": now_iso()})


@app.route("/api/login", methods=["POST"])
def login():
    if login_rate_limited():
        raise ApiError(429, "尝试次数过多，请十分钟后再试。")
    data = json_body()
    name = str(data.get("name") or "").strip()
    password = str(data.get("password") or "")
    if not name or not password:
        raise ApiError(400, "请输入姓名和密码。")
    row = db().execute("SELECT * FROM users WHERE name = ? COLLATE NOCASE", (name,)).fetchone()
    if not row or not row["active"] or not verify_password(password, row["password_hash"]):
        record_login_failure()
        raise ApiError(401, "姓名或密码不正确。")
    clear_login_failures()
    session.clear()
    session.permanent = True
    session["uid"] = row["id"]
    session["pv"] = password_fingerprint(row["password_hash"])
    session["csrf"] = secrets.token_urlsafe(32)
    logger.info("登录成功: %s (%s)", row["name"], request.remote_addr)
    return jsonify({"ok": True, "mustChangePassword": bool(row["must_change_password"]), "name": row["name"], "role": row["role"]})


@app.route("/api/logout", methods=["POST"])
def logout():
    name = (current_user() or {}).get("name", "")
    session.clear()
    logger.info("退出登录: %s", name)
    return jsonify({"ok": True})


@app.route("/api/account/password", methods=["POST"])
def change_password():
    user = current_user()
    if not user:
        raise ApiError(401, "登录已失效，请重新登录。")
    data = json_body()
    old_password = str(data.get("currentPassword") or "")
    new_password = str(data.get("newPassword") or "")
    row = db().execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    if not row or not verify_password(old_password, row["password_hash"]):
        raise ApiError(400, "当前密码不正确。")
    problem = password_problem(new_password)
    if problem:
        raise ApiError(400, problem)
    if verify_password(new_password, row["password_hash"]):
        raise ApiError(400, "新密码不能与当前密码相同。")
    new_hash = hash_password(new_password)
    with transaction() as conn:
        conn.execute("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?",
                     (new_hash, now_iso(), user["id"]))
    session["pv"] = password_fingerprint(new_hash)
    session["csrf"] = secrets.token_urlsafe(32)
    logger.info("修改密码: %s", user["name"])
    return jsonify({"ok": True, "csrfToken": session["csrf"]})


@app.route("/api/state")
def state_api():
    user = current_user()
    if not user:
        raise ApiError(401, "登录已失效，请重新登录。")
    return jsonify({
        "state": serialize_state(user),
        "backups": list_backups(),
        "csrfToken": session_csrf(),
        "serverTime": now_iso(),
    })


@app.route("/api/tasks", methods=["POST"])
def create_task():
    user = current_user()
    manager = is_manager(user)
    data = json_body()
    title = text_field(data, "title", "任务名称", max_length=80)
    description = str(data.get("description") or "").strip()
    if len(description) > 800:
        raise ApiError(400, "任务说明内容过长。")
    category_name = str(data.get("category") or "").strip()
    due_date_raw = str(data.get("dueDate") or "").strip()
    due = valid_iso_date(due_date_raw)
    if not due:
        raise ApiError(400, "请选择有效的截止日期。")
    due_time = normalize_time(data.get("dueTime"))
    category = db().execute("SELECT * FROM categories WHERE name = ? COLLATE NOCASE", (category_name,)).fetchone()
    if not category or not category["active"]:
        raise ApiError(400, "请选择一个启用中的工作分类。")
    source = str(data.get("source") or "科室自定").strip()
    if source not in TASK_SOURCES:
        raise ApiError(400, "请选择有效的任务来源。")
    assignee_id = str(data.get("assigneeId") or "")
    if not manager:
        if data.get("type") == "recurring":
            raise ApiError(403, "普通成员只能创建一次性任务。")
        assignee_id = user["id"]
        task_type = "one-time"
    else:
        task_type = "recurring" if data.get("type") == "recurring" else "one-time"
    assignee = db().execute("SELECT * FROM users WHERE id = ? AND active = 1", (assignee_id,)).fetchone()
    if not assignee:
        raise ApiError(400, "请选择有效的责任人。")
    cycle = str(data.get("cycle") or "weekly")
    if task_type == "recurring" and cycle not in ("weekly", "monthly", "quarterly"):
        raise ApiError(400, "周期类型不正确。")
    if task_type == "recurring" and normalize_due_clock(due.isoformat(), due_time) < datetime.now():
        raise ApiError(400, "周期任务的本期截止日期和时间不能早于当前时间。")
    with transaction() as conn:
        template_id = None
        period_key = None
        if task_type == "recurring":
            template_id = new_id("s")
            created = now_iso()
            conn.execute(
                "INSERT INTO templates(id, title, description, category_id, source, assignee_id, cycle, anchor_due, due_time, active, created_by, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (template_id, title, description, category["id"], source, assignee_id, cycle, due.isoformat(), due_time, 1, user["id"], created, created),
            )
            period_key = period_key_for(cycle, due)
        task_id = insert_task_row(
            conn, title=title, description=description, category_row=category,
            assignee_id=assignee_id, creator_id=user["id"], due_date=due.isoformat(),
            due_time=due_time, task_type=task_type, template_id=template_id, period_key=period_key, source=source,
        )
    logger.info("创建任务: %s by %s", title, user["name"])
    return jsonify({"ok": True, "id": task_id, "state": serialize_state(current_user())})


@app.route("/api/tasks/<task_id>", methods=["PUT"])
def update_task(task_id):
    user = current_user()
    manager = is_manager(user)
    data = json_body()
    title = text_field(data, "title", "任务名称", max_length=80)
    description = str(data.get("description") or "").strip()
    if len(description) > 800:
        raise ApiError(400, "任务说明内容过长。")
    category_name = str(data.get("category") or "").strip()
    due_date_raw = str(data.get("dueDate") or "").strip()
    due = valid_iso_date(due_date_raw)
    if not due:
        raise ApiError(400, "请选择有效的截止日期。")
    due_time = normalize_time(data.get("dueTime"))
    version = data.get("version")
    expected_version = int(version) if str(version or "").isdigit() else None
    with transaction() as conn:
        task = task_by_id(conn, task_id)
        if not task:
            raise ApiError(404, "任务不存在。")
        if task["status"] == "completed":
            raise ApiError(409, "已办结任务不能修改。")
        if not manager:
            if task["creator_id"] != user["id"] or task["assignee_id"] != user["id"] or task["status"] not in ("pending", "in_progress"):
                raise ApiError(403, "只能编辑自己创建且本人负责的未办结任务。")
        source = str(data.get("source") or task["source"] or "科室自定").strip()
        if source not in TASK_SOURCES:
            raise ApiError(400, "请选择有效的任务来源。")
        category = conn.execute("SELECT * FROM categories WHERE name = ? COLLATE NOCASE", (category_name,)).fetchone()
        if not category:
            raise ApiError(400, "工作分类不存在。")
        if category["id"] != task["category_id"] and not category["active"]:
            raise ApiError(400, "不能将任务修改为已停用的分类。")
        assignee_id = task["assignee_id"]
        if manager:
            requested = str(data.get("assigneeId") or task["assignee_id"])
            if requested != task["assignee_id"]:
                if task["status"] == "review":
                    raise ApiError(409, "待审核任务不能直接调整责任人，请先退回办理。")
                assignee = conn.execute("SELECT * FROM users WHERE id = ? AND active = 1", (requested,)).fetchone()
                if not assignee:
                    raise ApiError(400, "请选择有效的责任人。")
                assignee_id = requested
        changes = []
        if task["title"] != title: changes.append("任务名称")
        if task["category_id"] != category["id"]: changes.append("工作分类")
        if (task["source"] or "科室自定") != source: changes.append("任务来源")
        if task["description"] != description: changes.append("任务说明")
        if task["due_date"] != due.isoformat(): changes.append("截止日期")
        if normalize_time(task["due_time"]) != due_time: changes.append("截止时间")
        if task["assignee_id"] != assignee_id: changes.append("责任人")
        if not changes:
            return jsonify({"ok": True, "state": serialize_state(current_user())})
        if expected_version is not None and task["version"] != expected_version:
            raise ApiError(409, "任务已被其他人修改，请刷新后重试。")
        action = "reassigned" if task["assignee_id"] != assignee_id else "updated"
        cursor = conn.execute(
            "UPDATE tasks SET title=?, description=?, category_id=?, source=?, assignee_id=?, due_date=?, due_time=?, version=version+1, updated_at=? WHERE id=? AND version=?",
            (title, description, category["id"], source, assignee_id, due.isoformat(), due_time, now_iso(), task_id, task["version"]),
        )
        if cursor.rowcount != 1:
            raise ApiError(409, "任务已被其他人修改，请刷新后重试。")
        insert_event(conn, task_id, user["id"], action, "更新了" + "、".join(changes))
    return jsonify({"ok": True, "id": task_id, "state": serialize_state(current_user())})


def transition_guard(task, user, allowed_status, assignee_only=False, manager_only=False):
    if not task:
        raise ApiError(404, "任务不存在。")
    if task["status"] != allowed_status:
        raise ApiError(409, "任务状态已变化，请刷新后重试。")
    if assignee_only and task["assignee_id"] != user["id"]:
        raise ApiError(403, "只有任务责任人可以执行此操作。")
    if manager_only and not is_manager(user):
        raise ApiError(403, "只有科长或主任科员可以审核。")


def version_ok(row, data):
    version = data.get("version")
    if version is None or str(version) == "":
        return True
    try:
        return row["version"] == int(version)
    except Exception:
        return False


@app.route("/api/tasks/<task_id>/start", methods=["POST"])
def start_task(task_id):
    user = current_user()
    data = json_body()
    with transaction() as conn:
        task = task_by_id(conn, task_id)
        transition_guard(task, user, "pending", assignee_only=True)
        if not version_ok(task, data):
            raise ApiError(409, "任务已被其他人修改，请刷新后重试。")
        now = now_iso()
        conn.execute("UPDATE tasks SET status='in_progress', started_at=?, updated_at=?, version=version+1 WHERE id=? AND version=?",
                     (now, now, task_id, task["version"]))
        insert_event(conn, task_id, user["id"], "started", "开始办理")
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/tasks/<task_id>/withdraw", methods=["POST"])
def withdraw_task(task_id):
    user = current_user()
    data = json_body()
    with transaction() as conn:
        task = task_by_id(conn, task_id)
        transition_guard(task, user, "review", assignee_only=True)
        if not version_ok(task, data):
            raise ApiError(409, "任务已被其他人修改，请刷新后重试。")
        now = now_iso()
        conn.execute("UPDATE tasks SET status='in_progress', submitted_at=NULL, updated_at=?, version=version+1 WHERE id=? AND version=?",
                     (now, task_id, task["version"]))
        insert_event(conn, task_id, user["id"], "withdrawn", "撤回审核，继续办理")
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/tasks/<task_id>/progress", methods=["POST"])
def add_progress(task_id):
    user = current_user()
    data = json_body()
    content = text_field(data, "content", "本次进展", max_length=1000)
    with transaction() as conn:
        task = task_by_id(conn, task_id)
        transition_guard(task, user, "in_progress", assignee_only=True)
        if not version_ok(task, data):
            raise ApiError(409, "任务已被其他人修改，请刷新后重试。")
        now = now_iso()
        conn.execute("INSERT INTO task_progress(id, task_id, actor_id, kind, content, created_at) VALUES(?,?,?,?,?,?)",
                     (new_id("pg"), task_id, user["id"], "update", content, now))
        conn.execute("UPDATE tasks SET updated_at=?, version=version+1 WHERE id=? AND version=?",
                     (now, task_id, task["version"]))
        insert_event(conn, task_id, user["id"], "progress", "更新了任务进展")
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/tasks/<task_id>/submit", methods=["POST"])
def submit_task(task_id):
    user = current_user()
    data = json_body()
    note = text_field(data, "note", "办理结果", max_length=800)
    with transaction() as conn:
        task = task_by_id(conn, task_id)
        transition_guard(task, user, "in_progress", assignee_only=True)
        if not version_ok(task, data):
            raise ApiError(409, "任务已被其他人修改，请刷新后重试。")
        now = now_iso()
        conn.execute("UPDATE tasks SET status='review', submitted_at=?, updated_at=?, version=version+1 WHERE id=? AND version=?",
                     (now, now, task_id, task["version"]))
        conn.execute("INSERT INTO task_progress(id, task_id, actor_id, kind, content, created_at) VALUES(?,?,?,?,?,?)",
                     (new_id("pg"), task_id, user["id"], "result", note, now))
        insert_event(conn, task_id, user["id"], "submitted", "提交审核")
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/tasks/<task_id>/approve", methods=["POST"])
def approve_task(task_id):
    user = current_user()
    data = json_body()
    require_manager()
    note = str(data.get("note") or "").strip()[:800]
    with transaction() as conn:
        task = task_by_id(conn, task_id)
        transition_guard(task, user, "review", manager_only=True)
        if not version_ok(task, data):
            raise ApiError(409, "任务已被其他人修改，请刷新后重试。")
        now = now_iso()
        conn.execute("UPDATE tasks SET status='completed', completed_at=?, reviewed_at=?, reviewer_id=?, review_note=?, updated_at=?, version=version+1 WHERE id=? AND version=?",
                     (now, now, user["id"], note or "审核通过", now, task_id, task["version"]))
        insert_event(conn, task_id, user["id"], "approved", note or "审核通过，任务办结")
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/tasks/<task_id>/reject", methods=["POST"])
def reject_task(task_id):
    user = current_user()
    data = json_body()
    require_manager()
    note = text_field(data, "note", "退回意见", max_length=800)
    with transaction() as conn:
        task = task_by_id(conn, task_id)
        transition_guard(task, user, "review", manager_only=True)
        if not version_ok(task, data):
            raise ApiError(409, "任务已被其他人修改，请刷新后重试。")
        now = now_iso()
        conn.execute("UPDATE tasks SET status='in_progress', submitted_at=NULL, reviewed_at=?, reviewer_id=?, review_note=?, rejection_count=rejection_count+1, updated_at=?, version=version+1 WHERE id=? AND version=?",
                     (now, user["id"], note, now, task_id, task["version"]))
        insert_event(conn, task_id, user["id"], "rejected", note)
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/tasks/bulk-delete", methods=["POST"])
def bulk_delete_tasks():
    user = current_user()
    require_manager()
    data = json_body()
    ids = data.get("ids")
    if not isinstance(ids, list) or not ids:
        raise ApiError(400, "请选择要删除的任务。")
    ids = [str(item) for item in ids if item][:200]
    if not ids:
        raise ApiError(400, "请选择要删除的任务。")
    now = now_iso()
    placeholders = ",".join("?" for _ in ids)
    with transaction() as conn:
        rows = conn.execute("SELECT id FROM tasks WHERE deleted_at IS NULL AND id IN (" + placeholders + ")", ids).fetchall()
        if not rows:
            raise ApiError(404, "没有可删除的任务。")
        conn.execute("UPDATE tasks SET deleted_at=?, deleted_by=?, version=version+1, updated_at=? WHERE id IN (" + placeholders + ")",
                     [now, user["id"], now] + ids)
        for row in rows:
            insert_event(conn, row["id"], user["id"], "deleted", "移入回收站")
    logger.info("删除任务 %s 项 by %s", len(rows), user["name"])
    return jsonify({"ok": True, "count": len(rows), "state": serialize_state(current_user())})


@app.route("/api/tasks/<task_id>", methods=["DELETE"])
def delete_task(task_id):
    user = current_user()
    require_manager()
    now = now_iso()
    with transaction() as conn:
        task = task_by_id(conn, task_id)
        if not task:
            raise ApiError(404, "任务不存在。")
        conn.execute("UPDATE tasks SET deleted_at=?, deleted_by=?, version=version+1, updated_at=? WHERE id=?",
                     (now, user["id"], now, task_id))
        insert_event(conn, task_id, user["id"], "deleted", "移入回收站")
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/tasks/<task_id>/restore", methods=["POST"])
def restore_task(task_id):
    user = current_user()
    require_manager()
    with transaction() as conn:
        task = conn.execute("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NOT NULL", (task_id,)).fetchone()
        if not task:
            raise ApiError(404, "回收站中没有该任务。")
        conn.execute("UPDATE tasks SET deleted_at=NULL, deleted_by=NULL, version=version+1, updated_at=? WHERE id=?", (now_iso(), task_id))
        insert_event(conn, task_id, user["id"], "restored", "从回收站恢复")
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/tasks/<task_id>/purge", methods=["DELETE"])
def purge_task(task_id):
    require_manager()
    with transaction() as conn:
        task = conn.execute("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NOT NULL", (task_id,)).fetchone()
        if not task:
            raise ApiError(404, "回收站中没有该任务。")
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/tasks/recycle/empty", methods=["POST"])
def empty_recycle_bin():
    require_manager()
    with transaction() as conn:
        conn.execute("DELETE FROM tasks WHERE deleted_at IS NOT NULL")
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/people", methods=["POST"])
def create_person():
    require_manager()
    data = json_body()
    name = text_field(data, "name", "姓名", max_length=20)
    title = str(data.get("title") or "科员").strip()[:30] or "科员"
    role = "manager" if data.get("role") == "manager" else "staff"
    tones = ["green", "blue", "amber", "purple", "rose"]
    with transaction() as conn:
        count = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
        try:
            conn.execute(
                "INSERT INTO users(id, name, title, role, active, password_hash, must_change_password, avatar_tone, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (new_id("p"), name, title, role, 1, hash_password(INITIAL_PASSWORD), 1, tones[count % 5], now_iso(), now_iso()),
            )
        except sqlite3.IntegrityError:
            raise ApiError(409, "姓名已存在，请使用不同的姓名。")
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/people/<person_id>", methods=["PUT"])
def update_person(person_id):
    user = current_user()
    require_manager()
    data = json_body()
    name = text_field(data, "name", "姓名", max_length=20)
    title = str(data.get("title") or "科员").strip()[:30] or "科员"
    role = "manager" if data.get("role") == "manager" else "staff"
    with transaction() as conn:
        person = conn.execute("SELECT * FROM users WHERE id = ?", (person_id,)).fetchone()
        if not person:
            raise ApiError(404, "人员不存在。")
        if person_id == user["id"] and role != person["role"]:
            raise ApiError(400, "不能修改自己的权限。")
        if person["role"] == "manager" and person["active"] and role != "manager":
            managers = conn.execute("SELECT COUNT(*) AS n FROM users WHERE active=1 AND role='manager' AND id<>?", (person_id,)).fetchone()["n"]
            if managers < 1:
                raise ApiError(400, "至少保留一名在用管理成员。")
        try:
            conn.execute("UPDATE users SET name=?, title=?, role=?, updated_at=? WHERE id=?",
                         (name, title, role, now_iso(), person_id))
        except sqlite3.IntegrityError:
            raise ApiError(409, "姓名已存在，请使用不同的姓名。")
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/people/<person_id>/toggle", methods=["POST"])
def toggle_person(person_id):
    current = current_user()
    require_manager()
    with transaction() as conn:
        person = conn.execute("SELECT * FROM users WHERE id = ?", (person_id,)).fetchone()
        if not person:
            raise ApiError(404, "人员不存在。")
        if person["active"]:
            if person_id == current["id"]:
                raise ApiError(400, "不能停用当前登录成员。")
            if person["role"] == "manager":
                managers = conn.execute("SELECT COUNT(*) AS n FROM users WHERE active=1 AND role='manager' AND id<>?", (person_id,)).fetchone()["n"]
                if managers < 1:
                    raise ApiError(400, "至少保留一名在用管理成员。")
            open_count = conn.execute("SELECT COUNT(*) AS n FROM tasks WHERE assignee_id=? AND status<>'completed'", (person_id,)).fetchone()["n"]
            if open_count:
                raise ApiError(409, f"{person['name']} 还有 {open_count} 项未办结任务，请先调整责任人。")
            conn.execute("UPDATE users SET active=0, updated_at=? WHERE id=?", (now_iso(), person_id))
        else:
            conn.execute("UPDATE users SET active=1, updated_at=? WHERE id=?", (now_iso(), person_id))
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/people/<person_id>/reset-password", methods=["POST"])
def reset_password(person_id):
    require_manager()
    with transaction() as conn:
        person = conn.execute("SELECT * FROM users WHERE id = ?", (person_id,)).fetchone()
        if not person:
            raise ApiError(404, "人员不存在。")
        digits = "23456789"
        letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
        temp = "Kw@" + "".join(secrets.choice(letters) for _ in range(3)) + "".join(secrets.choice(digits) for _ in range(3))
        conn.execute("UPDATE users SET password_hash=?, must_change_password=1, updated_at=? WHERE id=?",
                     (hash_password(temp), now_iso(), person_id))
    logger.warning("管理员重置密码: %s", person["name"])
    return jsonify({"ok": True, "temporaryPassword": temp})


@app.route("/api/categories", methods=["POST"])
def create_category():
    require_manager()
    data = json_body()
    name = text_field(data, "name", "分类名称", max_length=20)
    with transaction() as conn:
        count = conn.execute("SELECT COUNT(*) AS n FROM categories").fetchone()["n"]
        try:
            conn.execute("INSERT INTO categories(id, name, tone, active, sort_order, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
                         (new_id("cat"), name, count % 5, 1, count, now_iso(), now_iso()))
        except sqlite3.IntegrityError:
            raise ApiError(409, "分类名称已存在。")
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/categories", methods=["PUT"])
def rename_category():
    require_manager()
    data = json_body()
    old_name = text_field(data, "oldName", "原分类名称", max_length=20)
    new_name = text_field(data, "name", "分类名称", max_length=20)
    with transaction() as conn:
        category = conn.execute("SELECT * FROM categories WHERE name = ? COLLATE NOCASE", (old_name,)).fetchone()
        if not category:
            raise ApiError(404, "分类不存在。")
        try:
            conn.execute("UPDATE categories SET name=?, updated_at=? WHERE id=?", (new_name, now_iso(), category["id"]))
        except sqlite3.IntegrityError:
            raise ApiError(409, "分类名称已存在。")
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/categories/toggle", methods=["POST"])
def toggle_category():
    require_manager()
    data = json_body()
    name = text_field(data, "name", "分类名称", max_length=20)
    with transaction() as conn:
        category = conn.execute("SELECT * FROM categories WHERE name = ? COLLATE NOCASE", (name,)).fetchone()
        if not category:
            raise ApiError(404, "分类不存在。")
        if category["active"]:
            active = conn.execute("SELECT COUNT(*) AS n FROM categories WHERE active=1").fetchone()["n"]
            if active <= 1:
                raise ApiError(400, "至少保留一个启用中的工作分类。")
            conn.execute("UPDATE categories SET active=0, updated_at=? WHERE id=?", (now_iso(), category["id"]))
        else:
            conn.execute("UPDATE categories SET active=1, updated_at=? WHERE id=?", (now_iso(), category["id"]))
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/categories", methods=["DELETE"])
def delete_category():
    require_manager()
    data = json_body()
    name = text_field(data, "name", "分类名称", max_length=20)
    target_name = str(data.get("targetCategory") or "").strip()
    with transaction() as conn:
        category = conn.execute("SELECT * FROM categories WHERE name = ? COLLATE NOCASE", (name,)).fetchone()
        if not category:
            raise ApiError(404, "分类不存在。")
        task_count = conn.execute("SELECT COUNT(*) AS n FROM tasks WHERE category_id=?", (category["id"],)).fetchone()["n"]
        template_count = conn.execute("SELECT COUNT(*) AS n FROM templates WHERE category_id=?", (category["id"],)).fetchone()["n"]
        used = task_count + template_count > 0
        target = None
        if used:
            if not target_name:
                raise ApiError(400, "该分类仍在使用，请选择转入分类。")
            target = conn.execute("SELECT * FROM categories WHERE name = ? COLLATE NOCASE AND active=1", (target_name,)).fetchone()
            if not target or target["id"] == category["id"]:
                raise ApiError(400, "请选择另一个启用中的分类接收关联记录。")
            conn.execute("UPDATE tasks SET category_id=?, updated_at=? WHERE category_id=?", (target["id"], now_iso(), category["id"]))
            conn.execute("UPDATE templates SET category_id=?, updated_at=? WHERE category_id=?", (target["id"], now_iso(), category["id"]))
        if category["active"]:
            active = conn.execute("SELECT COUNT(*) AS n FROM categories WHERE active=1 AND id<>?", (category["id"],)).fetchone()["n"]
            if active < 1:
                raise ApiError(400, "至少保留一个启用中的工作分类。")
        conn.execute("DELETE FROM categories WHERE id=?", (category["id"],))
    return jsonify({"ok": True, "targetCategory": target["name"] if used else "", "state": serialize_state(current_user())})


def calendar_payload(year):
    row = db().execute("SELECT * FROM calendar_years WHERE year = ?", (year,)).fetchone()
    if not row:
        return None
    try:
        days = json.loads(row["days_json"])
    except Exception:
        days = {}
    return {"year": row["year"], "days": days, "source": row["source"], "syncedAt": row["synced_at"]}


def save_calendar_year(year, payload, source):
    days = {}
    for item in payload.get("days", []):
        if not isinstance(item, dict):
            continue
        day = str(item.get("date") or "")
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", day):
            continue
        days[day] = {"name": str(item.get("name") or ""), "off": bool(item.get("isOffDay", True))}
    now = now_iso()
    with transaction() as conn:
        conn.execute(
            "INSERT INTO calendar_years(year, days_json, source, synced_at) VALUES(?,?,?,?) "
            "ON CONFLICT(year) DO UPDATE SET days_json=excluded.days_json, source=excluded.source, synced_at=excluded.synced_at",
            (year, json.dumps(days, ensure_ascii=False), source, now),
        )
    return {"year": year, "days": days, "source": source, "syncedAt": now}


@app.route("/api/calendar/sync", methods=["POST"])
def calendar_sync():
    require_manager()
    data = json_body()
    try:
        year = int(data.get("year") or date.today().year)
    except Exception:
        raise ApiError(400, "年份不正确。")
    if year < 2000 or year > 2100:
        raise ApiError(400, "年份不正确。")
    url = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/%d.json" % year
    try:
        req = Request(url, headers={"User-Agent": "KewuBoard/" + APP_VERSION})
        with urlopen(req, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise ApiError(502, "无法获取 %d 年节假日数据，请检查网络或导入 JSON 文件。" % year)
    if not isinstance(payload, dict) or not isinstance(payload.get("days"), list):
        raise ApiError(502, "节假日数据格式不正确。")
    calendar = save_calendar_year(year, payload, "holiday-cn 在线同步")
    logger.info("同步节假日: %s", year)
    return jsonify({"ok": True, "calendar": calendar, "state": serialize_state(current_user())})


@app.route("/api/calendar/import", methods=["POST"])
def calendar_import():
    require_manager()
    data = json_body()
    try:
        year = int(data.get("year") or date.today().year)
    except Exception:
        raise ApiError(400, "年份不正确。")
    payload = data.get("payload")
    if not isinstance(payload, dict) or not isinstance(payload.get("days"), list):
        raise ApiError(400, "文件中缺少节假日 days 数据。")
    calendar = save_calendar_year(year, payload, "手动导入")
    return jsonify({"ok": True, "calendar": calendar, "state": serialize_state(current_user())})


@app.route("/api/templates/<template_id>/toggle", methods=["POST"])
def toggle_template(template_id):
    require_manager()
    with transaction() as conn:
        template = conn.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
        if not template:
            raise ApiError(404, "周期规则不存在。")
        conn.execute("UPDATE templates SET active=?, updated_at=? WHERE id=?",
                     (0 if template["active"] else 1, now_iso(), template_id))
    if not template["active"]:
        generate_recurring()
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/settings", methods=["POST"])
def update_settings():
    require_manager()
    data = json_body()
    enabled = bool(data.get("autoBackupEnabled", True))
    try:
        interval = max(1, min(168, int(data.get("backupIntervalHours", 24))))
    except Exception:
        raise ApiError(400, "备份间隔不正确。")
    with transaction() as conn:
        conn.execute("INSERT INTO app_settings(key,value) VALUES('auto_backup_enabled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", ("1" if enabled else "0",))
        conn.execute("INSERT INTO app_settings(key,value) VALUES('backup_interval_hours',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(interval),))
    return jsonify({"ok": True, "state": serialize_state(current_user())})


@app.route("/api/backups", methods=["GET"])
def backups_list():
    require_manager()
    return jsonify({"backups": list_backups()})


@app.route("/api/backups", methods=["POST"])
def backups_create():
    require_manager()
    backup = create_backup("manual")
    return jsonify({"ok": True, "backup": backup, "backups": list_backups()})


@app.route("/api/backups/<backup_id>", methods=["GET"])
def backups_download(backup_id):
    require_manager()
    path = backup_file_by_id(backup_id)
    return send_file(str(path), as_attachment=True, download_name=path.name, mimetype="application/octet-stream")


@app.route("/api/backups/<backup_id>/restore", methods=["POST"])
def backups_restore(backup_id):
    require_manager()
    path = backup_file_by_id(backup_id)
    result = restore_backup_path(path)
    session.clear()
    return jsonify(result)


@app.route("/api/backups/upload", methods=["POST"])
def backups_upload():
    require_manager()
    upload = request.files.get("file")
    if not upload:
        raise ApiError(400, "请选择备份文件。")
    if not upload.filename.lower().endswith(".db"):
        raise ApiError(400, "请选择科务看板导出的 .db 备份文件。")
    temp = DATA_DIR / ("upload_" + secrets.token_hex(8) + ".db")
    try:
        upload.save(str(temp))
        result = restore_backup_path(temp)
        session.clear()
        return jsonify(result)
    finally:
        try:
            temp.unlink()
        except OSError:
            pass


@app.route("/api/export")
def export_data():
    # 供调试/运维使用的 JSON 快照；日常 Excel 导出仍由浏览器生成。
    require_manager()
    user = current_user()
    return jsonify(serialize_state(user))


@app.route("/")
def index_page():
    user = current_user()
    if not user:
        return redirect("/login")
    if user.get("mustChangePassword"):
        return redirect("/change-password")
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/login")
def login_page():
    user = current_user()
    if user and not user.get("mustChangePassword"):
        return redirect("/")
    if user and user.get("mustChangePassword"):
        return redirect("/change-password")
    return render_template_string(LOGIN_HTML)


@app.route("/change-password")
def change_password_page():
    user = current_user()
    if not user:
        return redirect("/login")
    return render_template_string(CHANGE_HTML, csrf=session_csrf())


@app.route("/assets/<path:filename>")
def static_assets(filename):
    return send_from_directory(STATIC_DIR / "assets", filename)


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(STATIC_DIR / "assets", "favicon.svg")


def lan_addresses():
    addresses = []
    try:
        hostname = socket.gethostname()
        for item in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = item[4][0]
            if ip not in addresses and not ip.startswith("127."):
                addresses.append(ip)
    except Exception:
        pass
    if not addresses:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.connect(("8.8.8.8", 80))
            addresses.append(sock.getsockname()[0])
            sock.close()
        except Exception:
            pass
    return addresses


def start_background_threads():
    threading.Thread(target=recurring_loop, name="recurring", daemon=True).start()
    threading.Thread(target=auto_backup_loop, name="backup", daemon=True).start()


def print_startup_info(fresh):
    print("")
    print("=" * 62)
    print(f"  科务看板 {APP_VERSION} · 开发区科工作任务平台")
    print("=" * 62)
    print(f"  数据目录: {DATA_DIR}")
    print(f"  数据库:   {DB_PATH}")
    print(f"  本机访问: http://127.0.0.1:{PORT}/")
    for ip in lan_addresses():
        print(f"  局域网:   http://{ip}:{PORT}/")
    print("")
    if fresh:
        print("  首次启动已创建账号：姚琦 / 郭军 / 邢玲 / 李鹏 / 张文瑞")
        print(f"  初始密码：{INITIAL_PASSWORD}（每位成员首次登录必须修改）")
        print("  请及时完成首次登录，并妥善保管新密码。")
    else:
        print("  服务已就绪。请使用各自账号登录。")
    print("=" * 62)
    print("  关闭此窗口即停止服务。请保持窗口运行。")
    print("")


_mutex_handle = None


def show_message(title, text, error=False):
    try:
        flags = 0x10 if error else 0x40
        ctypes.windll.user32.MessageBoxW(0, text, title, flags)
    except Exception:
        logger.info("%s: %s", title, text)


def acquire_single_instance():
    global _mutex_handle
    try:
        _mutex_handle = ctypes.windll.kernel32.CreateMutexW(None, False, "Local\\KewuBoard1_2")
        return ctypes.windll.kernel32.GetLastError() != 183
    except Exception:
        return True


def autostart_command():
    if FROZEN:
        return '"' + str(Path(sys.executable).resolve()) + '"'
    return ""


def autostart_enabled():
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run") as key:
            value, _ = winreg.QueryValueEx(key, "KewuBoard")
            return value == autostart_command()
    except Exception:
        return False


def set_autostart(enabled):
    command = autostart_command()
    if not command:
        show_message("暂不可用", "开发模式下不写入开机自启，请使用打包后的 EXE。", True)
        return
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE) as key:
            if enabled:
                winreg.SetValueEx(key, "KewuBoard", 0, winreg.REG_SZ, command)
            else:
                try:
                    winreg.DeleteValue(key, "KewuBoard")
                except FileNotFoundError:
                    pass
    except Exception as exc:
        show_message("设置失败", str(exc), True)


def start_server_thread():
    from waitress.server import create_server
    server = create_server(app, host=HOST, port=PORT, threads=8, channel_timeout=120, ident="KewuBoard/1.2.1")
    threading.Thread(target=server.run, name="kewu-server", daemon=True).start()
    return server


def run_tray(fresh):
    import pystray
    from PIL import Image, ImageDraw

    def open_app(icon=None, item=None):
        webbrowser.open("http://127.0.0.1:%d/" % PORT)

    def show_address(icon=None, item=None):
        lines = ["本机：http://127.0.0.1:%d/" % PORT]
        for ip in lan_addresses():
            lines.append("局域网：http://%s:%d/" % (ip, PORT))
        show_message("科务看板访问地址", "\n".join(lines))

    def backup_now(icon=None, item=None):
        try:
            with app.app_context():
                create_backup("manual")
            show_message("备份完成", "数据库快照已保存到：\n" + str(BACKUP_DIR))
        except Exception as exc:
            show_message("备份失败", str(exc), True)

    def open_data(icon=None, item=None):
        try:
            os.startfile(str(DATA_DIR))
        except Exception as exc:
            show_message("无法打开", str(exc), True)

    def toggle_autostart(icon=None, item=None):
        set_autostart(not autostart_enabled())

    def quit_app(icon, item=None):
        try:
            icon.stop()
        finally:
            os._exit(0)

    icon_path = RESOURCE_DIR / "kewu.ico"
    if icon_path.exists():
        image = Image.open(icon_path)
    else:
        image = Image.new("RGBA", (64, 64), (18, 59, 52, 255))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((12, 10, 52, 54), radius=8, fill=(247, 251, 249, 255))
        draw.line((20, 24, 44, 24), fill=(22, 107, 89, 255), width=3)
        draw.line((20, 33, 40, 33), fill=(22, 107, 89, 255), width=3)

    menu = pystray.Menu(
        pystray.MenuItem("打开工作台", open_app, default=True),
        pystray.MenuItem("查看访问地址", show_address),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("立即备份", backup_now),
        pystray.MenuItem("打开数据目录", open_data),
        pystray.MenuItem("开机自动启动", toggle_autostart, checked=lambda item: autostart_enabled()),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("退出服务", quit_app),
    )
    icon = pystray.Icon("kewu-board", image, "科务看板 1.2.1 · 运行中", menu)
    try:
        start_server_thread()
    except Exception as exc:
        logger.exception("服务启动失败: %s", exc)
        show_message("科务看板启动失败", "端口 %d 可能已被占用。\n%s" % (PORT, exc), True)
        return
    if fresh and os.environ.get("KEWU_NO_DIALOG") != "1":
        show_message("科务看板首次启动",
                     "服务已启动。\n\n初始账号：姚琦 / 郭军 / 邢玲 / 李鹏 / 张文瑞\n初始密码：%s\n\n首次登录必须修改密码。" % INITIAL_PASSWORD)
    if os.environ.get("KEWU_NO_BROWSER") != "1":
        threading.Timer(1.0, open_app).start()
    icon.run()


def main():
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        pass
    if os.environ.get("KEWU_CONSOLE") != "1" and not acquire_single_instance():
        webbrowser.open("http://127.0.0.1:%d/" % PORT)
        return
    fresh = init_database()
    try:
        generate_recurring()
    except Exception as exc:
        logger.exception("启动时生成周期任务失败: %s", exc)
    start_background_threads()
    tray_mode = os.environ.get("KEWU_TRAY", "1") == "1" and not os.environ.get("KEWU_CONSOLE")
    if tray_mode and not FROZEN:
        # 开发时默认仍用控制台，只有显式设置 KEWU_TRAY=1 才走托盘。
        tray_mode = os.environ.get("KEWU_TRAY") == "1" and os.environ.get("KEWU_CONSOLE") != "1"
    if tray_mode:
        run_tray(fresh)
        return
    print_startup_info(fresh)
    from waitress import serve
    serve(app, host=HOST, port=PORT, threads=8, channel_timeout=120, ident="KewuBoard/1.2.1")


if __name__ == "__main__":
    main()


