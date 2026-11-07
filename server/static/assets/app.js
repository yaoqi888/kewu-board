/* =========================================================
   科务看板 1.0 · 正式版前端
   数据由主机 SQLite 数据库集中保存，通过局域网 API 读写。
   ========================================================= */
(function () {
  "use strict";

  /* ---------------- 常量 ---------------- */

  const APP_NAME = "科务看板";
  const APP_SUBTITLE = "开发区科工作任务平台";
  const THEME_KEY = "kewu_theme_v1";
  const STATE_VERSION = 1;
  const DAY_MS = 24 * 60 * 60 * 1000;
  let csrfToken = "";
  let serverBusy = false;

  const THEMES = [
    { id: "green", name: "松石绿", desc: "沉稳 · 清透", colors: ["#123B34", "#166B59", "#E7F2EE"] },
    { id: "blue", name: "黛蓝", desc: "冷静 · 克制", colors: ["#193547", "#356E8B", "#E6F0F5"] },
    { id: "sand", name: "暖砂", desc: "温润 · 自然", colors: ["#352A22", "#8A5C3D", "#F2E8DB"] },
    { id: "graphite", name: "墨灰", desc: "内敛 · 理性", colors: ["#252D31", "#5B6A70", "#EDF0F1"] }
  ];

  const DEFAULT_CATEGORIES = [
    { name: "经济运行", tone: 0, active: true },
    { name: "企业服务", tone: 1, active: true },
    { name: "项目推进", tone: 2, active: true },
    { name: "安全生产", tone: 3, active: true },
    { name: "综合事务", tone: 4, active: true }
  ];

  const SOURCES = ["市委市政府", "省商务厅", "局领导交办", "其他单位", "科室自定"];

  const STATUS = {
    pending: { label: "待办", className: "status-pending" },
    in_progress: { label: "办理中", className: "status-progress" },
    review: { label: "待审核", className: "status-review" },
    completed: { label: "已办结", className: "status-completed" }
  };

  function taskDisplayStatus(task) {
    return task ? task.status : "pending";
  }

  function statusLabel(task) {
    const key = typeof task === "string" ? task : taskDisplayStatus(task);
    return STATUS[key] ? STATUS[key].label : key;
  }

  const CYCLE = {
    weekly: { label: "每周", short: "周", unit: "周" },
    monthly: { label: "每月", short: "月", unit: "月" },
    quarterly: { label: "每季度", short: "季", unit: "季度" }
  };

  const ROUTE_TITLES = {
    dashboard: "工作台",
    calendar: "日历看板",
    tasks: "任务清单",
    recurring: "周期任务",
    archive: "任务归档",
    settings: "系统设置"
  };

  /* ---------------- 图标 ---------------- */

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 4.9M3.5 12l1.2 1.2L7 10.9M3.5 18l1.2 1.2L7 16.9"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.37a1.7 1.7 0 0 0-1 .63 1.7 1.7 0 0 0-.38 1.08V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-.63-1 1.7 1.7 0 0 0-1.08-.38H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-.63 1.7 1.7 0 0 0 .38-1.08V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 .63 1A1.7 1.7 0 0 0 16.4 4.6l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.37 9c.13.37.36.7.63.96.3.26.68.4 1.08.4H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.64Z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9a3 3 0 1 1 4.5 2.6c-.9.55-1.7 1.05-1.7 2.4"/><path d="M12 17.5h.01"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-right": '<path d="m9 6 6 6-6 6"/>',
    "chevron-left": '<path d="m15 6-6 6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/>',
    export: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2"/>',
    report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
    upload: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 21h16"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
    "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7L16.4 9"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    "alert-triangle": '<path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "arrow-left": '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    "rotate-ccw": '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    inbox: '<path d="M4 4h16v16H4z"/><path d="M4 13h4l2 3h4l2-3h4"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    "more-horizontal": '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18h1.2a1.8 1.8 0 0 0 0-3.6h-.8a1.7 1.7 0 0 1 0-3.4H16A5 5 0 0 0 21 9c0-3.3-4-6-9-6Z"/><circle cx="7.2" cy="9.1" r="1"/><circle cx="10.2" cy="6.6" r="1"/><circle cx="14.1" cy="6.8" r="1"/>',
    filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
    spark: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="M19 17v4M17 19h4"/>',
    "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
    "external-link": '<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'
  };

  function icon(name, className) {
    const body = ICONS[name] || ICONS.info;
    return '<svg class="' + (className || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + "</svg>";
  }

  /* ---------------- 日期与格式 ---------------- */

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function startOfDay(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function parseISODate(value) {
    if (!value) return null;
    if (value instanceof Date) return new Date(value.getTime());
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function toISODate(value) {
    const date = value instanceof Date ? value : parseISODate(value);
    if (!date) return "";
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function addDays(value, amount) {
    const date = value instanceof Date ? new Date(value.getTime()) : parseISODate(value);
    date.setDate(date.getDate() + amount);
    return date;
  }

  function addMonths(value, amount) {
    const date = value instanceof Date ? new Date(value.getTime()) : parseISODate(value);
    const targetDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + amount);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(targetDay, lastDay));
    return date;
  }

  function weekStart(value) {
    const date = startOfDay(value instanceof Date ? value : parseISODate(value));
    const offset = (date.getDay() + 6) % 7;
    return addDays(date, -offset);
  }

  function startOfMonth(value) {
    const date = startOfDay(value instanceof Date ? value : parseISODate(value));
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function endOfMonth(value) {
    const date = startOfDay(value instanceof Date ? value : parseISODate(value));
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  function startOfQuarter(value) {
    const date = startOfDay(value instanceof Date ? value : parseISODate(value));
    const month = Math.floor(date.getMonth() / 3) * 3;
    return new Date(date.getFullYear(), month, 1);
  }

  function endOfQuarter(value) {
    const start = startOfQuarter(value);
    return new Date(start.getFullYear(), start.getMonth() + 3, 0);
  }

  function quarterOf(value) {
    return Math.floor((startOfDay(value instanceof Date ? value : parseISODate(value)).getMonth()) / 3) + 1;
  }

  function sameDay(a, b) {
    return toISODate(a) === toISODate(b);
  }

  function diffCalendarDays(dueDate, base) {
    const due = startOfDay(parseISODate(dueDate));
    const today = startOfDay(base || new Date());
    return Math.round((due.getTime() - today.getTime()) / DAY_MS);
  }

  const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  function formatDateCN(value, options) {
    const date = value instanceof Date ? value : parseISODate(value);
    if (!date) return "—";
    const opts = options || {};
    if (opts.full) {
      return date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日";
    }
    if (opts.withWeekday) {
      return (date.getMonth() + 1) + "月" + date.getDate() + "日 " + WEEKDAYS[date.getDay()];
    }
    if (opts.year) {
      return date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日";
    }
    return (date.getMonth() + 1) + "月" + date.getDate() + "日";
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const now = new Date();
    const dayDiff = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / DAY_MS);
    const time = pad2(date.getHours()) + ":" + pad2(date.getMinutes());
    if (dayDiff === 0) return "今天 " + time;
    if (dayDiff === 1) return "昨天 " + time;
    if (dayDiff > 1 && dayDiff < 7) return dayDiff + "天前 " + time;
    if (date.getFullYear() === now.getFullYear()) {
      return (date.getMonth() + 1) + "月" + date.getDate() + "日 " + time;
    }
    return date.getFullYear() + "/" + (date.getMonth() + 1) + "/" + date.getDate() + " " + time;
  }

  function formatShortDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return (date.getMonth() + 1) + "月" + date.getDate() + "日 " + pad2(date.getHours()) + ":" + pad2(date.getMinutes());
  }

  function formatMonthDay(value) {
    const date = parseISODate(value);
    if (!date) return "—";
    return (date.getMonth() + 1) + "月" + date.getDate() + "日";
  }

  function normalizeTime(value) {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return "18:00";
    const hour = Math.max(0, Math.min(23, Number(match[1])));
    const minute = Math.max(0, Math.min(59, Number(match[2])));
    return pad2(hour) + ":" + pad2(minute);
  }

  function formatDueTime(task) {
    return normalizeTime(task && task.dueTime);
  }

  function dueDateTime(task) {
    const date = parseISODate(task && task.dueDate);
    if (!date) return null;
    const time = formatDueTime(task).split(":");
    date.setHours(Number(time[0]), Number(time[1]), 0, 0);
    return date;
  }

  function formatDueDateTime(task, options) {
    const date = parseISODate(task && task.dueDate);
    if (!date) return "—";
    const opts = options || {};
    const time = formatDueTime(task);
    if (opts.short) return formatMonthDay(task.dueDate) + " " + time;
    return formatDateCN(task.dueDate, { full: true }) + " " + time;
  }

  function overdueDurationLabel(dueDate) {
    const diffMs = Math.max(0, Date.now() - dueDate.getTime());
    const hours = Math.max(1, Math.floor(diffMs / 3600000));
    if (hours < 24) return "已逾期 " + hours + " 小时";
    return "已逾期 " + Math.floor(hours / 24) + " 天";
  }

  function formatMonth(value) {
    const date = parseISODate(value);
    if (!date) return "—";
    return date.getFullYear() + "年" + (date.getMonth() + 1) + "月";
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function timeAt(dayOffset, hour, minute) {
    const date = addDays(new Date(), dayOffset);
    date.setHours(hour || 9, minute || 0, 0, 0);
    return date.toISOString();
  }

  function greetingText() {
    const hour = new Date().getHours();
    if (hour < 6) return "夜深了";
    if (hour < 9) return "早上好";
    if (hour < 12) return "上午好";
    if (hour < 14) return "中午好";
    if (hour < 18) return "下午好";
    return "晚上好";
  }

  function todayLine() {
    const date = new Date();
    return date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日 · " + WEEKDAYS[date.getDay()];
  }

  function weekRangeLabel(date) {
    const start = weekStart(date || new Date());
    const end = addDays(start, 6);
    return (start.getMonth() + 1) + "/" + start.getDate() + " - " + (end.getMonth() + 1) + "/" + end.getDate();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function truncate(value, max) {
    const text = String(value == null ? "" : value);
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function deepClone(value) {
    if (typeof structuredClone === "function") {
      try { return structuredClone(value); } catch (err) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function pluralTask(count) {
    return count + " 项";
  }

  /* ---------------- 周期与到期 ---------------- */

  function periodKey(cycle, dateValue) {
    const date = dateValue instanceof Date ? dateValue : parseISODate(dateValue);
    if (!date) return "";
    if (cycle === "weekly") return toISODate(weekStart(date));
    if (cycle === "monthly") return date.getFullYear() + "-" + pad2(date.getMonth() + 1);
    if (cycle === "quarterly") return date.getFullYear() + "-Q" + quarterOf(date);
    return toISODate(date);
  }

  function periodLabel(cycle, dateValue) {
    const date = dateValue instanceof Date ? dateValue : parseISODate(dateValue);
    if (!date) return "";
    if (cycle === "weekly") {
      return weekRangeLabel(date);
    }
    if (cycle === "monthly") return date.getFullYear() + "年" + (date.getMonth() + 1) + "月";
    if (cycle === "quarterly") return date.getFullYear() + "年第" + quarterOf(date) + "季度";
    return formatDateCN(date);
  }

  function periodShortLabel(cycle, dateValue) {
    const date = dateValue instanceof Date ? dateValue : parseISODate(dateValue);
    if (!date) return "";
    if (cycle === "weekly") return periodKey("weekly", date).slice(5).replace("-", "/");
    if (cycle === "monthly") return (date.getMonth() + 1) + "月";
    if (cycle === "quarterly") return "Q" + quarterOf(date);
    return formatMonthDay(date);
  }

  function computeCurrentDue(template, baseDate) {
    const today = startOfDay(baseDate || new Date());
    const anchor = parseISODate(template.anchorDue) || today;
    if (template.cycle === "weekly") {
      const anchorOffset = (anchor.getDay() + 6) % 7;
      return addDays(weekStart(today), anchorOffset);
    }
    if (template.cycle === "monthly") {
      const monthStart = startOfMonth(today);
      const lastDay = endOfMonth(today).getDate();
      return new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(anchor.getDate(), lastDay));
    }
    if (template.cycle === "quarterly") {
      const qStart = startOfQuarter(today);
      const monthOffset = (anchor.getMonth() - Math.floor(anchor.getMonth() / 3) * 3);
      const month = qStart.getMonth() + monthOffset;
      const target = new Date(qStart.getFullYear(), month, 1);
      const lastDay = endOfMonth(target).getDate();
      return new Date(target.getFullYear(), target.getMonth(), Math.min(anchor.getDate(), lastDay));
    }
    return today;
  }

  function dueState(task, baseDate) {
    if (!task) return { key: "normal", diff: 0, label: "—", className: "normal" };
    if (task.status === "completed") {
      return { key: "completed", diff: 0, label: "已办结", className: "done" };
    }
    const now = baseDate ? new Date(baseDate) : new Date();
    const dueAt = dueDateTime(task);
    if (!dueAt) return { key: "normal", diff: 0, label: "—", className: "normal" };
    const diff = diffCalendarDays(task.dueDate, now);
    const time = formatDueTime(task);
    if (now.getTime() >= dueAt.getTime()) {
      return { key: "overdue", diff: diff, label: overdueDurationLabel(dueAt), className: "overdue" };
    }
    if (diff === 0) return { key: "today", diff: diff, label: "今天 " + time + " 截止", className: "urgent" };
    if (diff === 1) return { key: "urgent", diff: diff, label: "明天 " + time + " 截止", className: "urgent" };
    if (diff <= 3) return { key: "soon", diff: diff, label: diff + " 天后 " + time + " 截止", className: "soon" };
    return { key: "normal", diff: diff, label: "还有 " + diff + " 天", className: "normal" };
  }

  function isUpcoming(task) {
    if (!task || task.status === "completed") return false;
    const dueAt = dueDateTime(task);
    if (!dueAt) return false;
    const diff = diffCalendarDays(task.dueDate);
    return dueAt.getTime() > Date.now() && diff >= 0 && diff <= 3;
  }

  function isOverdue(task) {
    if (!task || task.status === "completed") return false;
    const dueAt = dueDateTime(task);
    return Boolean(dueAt && Date.now() >= dueAt.getTime());
  }

  function isUnfinished(task) {
    return task.status !== "completed";
  }

  function dueSortValue(task) {
    if (!task || !task.dueDate) return "9999-12-31T23:59";
    return task.dueDate + "T" + formatDueTime(task);
  }

  function sortByDue(a, b) {
    return dueSortValue(a).localeCompare(dueSortValue(b));
  }

  function comparePeriodKeys(a, b) {
    return String(a).localeCompare(String(b));
  }

  /* ---------------- 种子数据 ---------------- */

  function activeCategories() {
    const list = (state && Array.isArray(state.categories)) ? state.categories : DEFAULT_CATEGORIES;
    return list.filter(function (item) { return item.active; });
  }

  function categoryTone(name) {
    const list = (state && Array.isArray(state.categories)) ? state.categories : DEFAULT_CATEGORIES;
    const found = list.find(function (item) { return item.name === name; });
    return found ? found.tone : 4;
  }

  function taskSource(task) {
    return String(task && task.source || "").trim() || "未标注";
  }

  function sourceOptions(selected, includeAll) {
    let html = includeAll ? '<option value="all">全部来源</option>' : "";
    SOURCES.forEach(function (source) {
      html += '<option value="' + escapeHtml(source) + '"' + (selected === source ? " selected" : "") + ">" + escapeHtml(source) + "</option>";
    });
    return html;
  }

  function activity(at, actorId, action, note) {
    return { at: at, actorId: actorId, action: action, note: note || "" };
  }

  function buildSeedState() {
    const people = [
      { id: "p1", name: "姚琦", title: "科长", role: "manager", active: true, avatarTone: "green", createdAt: timeAt(-180, 9) },
      { id: "p2", name: "郭军", title: "一级主任科员", role: "manager", active: true, avatarTone: "blue", createdAt: timeAt(-180, 9) },
      { id: "p3", name: "邢玲", title: "科员", role: "staff", active: true, avatarTone: "amber", createdAt: timeAt(-160, 9) },
      { id: "p4", name: "李鹏", title: "科员", role: "staff", active: true, avatarTone: "purple", createdAt: timeAt(-160, 9) },
      { id: "p5", name: "张文瑞", title: "科员", role: "staff", active: true, avatarTone: "rose", createdAt: timeAt(-160, 9) }
    ];

    const today = startOfDay(new Date());
    const thisFriday = addDays(weekStart(today), 4);
    const thisTuesday = addDays(weekStart(today), 1);
    const currentMonthEnd = endOfMonth(today);
    const currentQuarterEnd = endOfQuarter(today);
    const prevMonthEnd = endOfMonth(addMonths(today, -1));
    const prevQuarterEnd = endOfQuarter(addMonths(today, -3));

    const templates = [
      {
        id: "s1",
        title: "每周重点工作报送",
        description: "汇总本周重点工作进展、下周计划和需协调事项，经科室负责人确认后报送。",
        category: "综合事务",
        assigneeId: "p4",
        cycle: "weekly",
        anchorDue: toISODate(thisFriday),
        dueTime: "18:00",
        active: true,
        createdBy: "p1",
        createdAt: timeAt(-60, 9)
      },
      {
        id: "s2",
        title: "每月安全生产隐患排查",
        description: "对辖区重点企业开展安全生产隐患排查，建立问题台账并跟踪整改闭环。",
        category: "安全生产",
        assigneeId: "p3",
        cycle: "monthly",
        anchorDue: toISODate(currentMonthEnd),
        dueTime: "18:00",
        active: true,
        createdBy: "p1",
        createdAt: timeAt(-120, 9)
      },
      {
        id: "s3",
        title: "每季度重点项目进度更新",
        description: "更新重点项目开工、投资和建设进度，梳理需协调解决的堵点问题。",
        category: "项目推进",
        assigneeId: "p5",
        cycle: "quarterly",
        anchorDue: toISODate(currentQuarterEnd),
        dueTime: "18:00",
        active: true,
        createdBy: "p1",
        createdAt: timeAt(-200, 9)
      },
      {
        id: "s4",
        title: "每周例会纪要整理",
        description: "整理科室周例会会议纪要，明确议定事项、责任人和完成时限后发科室成员。",
        category: "综合事务",
        assigneeId: "p5",
        cycle: "weekly",
        anchorDue: toISODate(thisTuesday),
        dueTime: "17:30",
        active: true,
        createdBy: "p1",
        createdAt: timeAt(-45, 9)
      }
    ];

    function makeTask(config) {
      const created = config.createdAt || timeAt(-3, 9);
      const baseActivities = [
        activity(created, config.creatorId || "p1", "created", "创建了任务")
      ];
      if (config.startedAt) {
        baseActivities.push(activity(config.startedAt, config.assigneeId, "started", "开始办理"));
      }
      if (config.submittedAt) {
        baseActivities.push(activity(config.submittedAt, config.assigneeId, "submitted", config.submitNote || "提交审核"));
      }
      if (config.status === "completed" && config.completedAt) {
        baseActivities.push(activity(config.completedAt, config.reviewerId || "p1", "approved", config.reviewNote || "审核通过，任务办结"));
      }

      let progressEntries = [];
      if (Array.isArray(config.progress) && config.progress.length) {
        progressEntries = config.progress.map(function (entry, index) {
          return {
            id: "pg_" + config.id + "_" + index,
            at: entry.at || config.startedAt || created,
            actorId: entry.actorId || config.assigneeId,
            type: entry.type === "result" ? "result" : "update",
            content: entry.content
          };
        });
      } else if (config.submittedAt) {
        progressEntries.push({
          id: "pg_" + config.id + "_result",
          at: config.submittedAt,
          actorId: config.assigneeId,
          type: "result",
          content: config.submitNote || "办理完成并提交审核。"
        });
      } else if (config.startedAt) {
        progressEntries.push({
          id: "pg_" + config.id + "_start",
          at: config.startedAt,
          actorId: config.assigneeId,
          type: "update",
          content: "已开始办理，正在按计划推进。"
        });
      }

      return {
        id: config.id,
        code: config.code,
        title: config.title,
        description: config.description || "",
        category: config.category || "综合事务",
        type: config.type || "one-time",
        seriesId: config.seriesId || null,
        templateId: config.seriesId || null,
        periodKey: config.periodKey || null,
        cycle: config.cycle || null,
        assigneeId: config.assigneeId,
        creatorId: config.creatorId || "p1",
        status: config.status,
        dueDate: config.dueDate,
        dueTime: normalizeTime(config.dueTime),
        createdAt: created,
        updatedAt: config.completedAt || config.submittedAt || config.startedAt || created,
        startedAt: config.startedAt || null,
        submittedAt: config.submittedAt || null,
        completedAt: config.completedAt || null,
        reviewedAt: config.completedAt || null,
        reviewerId: config.reviewerId || null,
        reviewNote: config.reviewNote || "",
        rejectionCount: config.rejectionCount || 0,
        progress: progressEntries,
        activity: baseActivities
      };
    }

    const tasks = [];

    tasks.push(makeTask({
      id: "t1",
      code: "RW-2026-001",
      title: "汇总上报10月工业经济运行情况",
      description: "汇总规上工业企业产值、用电量等关键指标，形成10月工业经济运行分析，经科室负责人审核后报送市工信局。",
      category: "经济运行",
      type: "one-time",
      assigneeId: "p4",
      creatorId: "p1",
      status: "review",
      dueDate: toISODate(addDays(today, 1)),
      dueTime: "12:00",
      createdAt: timeAt(-4, 9),
      startedAt: timeAt(-3, 10, 20),
      submittedAt: timeAt(0, 9, 15),
      submitNote: "数据已核对，分析材料初稿完成。",
      progress: [
        { at: timeAt(-3, 10, 40), content: "已收集规上企业产值、用电量等基础数据。" },
        { at: timeAt(-2, 16, 20), content: "数据汇总完成，正在核对同比变化和重点企业情况。" },
        { at: timeAt(0, 9, 15), type: "result", content: "10月工业经济运行分析已形成，关键数据完成二次核对，提交审核。" }
      ]
    }));

    tasks.push(makeTask({
      id: "t2",
      code: "RW-2026-002",
      title: "开展重点企业安全生产专项检查",
      description: "对辖区重点工业企业开展冬季安全生产检查，形成隐患清单，明确整改责任和完成时限。",
      category: "安全生产",
      type: "one-time",
      assigneeId: "p3",
      creatorId: "p1",
      status: "in_progress",
      dueDate: toISODate(addDays(today, 5)),
      createdAt: timeAt(-3, 9),
      startedAt: timeAt(-2, 9, 40),
      progress: [
        { at: timeAt(-2, 9, 40), content: "已制定检查计划，联系重点企业确认检查时间。" },
        { at: timeAt(0, 11, 10), content: "已完成5家企业现场检查，正在整理隐患清单和整改时限。" }
      ]
    }));

    tasks.push(makeTask({
      id: "t3",
      code: "RW-2026-003",
      title: "2026年第四季度重点项目走访安排",
      description: "梳理第四季度拟走访重点项目，明确走访时间、责任人和需协调事项，形成项目走访安排表。",
      category: "项目推进",
      type: "one-time",
      assigneeId: "p5",
      creatorId: "p1",
      status: "pending",
      dueDate: toISODate(addDays(today, 1)),
      dueTime: "17:00",
      createdAt: timeAt(-1, 10)
    }));

    tasks.push(makeTask({
      id: "t4",
      code: "RW-2026-004",
      title: "更新开发区企业服务台账",
      description: "根据近期走访和诉求办理情况，更新企业基本信息、联系人和服务事项，确保台账准确可用。",
      category: "企业服务",
      type: "one-time",
      assigneeId: "p3",
      creatorId: "p1",
      status: "in_progress",
      dueDate: toISODate(addDays(today, -2)),
      createdAt: timeAt(-8, 9),
      startedAt: timeAt(-6, 10),
      progress: [
        { at: timeAt(-6, 10), content: "已导出企业基础台账，按片区逐户核对。" },
        { at: timeAt(-3, 15, 20), content: "完成约80%企业信息更新，部分企业联系人已变更，正在补录。" }
      ]
    }));

    tasks.push(makeTask({
      id: "t5",
      code: "RW-2026-005",
      title: "准备本周项目调度会材料",
      description: "梳理在建项目本周进展、存在问题和需协调事项，形成项目调度会汇报材料。",
      category: "综合事务",
      type: "one-time",
      assigneeId: "p4",
      creatorId: "p1",
      status: "pending",
      dueDate: toISODate(today),
      dueTime: "17:30",
      createdAt: timeAt(-1, 14)
    }));

    tasks.push(makeTask({
      id: "t6",
      code: "RW-2026-006",
      title: "完成科室年度工作总结初稿",
      description: "梳理全年重点任务完成情况、亮点工作和存在问题，形成科室年度工作总结初稿。",
      category: "综合事务",
      type: "one-time",
      assigneeId: "p1",
      creatorId: "p1",
      status: "in_progress",
      dueDate: toISODate(addDays(today, 12)),
      createdAt: timeAt(-6, 9),
      startedAt: timeAt(-2, 15),
      progress: [
        { at: timeAt(-2, 15), content: "已收集各条线年度工作素材，完成总结框架。" }
      ]
    }));

    tasks.push(makeTask({
      id: "t7",
      code: "RW-2026-007",
      title: "对接市工信局专项资金申报",
      description: "对照申报指南梳理符合条件的企业和项目，准备申报材料并做好对上沟通对接。",
      category: "经济运行",
      type: "one-time",
      assigneeId: "p2",
      creatorId: "p1",
      status: "review",
      dueDate: toISODate(addDays(today, 4)),
      createdAt: timeAt(-7, 9),
      startedAt: timeAt(-5, 9),
      submittedAt: timeAt(-1, 15, 30),
      submitNote: "企业名单和申报材料已整理完毕，请审核。",
      progress: [
        { at: timeAt(-5, 9), content: "已对照申报指南梳理符合条件的企业和项目。" },
        { at: timeAt(-1, 15, 30), type: "result", content: "企业名单和申报材料已整理完毕，提交审核。" }
      ]
    }));

    tasks.push(makeTask({
      id: "t8",
      code: "RW-2026-008",
      title: "企业诉求办理情况回访",
      description: "对本月已办结的企业诉求逐项回访，了解问题解决情况和企业满意度，记录后续需求。",
      category: "企业服务",
      type: "one-time",
      assigneeId: "p5",
      creatorId: "p1",
      status: "pending",
      dueDate: toISODate(addDays(today, 5)),
      createdAt: timeAt(-2, 11)
    }));

    tasks.push(makeTask({
      id: "t9",
      code: "RW-2026-009",
      title: "10月主题党日活动材料归档",
      description: "整理10月主题党日活动方案、签到、影像和总结材料，按规范完成归档。",
      category: "综合事务",
      type: "one-time",
      assigneeId: "p3",
      creatorId: "p1",
      status: "completed",
      dueDate: toISODate(addDays(today, -3)),
      createdAt: timeAt(-9, 9),
      startedAt: timeAt(-7, 10),
      submittedAt: timeAt(-4, 16),
      completedAt: timeAt(-3, 10),
      reviewerId: "p1",
      reviewNote: "材料齐全，同意归档。"
    }));

    tasks.push(makeTask({
      id: "t10",
      code: "RW-2026-010",
      title: "开发区营商环境问题清单梳理",
      description: "汇总企业座谈会和日常走访收集的问题，形成营商环境问题清单，提出办理建议。",
      category: "企业服务",
      type: "one-time",
      assigneeId: "p4",
      creatorId: "p1",
      status: "completed",
      dueDate: toISODate(addDays(today, -8)),
      createdAt: timeAt(-16, 9),
      startedAt: timeAt(-13, 10),
      submittedAt: timeAt(-10, 14),
      completedAt: timeAt(-9, 11),
      reviewerId: "p2",
      reviewNote: "问题分类清晰，同意办结。"
    }));

    // 周期任务：每周重点工作报送
    tasks.push(makeTask({
      id: "t11",
      code: "RW-2026-011",
      title: "每周重点工作报送",
      description: "汇总本周重点工作进展、下周计划和需协调事项，经科室负责人确认后报送。",
      category: "综合事务",
      type: "recurring",
      seriesId: "s1",
      periodKey: periodKey("weekly", today),
      cycle: "weekly",
      assigneeId: "p4",
      creatorId: "p1",
      status: "in_progress",
      dueDate: toISODate(thisFriday),
      createdAt: timeAt(0, 8, 30),
      startedAt: timeAt(0, 8, 50),
      progress: [
        { at: timeAt(0, 8, 50), content: "已汇总本周重点工作进展，正在补充下周计划。" }
      ]
    }));

    tasks.push(makeTask({
      id: "t12",
      code: "RW-2026-012",
      title: "每周重点工作报送",
      description: "汇总本周重点工作进展、下周计划和需协调事项，经科室负责人确认后报送。",
      category: "综合事务",
      type: "recurring",
      seriesId: "s1",
      periodKey: periodKey("weekly", addDays(thisFriday, -7)),
      cycle: "weekly",
      assigneeId: "p4",
      creatorId: "p1",
      status: "completed",
      dueDate: toISODate(addDays(thisFriday, -7)),
      createdAt: timeAt(-7, 8, 30),
      startedAt: timeAt(-6, 9),
      submittedAt: timeAt(-4, 16, 20),
      completedAt: timeAt(-3, 9, 10),
      reviewerId: "p1",
      reviewNote: "已按格式报送，同意办结。"
    }));

    tasks.push(makeTask({
      id: "t13",
      code: "RW-2026-013",
      title: "每周重点工作报送",
      description: "汇总本周重点工作进展、下周计划和需协调事项，经科室负责人确认后报送。",
      category: "综合事务",
      type: "recurring",
      seriesId: "s1",
      periodKey: periodKey("weekly", addDays(thisFriday, -14)),
      cycle: "weekly",
      assigneeId: "p4",
      creatorId: "p1",
      status: "completed",
      dueDate: toISODate(addDays(thisFriday, -14)),
      createdAt: timeAt(-14, 8, 30),
      startedAt: timeAt(-13, 9),
      submittedAt: timeAt(-12, 15),
      completedAt: timeAt(-10, 9, 30),
      reviewerId: "p2",
      reviewNote: "同意办结。"
    }));

    // 周期任务：每月安全生产隐患排查
    tasks.push(makeTask({
      id: "t14",
      code: "RW-2026-014",
      title: "每月安全生产隐患排查",
      description: "对辖区重点企业开展安全生产隐患排查，建立问题台账并跟踪整改闭环。",
      category: "安全生产",
      type: "recurring",
      seriesId: "s2",
      periodKey: periodKey("monthly", today),
      cycle: "monthly",
      assigneeId: "p3",
      creatorId: "p1",
      status: "pending",
      dueDate: toISODate(currentMonthEnd),
      createdAt: timeAt(-1, 8, 40)
    }));

    tasks.push(makeTask({
      id: "t15",
      code: "RW-2026-015",
      title: "每月安全生产隐患排查",
      description: "对辖区重点企业开展安全生产隐患排查，建立问题台账并跟踪整改闭环。",
      category: "安全生产",
      type: "recurring",
      seriesId: "s2",
      periodKey: periodKey("monthly", prevMonthEnd),
      cycle: "monthly",
      assigneeId: "p3",
      creatorId: "p1",
      status: "completed",
      dueDate: toISODate(prevMonthEnd),
      createdAt: toISODate(startOfMonth(prevMonthEnd)) + "T08:40:00+08:00",
      startedAt: toISODate(addDays(prevMonthEnd, -8)) + "T09:20:00+08:00",
      submittedAt: toISODate(addDays(prevMonthEnd, -2)) + "T15:10:00+08:00",
      completedAt: toISODate(addDays(prevMonthEnd, -1)) + "T10:00:00+08:00",
      reviewerId: "p1",
      reviewNote: "排查记录完整，同意办结。"
    }));

    // 周期任务：每季度重点项目进度更新
    tasks.push(makeTask({
      id: "t16",
      code: "RW-2026-016",
      title: "每季度重点项目进度更新",
      description: "更新重点项目开工、投资和建设进度，梳理需协调解决的堵点问题。",
      category: "项目推进",
      type: "recurring",
      seriesId: "s3",
      periodKey: periodKey("quarterly", today),
      cycle: "quarterly",
      assigneeId: "p5",
      creatorId: "p1",
      status: "pending",
      dueDate: toISODate(currentQuarterEnd),
      createdAt: toISODate(startOfQuarter(today)) + "T09:10:00+08:00"
    }));

    tasks.push(makeTask({
      id: "t17",
      code: "RW-2026-017",
      title: "每季度重点项目进度更新",
      description: "更新重点项目开工、投资和建设进度，梳理需协调解决的堵点问题。",
      category: "项目推进",
      type: "recurring",
      seriesId: "s3",
      periodKey: periodKey("quarterly", prevQuarterEnd),
      cycle: "quarterly",
      assigneeId: "p5",
      creatorId: "p1",
      status: "completed",
      dueDate: toISODate(prevQuarterEnd),
      createdAt: toISODate(startOfQuarter(prevQuarterEnd)) + "T09:10:00+08:00",
      startedAt: toISODate(addDays(prevQuarterEnd, -12)) + "T09:30:00+08:00",
      submittedAt: toISODate(addDays(prevQuarterEnd, -2)) + "T16:40:00+08:00",
      completedAt: toISODate(addDays(prevQuarterEnd, -1)) + "T11:20:00+08:00",
      reviewerId: "p2",
      reviewNote: "进度数据准确，同意办结。"
    }));

    // 周期任务：每周例会纪要整理
    tasks.push(makeTask({
      id: "t18",
      code: "RW-2026-018",
      title: "每周例会纪要整理",
      description: "整理科室周例会会议纪要，明确议定事项、责任人和完成时限后发科室成员。",
      category: "综合事务",
      type: "recurring",
      seriesId: "s4",
      periodKey: periodKey("weekly", today),
      cycle: "weekly",
      assigneeId: "p5",
      creatorId: "p1",
      status: "review",
      dueDate: toISODate(thisTuesday),
      dueTime: "17:30",
      createdAt: timeAt(0, 10),
      startedAt: timeAt(0, 10, 15),
      submittedAt: timeAt(0, 11, 30),
      submitNote: "会议纪要已整理，议定事项已标注责任人。",
      progress: [
        { at: timeAt(0, 10, 15), content: "已整理会议纪要初稿，核对议定事项和责任人。" },
        { at: timeAt(0, 11, 30), type: "result", content: "会议纪要已整理完成，议定事项已标注责任人和完成时限，提交审核。" }
      ]
    }));

    tasks.push(makeTask({
      id: "t19",
      code: "RW-2026-019",
      title: "每周例会纪要整理",
      description: "整理科室周例会会议纪要，明确议定事项、责任人和完成时限后发科室成员。",
      category: "综合事务",
      type: "recurring",
      seriesId: "s4",
      periodKey: periodKey("weekly", addDays(today, -7)),
      cycle: "weekly",
      assigneeId: "p5",
      creatorId: "p1",
      status: "completed",
      dueDate: toISODate(addDays(thisTuesday, -7)),
      dueTime: "17:30",
      createdAt: timeAt(-7, 10),
      startedAt: timeAt(-7, 10, 30),
      submittedAt: timeAt(-7, 15),
      completedAt: timeAt(-6, 9, 20),
      reviewerId: "p1",
      reviewNote: "议定事项明确，同意办结。"
    }));

    return {
      version: STATE_VERSION,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      currentUserId: "p1",
      settings: {
        autoBackupEnabled: true,
        backupIntervalHours: 24,
        theme: "green"
      },
      people: people,
      categories: deepClone(DEFAULT_CATEGORIES),
      templates: templates,
      tasks: tasks
    };
  }

  /* ---------------- 状态 ---------------- */

  let state;
  let backups = [];
  let currentRoute = "dashboard";

  const ui = {
    selectedTaskId: null,
    drawerOpen: false,
    taskStatus: "all",
    taskSearch: "",
    taskAssignee: "all",
    taskType: "all",
    sourceFilter: "all",
    dueFilter: "all",
    archiveSearch: "",
    exportOpen: false,
    attentionTab: "all",
    reminderTab: "upcoming",
    bannerDismissed: false,
    seriesExpanded: {},
    selectedTaskIds: new Set(),
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    calendarSelectedDate: null
  };

  let pendingConfirm = null;
  let toastSeq = 0;

  function normalizeState(input) {
    if (!input || typeof input !== "object") return null;
    if (!Array.isArray(input.people) || !input.people.length) return null;
    if (!Array.isArray(input.tasks)) return null;

    const normalized = deepClone(input);
    normalized.version = STATE_VERSION;
    normalized.settings = Object.assign({
      autoBackupEnabled: true,
      backupIntervalHours: 24,
      theme: "green"
    }, normalized.settings || {});
    if (!THEMES.some(function (theme) { return theme.id === normalized.settings.theme; })) {
      normalized.settings.theme = "green";
    }
    const rawCategories = Array.isArray(normalized.categories) && normalized.categories.length
      ? normalized.categories
      : DEFAULT_CATEGORIES;
    const seenCategories = new Set();
    normalized.categories = rawCategories.map(function (cat, index) {
      const name = String(cat && cat.name || "").trim();
      if (!name || seenCategories.has(name)) return null;
      seenCategories.add(name);
      return {
        name: name,
        tone: Number.isFinite(Number(cat.tone)) ? Math.abs(Number(cat.tone)) % 5 : index % 5,
        active: cat.active !== false
      };
    }).filter(Boolean);
    if (!normalized.categories.length) normalized.categories = deepClone(DEFAULT_CATEGORIES);
    if (!normalized.categories.some(function (cat) { return cat.active; })) normalized.categories[0].active = true;
    normalized.templates = Array.isArray(normalized.templates) ? normalized.templates.map(function (template) {
      return Object.assign({}, template, {
        dueTime: normalizeTime(template.dueTime),
        source: String(template.source || "科室自定")
      });
    }) : [];
    normalized.deletedTasks = Array.isArray(normalized.deletedTasks) ? normalized.deletedTasks.map(function (task) {
      const copy = Object.assign({}, task);
      copy.status = STATUS[copy.status] ? copy.status : "pending";
      copy.source = String(copy.source || "科室自定");
      copy.activity = Array.isArray(copy.activity) ? copy.activity : [];
      copy.progress = Array.isArray(copy.progress) ? copy.progress : [];
      copy.deletedAt = copy.deletedAt || nowIso();
      return copy;
    }) : [];
    if (!normalized.calendar || typeof normalized.calendar !== "object" || !normalized.calendar.days) {
      normalized.calendar = null;
    }
    normalized.people = normalized.people.map(function (person, index) {
      return Object.assign({
        id: "p_" + (index + 1),
        name: "未命名",
        title: "科员",
        role: "staff",
        active: true,
        avatarTone: ["green", "blue", "amber", "purple", "rose"][index % 5],
        createdAt: nowIso()
      }, person);
    });
    normalized.tasks = normalized.tasks.map(function (task) {
      const copy = Object.assign({}, task);
      copy.status = STATUS[copy.status] ? copy.status : "pending";
      copy.activity = Array.isArray(copy.activity) ? copy.activity : [];
      copy.progress = Array.isArray(copy.progress) ? copy.progress : [];
      copy.type = copy.type === "recurring" ? "recurring" : "one-time";
      copy.description = copy.description || "";
      copy.source = String(copy.source || "科室自定");
      copy.reviewNote = copy.reviewNote || "";
      copy.rejectionCount = Number(copy.rejectionCount) || 0;
      copy.dueDate = copy.dueDate || toISODate(new Date());
      copy.dueTime = normalizeTime(copy.dueTime);
      copy.createdAt = copy.createdAt || nowIso();
      copy.updatedAt = copy.updatedAt || copy.createdAt;
      copy.progress = copy.progress.map(function (entry, index) {
        return {
          id: entry.id || ("pg_" + copy.id + "_legacy_" + index),
          at: entry.at || copy.updatedAt,
          actorId: entry.actorId || copy.assigneeId,
          type: entry.type === "result" ? "result" : "update",
          content: String(entry.content || "").trim()
        };
      }).filter(function (entry) { return entry.content; });
      if (!copy.progress.length) {
        const submitted = copy.activity.slice().reverse().find(function (item) { return item.action === "submitted"; });
        const note = submitted && submitted.note ? String(submitted.note).trim() : "";
        if (submitted && note && note !== "提交审核") {
          copy.progress.push({
            id: "pg_" + copy.id + "_migrated",
            at: submitted.at,
            actorId: submitted.actorId || copy.assigneeId,
            type: "result",
            content: note
          });
        }
      }
      return copy;
    });
    const knownCategories = new Set(normalized.categories.map(function (cat) { return cat.name; }));
    normalized.tasks.concat(normalized.templates, normalized.deletedTasks).forEach(function (item) {
      const name = String(item.category || "").trim();
      if (!name || knownCategories.has(name)) return;
      knownCategories.add(name);
      normalized.categories.push({ name: name, tone: normalized.categories.length % 5, active: false });
    });
    normalized.currentUserId = normalized.people.some(function (p) { return p.id === normalized.currentUserId; })
      ? normalized.currentUserId
      : normalized.people[0].id;
    if (!normalized.createdAt) normalized.createdAt = nowIso();
    normalized.updatedAt = normalized.updatedAt || nowIso();
    return normalized;
  }

  async function apiRequest(path, options) {
    const opts = options || {};
    const method = opts.method || "GET";
    const headers = Object.assign({ "Accept": "application/json" }, opts.headers || {});
    if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
    const fetchOptions = {
      method: method,
      credentials: "same-origin",
      cache: "no-store",
      headers: headers
    };
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(opts.json);
    } else if (opts.body !== undefined) {
      fetchOptions.body = opts.body;
    }
    let response;
    try {
      response = await fetch(path, fetchOptions);
    } catch (err) {
      throw new Error("无法连接主机服务，请确认主机和网络正常。");
    }
    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      data = null;
    }
    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("登录已失效，请重新登录。");
    }
    if (response.status === 403 && data && data.code === "must_change_password") {
      window.location.href = "/change-password";
      throw new Error("请先修改初始密码。");
    }
    if (!response.ok) {
      throw new Error((data && data.error) || "操作失败，请稍后重试。");
    }
    return data || {};
  }

  async function loadServerState() {
    const data = await apiRequest("/api/state");
    const normalized = normalizeState(data.state);
    if (!normalized) throw new Error("服务端返回的数据格式不正确。");
    state = normalized;
    backups = Array.isArray(data.backups) ? data.backups : [];
    if (data.csrfToken) csrfToken = data.csrfToken;
    state.settings.theme = storedTheme();
  }

  async function refreshState() {
    await loadServerState();
    renderAll();
  }

  function saveState() {
    // 正式版所有写入都通过服务端 API，本地不持久化业务数据。
    console.warn("saveState() 已被服务端数据层替代");
    return false;
  }

  async function createBackup(reason, silent) {
    const data = await apiRequest("/api/backups", { method: "POST" });
    backups = Array.isArray(data.backups) ? data.backups : backups;
    if (!silent) {
      toast("备份完成", "数据库快照已保存到主机 data/backups 目录。", "success");
      if (currentRoute === "settings") renderAll();
    }
    return data.backup;
  }

  function maybeAutoBackup() {
    // 自动备份由主机后台线程执行，浏览器不再触发。
  }

  function ensureRecurringTasks() {
    // 周期任务由主机启动时和每日后台任务生成。
    return 0;
  }

  function storedTheme() {
    try {
      const value = localStorage.getItem(THEME_KEY);
      return THEMES.some(function (theme) { return theme.id === value; }) ? value : "green";
    } catch (err) {
      return "green";
    }
  }

  async function logout() {
    try {
      await apiRequest("/api/logout", { method: "POST" });
    } catch (err) { /* ignore */ }
    window.location.href = "/login";
  }

  async function changeOwnPassword() {
    const form = '<form id="password-change-form">' +
      modalHead("修改登录密码", "修改后请使用新密码登录；密码至少 8 位，需包含字母和数字。") +
      '<div class="modal-body">' +
      '<div class="form-field"><label for="own-old-password">当前密码<span class="required">*</span></label><input id="own-old-password" type="password" autocomplete="current-password" required autofocus></div>' +
      '<div class="form-field"><label for="own-new-password">新密码<span class="required">*</span></label><input id="own-new-password" type="password" autocomplete="new-password" minlength="8" required placeholder="至少 8 位，含字母和数字"></div>' +
      '<div class="form-field"><label for="own-confirm-password">确认新密码<span class="required">*</span></label><input id="own-confirm-password" type="password" autocomplete="new-password" minlength="8" required></div>' +
      '</div>' +
      '<div class="modal-foot"><span class="foot-spacer"></span><button type="button" class="btn" data-action="close-modal">取消</button><button type="submit" class="btn btn-primary">保存新密码</button></div>' +
      "</form>";
    openModal(form, { label: "修改密码", size: "modal-sm" });
    const modalForm = document.getElementById("password-change-form");
    modalForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const oldPassword = document.getElementById("own-old-password").value;
      const newPassword = document.getElementById("own-new-password").value;
      const confirm = document.getElementById("own-confirm-password").value;
      if (newPassword !== confirm) {
        toast("两次密码不一致", "请重新输入确认密码。", "error");
        return;
      }
      try {
        const data = await apiRequest("/api/account/password", {
          method: "POST",
          json: { currentPassword: oldPassword, newPassword: newPassword }
        });
        if (data.csrfToken) csrfToken = data.csrfToken;
        closeModal();
        toast("密码已修改", "下次登录请使用新密码。", "success");
      } catch (err) {
        toast("修改失败", err.message, "error");
      }
    });
  }

  function nextTaskCode() {
    const year = new Date().getFullYear();
    let max = 0;
    const prefix = "RW-" + year + "-";
    state.tasks.forEach(function (task) {
      if (task.code && task.code.indexOf(prefix) === 0) {
        const number = Number(task.code.slice(prefix.length));
        if (Number.isFinite(number) && number > max) max = number;
      }
    });
    return prefix + String(max + 1).padStart(3, "0");
  }

  function getPerson(id) {
    return state.people.find(function (person) { return person.id === id; }) || null;
  }

  function currentUser() {
    return getPerson(state.currentUserId) || state.people.find(function (p) { return p.active; }) || state.people[0];
  }

  function canManage() {
    const user = currentUser();
    return Boolean(user && user.role === "manager" && user.active);
  }

  function canCreateTasks() {
    const user = currentUser();
    return Boolean(user && user.active);
  }

  function activePeople() {
    return state.people.filter(function (person) { return person.active; });
  }

  function assignablePeople() {
    return activePeople();
  }

  function userAvatar(person, size) {
    if (!person) {
      return '<span class="avatar ' + (size || "") + '">?</span>';
    }
    const toneClass = person.avatarTone && person.avatarTone !== "green" ? " " + person.avatarTone : "";
    const inactiveClass = person.active ? "" : " inactive";
    return '<span class="avatar ' + (size || "") + toneClass + inactiveClass + '" title="' + escapeHtml(person.name) + '">' + escapeHtml(person.name.slice(0, 1)) + "</span>";
  }

  function statusPill(taskOrStatus) {
    const key = typeof taskOrStatus === "string" ? taskOrStatus : taskDisplayStatus(taskOrStatus);
    const info = STATUS[key] || STATUS.pending;
    return '<span class="status-pill ' + info.className + '">' + info.label + "</span>";
  }

  /* ---------------- 查询与计算 ---------------- */

  function getTask(id) {
    return state.tasks.find(function (task) { return task.id === id; }) || null;
  }

  function getTemplate(id) {
    return state.templates.find(function (template) { return template.id === id; }) || null;
  }

  function getDeletedTask(id) {
    return (state.deletedTasks || []).find(function (task) { return task.id === id; }) || null;
  }

  function unfinishedTasks() {
    return state.tasks.filter(isUnfinished);
  }

  function tasksBySeries(seriesId) {
    return state.tasks.filter(function (task) { return task.seriesId === seriesId; })
      .sort(function (a, b) { return String(a.dueDate).localeCompare(String(b.dueDate)); });
  }

  function currentSeriesTask(template) {
    if (!template) return null;
    const due = computeCurrentDue(template, new Date());
    const key = periodKey(template.cycle, due);
    return state.tasks.find(function (task) {
      return task.seriesId === template.id && task.periodKey === key;
    }) || null;
  }

  function taskCounts() {
    const counts = { all: state.tasks.length, pending: 0, in_progress: 0, review: 0, completed: 0 };
    state.tasks.forEach(function (task) {
      const key = taskDisplayStatus(task);
      if (counts[key] != null) counts[key] += 1;
    });
    counts.unfinished = counts.pending + counts.in_progress + counts.review;
    counts.actionable = counts.unfinished;
    counts.upcoming = state.tasks.filter(isUpcoming).length;
    counts.overdue = state.tasks.filter(isOverdue).length;
    return counts;
  }

  function dashboardStats() {
    const counts = taskCounts();
    const todayDue = unfinishedTasks().filter(function (task) { return diffCalendarDays(task.dueDate) === 0; }).length;
    const oneDay = unfinishedTasks().filter(function (task) {
      const diff = diffCalendarDays(task.dueDate);
      return diff >= 0 && diff <= 1;
    }).length;
    const tomorrowDue = unfinishedTasks().filter(function (task) {
      return diffCalendarDays(task.dueDate) === 1;
    }).length;
    const overdue = unfinishedTasks().filter(isOverdue).sort(function (a, b) {
      return dueSortValue(a).localeCompare(dueSortValue(b));
    });
    const mostOverdueLabel = overdue.length ? dueState(overdue[0]).label : "";
    return {
      counts: counts,
      todayDue: todayDue,
      oneDay: oneDay,
      tomorrowDue: tomorrowDue,
      mostOverdueLabel: mostOverdueLabel
    };
  }

  function searchableText(task) {
    const assignee = getPerson(task.assigneeId);
    return [task.title, task.description, task.code, task.category, task.source, assignee ? assignee.name : "", statusLabel(task)]
      .join(" ").toLowerCase();
  }

  function applyTaskFilters(tasks, options) {
    const opts = options || {};
    const search = (opts.search != null ? opts.search : ui.taskSearch).trim().toLowerCase();
    const ignoreStatus = opts.ignoreStatus === true;
    return tasks.filter(function (task) {
      if (!ignoreStatus && ui.taskStatus !== "all" && taskDisplayStatus(task) !== ui.taskStatus) return false;
      if (ui.taskAssignee !== "all" && task.assigneeId !== ui.taskAssignee) return false;
      if (ui.sourceFilter !== "all" && taskSource(task) !== ui.sourceFilter) return false;
      if (ui.taskType !== "all" && task.type !== ui.taskType) return false;
      if (ui.dueFilter === "upcoming" && !isUpcoming(task)) return false;
      if (ui.dueFilter === "overdue" && !isOverdue(task)) return false;
      if (search && searchableText(task).indexOf(search) === -1) return false;
      return true;
    });
  }

  function scopedTaskCounts() {
    const counts = { all: 0, pending: 0, in_progress: 0, review: 0, completed: 0 };
    const scoped = applyTaskFilters(state.tasks.slice(), { ignoreStatus: true });
    counts.all = scoped.length;
    scoped.forEach(function (task) {
      const key = taskDisplayStatus(task);
      if (counts[key] != null) counts[key] += 1;
    });
    return counts;
  }

  function defaultTaskAssignee() {
    return canManage() ? "all" : currentUser().id;
  }

  function resolveTaskAssignee(value) {
    if (value === "all") return "all";
    if (value) {
      const person = getPerson(value);
      if (person && person.active) return value;
    }
    return defaultTaskAssignee();
  }

  function filteredTasks() {
    return applyTaskFilters(state.tasks.slice()).sort(function (a, b) {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (b.status === "completed" && a.status !== "completed") return -1;
      if (a.status === "completed" && b.status === "completed") {
        return String(b.completedAt || b.updatedAt).localeCompare(String(a.completedAt || a.updatedAt));
      }
      const diff = dueSortValue(a).localeCompare(dueSortValue(b));
      if (diff !== 0) return diff;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });
  }

  function filteredArchiveTasks() {
    const search = ui.archiveSearch.trim().toLowerCase();
    return state.tasks.filter(function (task) {
      if (task.status !== "completed") return false;
      if (!search) return true;
      return searchableText(task).indexOf(search) !== -1;
    }).sort(function (a, b) {
      return String(b.completedAt || b.updatedAt).localeCompare(String(a.completedAt || a.updatedAt));
    });
  }

  function myAttentionTasks() {
    const user = currentUser();
    const mine = unfinishedTasks().filter(function (task) { return task.assigneeId === user.id; });
    if (!canManage()) return mine.sort(sortByDue);
    const reviews = unfinishedTasks().filter(function (task) { return task.status === "review"; });
    const otherMine = mine.filter(function (task) { return task.status !== "review"; });
    return reviews.concat(otherMine).sort(function (a, b) {
      if (a.status === "review" && b.status !== "review") return -1;
      if (b.status === "review" && a.status !== "review") return 1;
      return dueSortValue(a).localeCompare(dueSortValue(b));
    });
  }

  function reviewQueue() {
    return unfinishedTasks().filter(function (task) { return task.status === "review"; }).sort(sortByDue);
  }

  function remindableTasks() {
    return state.tasks.filter(function (task) {
      return task.status !== "completed" && (isUpcoming(task) || isOverdue(task) || task.status === "review");
    });
  }

  function notificationItems() {
    const user = currentUser();
    const map = new Map();
    if (canManage()) {
      reviewQueue().forEach(function (task) {
        map.set(task.id, { task: task, reason: "review" });
      });
    } else {
      unfinishedTasks().filter(function (task) {
        return task.assigneeId === user.id && task.status === "review";
      }).forEach(function (task) {
        map.set(task.id, { task: task, reason: "review" });
      });
    }

    unfinishedTasks().filter(function (task) {
      if (task.assigneeId !== user.id) return false;
      return isUpcoming(task) || isOverdue(task);
    }).forEach(function (task) {
      if (!map.has(task.id)) {
        map.set(task.id, { task: task, reason: isOverdue(task) ? "overdue" : "soon" });
      }
    });

    if (canManage()) {
      unfinishedTasks().filter(isOverdue).forEach(function (task) {
        if (!map.has(task.id)) map.set(task.id, { task: task, reason: "overdue" });
      });
    }

    return Array.from(map.values()).sort(function (a, b) {
      const weight = { overdue: 0, review: 1, soon: 2 };
      const wa = weight[a.reason] != null ? weight[a.reason] : 3;
      const wb = weight[b.reason] != null ? weight[b.reason] : 3;
      if (wa !== wb) return wa - wb;
      return dueSortValue(a.task).localeCompare(dueSortValue(b.task));
    });
  }

  function latestRejection(task) {
    if (!task) return null;
    const rejected = task.activity && task.activity.slice().reverse().find(function (item) { return item.action === "rejected"; });
    if (!rejected) return null;
    return { note: rejected.note || task.reviewNote || "", at: rejected.at, actorId: rejected.actorId };
  }

  function activityLabel(action) {
    const labels = {
      created: "创建了任务",
      started: "开始办理",
      submitted: "提交审核",
      withdrawn: "撤回审核",
      approved: "审核通过，任务办结",
      rejected: "审核退回",
      progress: "更新了任务进展",
      updated: "更新了任务信息",
      reassigned: "调整了责任人"
    };
    return labels[action] || "更新了任务";
  }

  function activityTone(action) {
    if (action === "approved") return "green";
    if (action === "rejected") return "red";
    if (action === "submitted") return "amber";
    if (action === "started") return "blue";
    if (action === "progress") return "blue";
    return "gray";
  }

  /* ---------------- 外壳与导航 ---------------- */

  function hydrateStaticIcons() {
    document.querySelectorAll("[data-icon]").forEach(function (el) {
      el.innerHTML = icon(el.getAttribute("data-icon"));
    });
  }

  function closePopovers() {
    document.querySelectorAll("details.popover-wrap[open]").forEach(function (details) {
      details.open = false;
    });
  }

  function notifyReasonLabel(reason) {
    if (reason === "review") return "待审核";
    if (reason === "overdue") return "已逾期";
    return "即将到期";
  }

  function renderNotifyPopover() {
    const items = notificationItems();
    const visible = items.slice(0, 6);
    let html = '<div class="notify-head"><strong>需要关注</strong><span>' + (items.length ? pluralTask(items.length) + "待处理" : "暂无提醒") + "</span></div>";
    if (!visible.length) {
      html += '<div class="empty-state" style="min-height:130px;padding:14px"><div class="empty-icon">' + icon("check-circle") + "</div><strong>暂时没有提醒</strong><p>到期前 3 天和 1 天会在这里提醒。</p></div>";
    } else {
      visible.forEach(function (item) {
        const task = item.task;
        const assignee = getPerson(task.assigneeId);
        let detail = "";
        if (item.reason === "review") {
          detail = "等待审核 · " + (assignee ? assignee.name : "责任人") + "提交";
        } else {
          const due = dueState(task);
          detail = due.label + " · " + (assignee ? assignee.name : "责任人");
        }
        html += '<button type="button" class="notify-item" data-action="open-task" data-id="' + escapeHtml(task.id) + '">' +
          '<span class="notify-dot ' + (item.reason === "review" ? "review" : item.reason) + '"></span>' +
          '<span class="notify-item-copy"><strong>' + escapeHtml(task.title) + "</strong><small>" + escapeHtml(notifyReasonLabel(item.reason) + " · " + detail) + "</small></span>" +
          "</button>";
      });
      html += '<div class="notify-footer"><button type="button" data-action="view-all-reminders">打开任务清单</button></div>';
    }
    const popover = document.getElementById("notify-popover");
    if (popover) popover.innerHTML = html;
    const badge = document.getElementById("notify-badge");
    if (badge) {
      badge.hidden = !items.length;
      badge.textContent = items.length > 9 ? "9+" : String(items.length);
    }
  }

  function renderUserPopover() {
    const user = currentUser();
    let html = '<div class="popover-heading">当前账号</div>';
    if (user) {
      html += '<div class="identity-option is-current">' + userAvatar(user) +
        '<span class="identity-copy"><strong>' + escapeHtml(user.name) + " · " + escapeHtml(user.title) + "</strong><small>" + (user.role === "manager" ? "管理与审核" : "任务办理") + "</small></span>" +
        '<span class="identity-check">' + icon("check") + "</span></div>";
    }
    html += '<div class="popover-divider"></div>';
    html += '<button type="button" class="popover-link" data-action="change-password">' + icon("lock") + "修改登录密码</button>";
    html += '<button type="button" class="popover-link" data-action="open-help">' + icon("help") + "使用说明</button>";
    html += '<button type="button" class="popover-link" data-action="logout-account">' + icon("logout") + "退出登录</button>";
    html += '<p class="popover-note">数据集中保存在主机，所有操作会即时保存。离开电脑前请退出登录。</p>';
    const popover = document.getElementById("user-popover");
    if (popover) popover.innerHTML = html;
  }

  function applyTheme(themeId) {
    const theme = THEMES.find(function (item) { return item.id === themeId; }) || THEMES[0];
    document.documentElement.setAttribute("data-theme", theme.id);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme.colors[0]);
  }

  function renderThemePopover() {
    const current = (state.settings && state.settings.theme) || "green";
    let html = '<div class="popover-heading">界面配色</div><div class="theme-options">';
    THEMES.forEach(function (theme) {
      const selected = theme.id === current;
      html += '<button type="button" class="theme-option' + (selected ? " is-current" : "") + '" data-action="set-theme" data-theme-id="' + theme.id + '" aria-pressed="' + (selected ? "true" : "false") + '">' +
        '<span class="theme-preview" aria-hidden="true">' + theme.colors.map(function (color) {
          return '<i style="background:' + color + '"></i>';
        }).join("") + "</span>" +
        '<span class="theme-option-copy"><strong>' + escapeHtml(theme.name) + "</strong><small>" + escapeHtml(theme.desc) + "</small></span>" +
        (selected ? '<span class="theme-check">' + icon("check") + "</span>" : "") +
        "</button>";
    });
    html += "</div><p class=\"popover-note\">配色会保存在当前浏览器，所有角色都可以切换。</p>";
    const popover = document.getElementById("theme-popover");
    if (popover) popover.innerHTML = html;
  }

  function setTheme(themeId) {
    const theme = THEMES.find(function (item) { return item.id === themeId; });
    if (!theme) return;
    state.settings.theme = theme.id;
    try { localStorage.setItem(THEME_KEY, theme.id); } catch (err) { /* ignore */ }
    applyTheme(theme.id);
    closePopovers();
    renderShell();
    toast("配色已切换", "当前使用「" + theme.name + "」。", "success");
  }

  function renderShell() {
    const user = currentUser();
    const counts = taskCounts();
    const pageTitle = ROUTE_TITLES[currentRoute] || "工作台";
    const pageTitleEl = document.getElementById("page-title");
    if (pageTitleEl) pageTitleEl.textContent = pageTitle;
    document.title = pageTitle + " · " + APP_NAME;

    const avatar = document.getElementById("current-avatar");
    if (avatar) avatar.innerHTML = userAvatar(user);
    const nameEl = document.getElementById("current-user-name");
    if (nameEl) nameEl.textContent = user ? user.name : "";
    const titleEl = document.getElementById("current-user-title");
    if (titleEl) titleEl.textContent = user ? (user.role === "manager" ? "管理与审核" : "任务办理") : "";

    const newButton = document.getElementById("topbar-new-task");
    if (newButton) newButton.hidden = !canCreateTasks();

    const settingsNav = document.getElementById("nav-settings");
    if (settingsNav) settingsNav.hidden = !canManage();

    const navCount = document.getElementById("nav-task-count");
    if (navCount) {
      const navUnfinished = canManage()
        ? counts.unfinished
        : state.tasks.filter(function (task) { return task.assigneeId === user.id && task.status !== "completed"; }).length;
      navCount.textContent = String(navUnfinished);
      navCount.hidden = navUnfinished === 0;
    }

    document.querySelectorAll(".nav-item[data-nav]").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-nav") === currentRoute);
    });

    renderUserPopover();
    renderNotifyPopover();
    renderThemePopover();
  }

  function setRoute(route) {
    currentRoute = route;
  }

  /* ---------------- 通用展示片段 ---------------- */

  function personInline(person, size) {
    if (!person) {
      return '<span class="person-inline">' + userAvatar(null, size || "sm") + "<span>未指派</span></span>";
    }
    return '<span class="person-inline">' + userAvatar(person, size || "sm") + "<span>" + escapeHtml(person.name) + "</span></span>";
  }

  function categoryPill(category) {
    return '<span class="category-pill category-tone-' + categoryTone(category) + '">' + escapeHtml(category || "综合事务") + "</span>";
  }

  function typePill(task) {
    if (task.type === "recurring") {
      return '<span class="type-pill recurring">周期' + (task.cycle ? " · " + CYCLE[task.cycle].label : "") + "</span>";
    }
    return '<span class="type-pill">一次性</span>';
  }

  function dueLabel(task, withDot) {
    const due = dueState(task);
    return '<span class="due-label ' + due.className + '">' + (withDot === false ? "" : '<span class="due-dot"></span>') + escapeHtml(due.label) + "</span>";
  }

  function taskSubline(task) {
    let detail = "";
    if (task.type === "recurring" && task.cycle) {
      detail = CYCLE[task.cycle].label + " · " + periodShortLabel(task.cycle, task.dueDate);
    } else if (task.description) {
      detail = truncate(task.description, 46);
    } else {
      detail = task.category || "";
    }
    return '<span class="task-subline"><span>' + escapeHtml(task.code || "") + '</span><span class="dot"></span><span>来源：' + escapeHtml(taskSource(task)) + '</span><span class="dot"></span><span class="task-sub-desc">' + escapeHtml(detail) + "</span></span>";
  }

  function taskStartLabel(task) {
    if (task.startedAt) return formatShortDateTime(task.startedAt);
    if (task.status === "pending") return "未开始";
    return "—";
  }

  function emptyState(iconName, title, description) {
    return '<div class="empty-state"><div class="empty-icon">' + icon(iconName) + "</div><strong>" + escapeHtml(title) + "</strong><p>" + escapeHtml(description || "") + "</p></div>";
  }

  function pageHead(title, description, actionsHtml, eyebrowHtml) {
    return '<div class="page-head"><div>' +
      (eyebrowHtml || "") +
      "<h1>" + escapeHtml(title) + "</h1><p>" + description + "</p></div>" +
      (actionsHtml ? '<div class="page-head-actions">' + actionsHtml + "</div>" : "") +
      "</div>";
  }

  function sectionHead(title, subtitle, linkAction, linkLabel) {
    return '<div class="section-head"><div class="section-title">' + escapeHtml(title) +
      (subtitle ? "<small>" + escapeHtml(subtitle) + "</small>" : "") +
      '</div><button type="button" class="panel-link" data-action="' + escapeHtml(linkAction) + '">' + escapeHtml(linkLabel) + icon("chevron-right") + "</button></div>";
  }

  /* ---------------- 工作台 ---------------- */

  function renderKpiCards() {
    const stats = dashboardStats();
    const counts = stats.counts;
    const cards = [
      {
        action: "filter-tasks",
        status: "all",
        tone: "green",
        label: "任务总数",
        value: counts.all,
        iconName: "tasks",
        foot: "已办结 <strong>" + counts.completed + "</strong> 项",
        attrs: ""
      },
      {
        action: "filter-tasks",
        status: "pending",
        tone: "slate",
        label: "待办",
        value: counts.pending,
        iconName: "inbox",
        foot: "等待开始办理",
        attrs: ""
      },
      {
        action: "filter-tasks",
        status: "in_progress",
        tone: "blue",
        label: "办理中",
        value: counts.in_progress,
        iconName: "play",
        foot: "正在推进办理",
        attrs: ""
      },
      {
        action: "filter-tasks",
        status: "review",
        tone: "amber",
        label: "待审核",
        value: counts.review,
        iconName: "shield",
        foot: "等待科长 / 主任科员确认",
        attrs: ""
      },
      {
        action: "filter-due",
        due: "upcoming",
        tone: "orange",
        label: "即将到期",
        value: counts.upcoming,
        iconName: "clock",
        foot: "今天 <strong>" + stats.todayDue + "</strong> 项 · 明天 <strong>" + stats.tomorrowDue + "</strong> 项",
        attrs: ""
      },
      {
        action: "filter-due",
        due: "overdue",
        tone: "red",
        label: "已逾期",
        value: counts.overdue,
        iconName: "alert-triangle",
        foot: stats.mostOverdueLabel ? "最久" + stats.mostOverdueLabel : "暂无逾期任务",
        attrs: ""
      }
    ];
    function renderCard(card) {
      return '<button type="button" class="kpi-card" data-tone="' + card.tone + '" data-action="' + card.action + '" data-status="' + (card.status || "all") + '" data-due="' + (card.due || "all") + '">' +
        '<span class="kpi-top"><span class="kpi-label">' + card.label + '</span><span class="kpi-icon">' + icon(card.iconName) + "</span></span>" +
        '<span class="kpi-content"><span class="kpi-value">' + card.value + '</span><span class="kpi-unit">项</span></span>' +
        '<span class="kpi-foot">' + card.foot + "</span>" +
        "</button>";
    }
    return '<div class="kpi-grid kpi-grid-primary">' + cards.slice(0, 4).map(renderCard).join("") + "</div>" +
      '<div class="kpi-grid kpi-grid-alert">' + cards.slice(4).map(renderCard).join("") + "</div>";
  }

  function renderDashboard() {
    const user = currentUser();
    const stats = dashboardStats();
    const counts = stats.counts;
    const today = new Date();
    const manager = canManage();

    const dueToday = stats.todayDue;
    const summaryParts = [];
    if (dueToday > 0) summaryParts.push("<strong>" + dueToday + "</strong> 项任务今天到期");
    if (stats.tomorrowDue > 0) summaryParts.push("<strong>" + stats.tomorrowDue + "</strong> 项明天到期");
    if (counts.review > 0) summaryParts.push("<strong>" + counts.review + "</strong> 项等待审核");
    if (counts.overdue > 0) summaryParts.push("<strong>" + counts.overdue + "</strong> 项已经逾期");
    const summary = summaryParts.length ? summaryParts.join("，") + "。" : "当前没有紧急事项，可以按计划推进工作。";

    const banner = "";

    const attention = manager && ui.attentionTab === "review" ? reviewQueue() : myAttentionTasks();
    const attentionRows = attention.slice(0, 5).map(function (task) {
      const owner = getPerson(task.assigneeId);
      const due = dueState(task);
      let reason = '<span class="attention-reason">我的任务</span>';
      if (task.status === "review") reason = '<span class="attention-reason review">待审核</span>';
      else if (due.key === "overdue") reason = '<span class="attention-reason overdue">已逾期</span>';
      else if (due.key === "today" || due.key === "urgent") reason = '<span class="attention-reason">紧急</span>';
      return '<button type="button" class="attention-row" data-action="open-task" data-id="' + escapeHtml(task.id) + '">' +
        '<span class="attention-copy"><span class="attention-title-line"><span class="attention-title">' + escapeHtml(task.title) + "</span>" + typePill(task) + "</span>" +
        '<span class="attention-meta">' + categoryPill(task.category) + '<span class="dot"></span>' + dueLabel(task) + '<span class="dot"></span><span>' + escapeHtml(task.code) + "</span></span></span>" +
        '<span class="attention-owner">' + userAvatar(owner, "sm") + escapeHtml(owner ? owner.name : "未指派") + "</span>" +
        '<span class="attention-state">' + reason + "</span></button>";
    }).join("");

    let attentionTabs = "";
    if (manager) {
      attentionTabs = '<div class="attention-tabs">' +
        '<button type="button" class="attention-tab' + (ui.attentionTab === "all" ? " active" : "") + '" data-action="attention-tab" data-tab="all">全部待处理</button>' +
        '<button type="button" class="attention-tab' + (ui.attentionTab === "review" ? " active" : "") + '" data-action="attention-tab" data-tab="review">待审核 ' + counts.review + "</button>" +
        "</div>";
    }

    const attentionPanel = '<section class="panel attention-panel"><div class="panel-head"><div class="section-title">' +
      (manager ? "需要我处理" : "我的待办") + '<small>' + attention.length + "</small></div>" + attentionTabs + "</div>" +
      (attentionRows
        ? '<div class="attention-list">' + attentionRows + "</div>" + '<div class="view-all-row"><button type="button" data-action="view-my-tasks">查看全部任务' + icon("chevron-right") + "</button></div>"
        : emptyState("check-circle", "暂时没有待处理事项", "当前没有需要你办理或审核的任务。")) +
      "</section>";

    const upcomingTasks = state.tasks.filter(isUpcoming).sort(sortByDue);
    const overdueTasks = state.tasks.filter(isOverdue).sort(sortByDue);

    function bandItem(task) {
      const due = dueState(task);
      const date = parseISODate(task.dueDate);
      const owner = getPerson(task.assigneeId);
      const reviewTag = task.status === "review" ? " · 待审核" : "";
      return '<button type="button" class="reminder-item reminder-band-item" data-action="open-task" data-id="' + escapeHtml(task.id) + '">' +
        '<span class="reminder-date ' + due.className + '"><strong>' + (date ? date.getDate() : "—") + "</strong><small>" + (date ? (date.getMonth() + 1) + "月" : "") + "</small></span>" +
        '<span class="reminder-copy"><strong>' + escapeHtml(task.title) + "</strong><small>" + escapeHtml(due.label) + " · " + escapeHtml(owner ? owner.name : "未指派") + reviewTag + "</small></span>" +
        "</button>";
    }

    const upcomingShown = upcomingTasks.slice(0, 4);
    const overdueShown = overdueTasks.slice(0, 2);
    const reminderBand = '<section class="panel reminder-band">' +
      '<div class="reminder-band-head"><div><div class="section-title">临期提醒<small>截止前 3 天</small></div>' +
      '<p class="reminder-band-sub">今天和明天到期的任务会重点标记，待审核任务同样纳入提醒。</p></div>' +
      '<div class="reminder-band-actions">' +
      (counts.review ? '<button type="button" class="reminder-review-link" data-action="filter-tasks" data-status="review" data-due="all">' + icon("shield") + "待审核 " + counts.review + "</button>" : "") +
      '<button type="button" class="panel-link" data-action="view-all-reminders">查看全部' + icon("chevron-right") + "</button></div></div>" +
      '<div class="reminder-band-body">' +
      '<div class="reminder-column"><div class="reminder-column-head"><div class="reminder-column-title"><span class="reminder-marker amber"></span>即将到期<b>' + counts.upcoming + "</b></div>" +
      (upcomingTasks.length > 4
        ? '<button type="button" class="reminder-more" data-action="filter-due" data-due="upcoming">还有 ' + (upcomingTasks.length - 4) + " 项</button>"
        : '<span class="reminder-column-hint">按截止时间排序</span>') +
      "</div>" +
      (upcomingShown.length
        ? '<div class="reminder-band-grid">' + upcomingShown.map(bandItem).join("") + "</div>"
        : '<div class="reminder-empty">' + icon("check-circle") + "近 3 天没有到期任务</div>") +
      "</div>" +
      '<div class="reminder-column reminder-column-overdue"><div class="reminder-column-head"><div class="reminder-column-title"><span class="reminder-marker red"></span>已逾期<b>' + counts.overdue + "</b></div>" +
      (overdueTasks.length > 2
        ? '<button type="button" class="reminder-more" data-action="filter-due" data-due="overdue">还有 ' + (overdueTasks.length - 2) + " 项</button>"
        : '<span class="reminder-column-hint">优先处理</span>') +
      "</div>" +
      (overdueShown.length
        ? '<div class="reminder-band-grid reminder-band-grid-single">' + overdueShown.map(bandItem).join("") + "</div>"
        : '<div class="reminder-empty">' + icon("check-circle") + "当前没有逾期任务</div>") +
      "</div></div></section>";

    const activeTemplates = state.templates.filter(function (template) { return template.active; });
    const recurringRows = activeTemplates.slice(0, 3).map(function (template) {
      const task = currentSeriesTask(template);
      const owner = getPerson(task ? task.assigneeId : template.assigneeId);
      const cycle = CYCLE[template.cycle];
      const due = task ? dueState(task) : null;
      return '<button type="button" class="recurring-mini" data-action="' + (task ? "open-task" : "go-recurring") + '" data-id="' + escapeHtml(task ? task.id : template.id) + '">' +
        '<span class="cycle-mark">' + cycle.short + "<span>周期</span></span>" +
        '<span class="recurring-mini-copy"><strong>' + escapeHtml(template.title) + "</strong><small>" + escapeHtml(cycle.label) + " · " + escapeHtml(owner ? owner.name : "未指派") + (task ? " · " + escapeHtml(due.label) : "") + "</small></span>" +
        '<span class="recurring-mini-state">' + (task ? statusPill(task) : '<span class="type-pill">待生成</span>') + "<small>" + (task ? escapeHtml(formatMonthDay(task.dueDate) + " " + formatDueTime(task)) + " 截止" : "下个周期") + "</small></span>" +
        "</button>";
    }).join("");

    const recurringPanel = '<section class="panel"><div class="panel-head"><div class="section-title">周期任务<small>' + activeTemplates.length + " 条规则</small></div><button type=\"button\" class=\"panel-link\" data-action=\"go-recurring\">管理" + icon("chevron-right") + "</button></div>" +
      (recurringRows ? '<div class="recurring-mini-list">' + recurringRows + "</div>" : emptyState("repeat", "还没有周期任务", "科长或主任科员可以新建按周、月、季度重复的任务。")) +
      "</section>";

    return '<div class="dashboard-head"><div class="dashboard-greeting">' +
      '<div class="date-line">' + todayLine() + " · 工作台</div>" +
      "<h1>" + greetingText() + "，" + escapeHtml(user ? user.name : "") + "</h1>" +
      "<p>" + summary + "</p></div>" +
      '<div class="dashboard-head-right"><span class="date-chip">' + icon("calendar") + "本周 " + escapeHtml(weekRangeLabel(today)) + "</span></div></div>" +
      banner +
      renderKpiCards() +
      reminderBand +
      '<div class="dashboard-grid"><div class="dashboard-main">' + attentionPanel + "</div>" +
      '<div class="dashboard-main">' + recurringPanel + "</div></div>";
  }

  /* ---------------- 日历看板 ---------------- */

  function calendarHolidayInfo(date) {
    const key = toISODate(date);
    const data = state.calendar && state.calendar.days ? state.calendar.days[key] : null;
    if (data) return { off: Boolean(data.off), label: data.off ? "休" : "班", name: data.name || "", special: true };
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    return { off: weekend, label: weekend ? "休" : "", name: "", special: false };
  }

  function calendarTasksFor(date) {
    const key = toISODate(date);
    return state.tasks.filter(function (task) { return task.dueDate === key; }).sort(sortByDue);
  }

  function calendarMonthLabel(year, month) {
    return year + "年" + (month + 1) + "月";
  }

  function shiftCalendar(monthDelta, yearDelta) {
    const base = new Date(ui.calendarYear + (yearDelta || 0), ui.calendarMonth + (monthDelta || 0), 1);
    ui.calendarYear = base.getFullYear();
    ui.calendarMonth = base.getMonth();
    ui.calendarSelectedDate = null;
    renderViewOnly();
  }

  function calendarStatus() {
    const cal = state.calendar;
    if (cal && Number(cal.year) === ui.calendarYear && cal.days && Object.keys(cal.days).length) {
      return '<span class="calendar-sync-status synced">' + icon("check-circle") + "已同步 " + ui.calendarYear + " 年</span>";
    }
    return '<span class="calendar-sync-status">' + icon("info") + "未同步 " + ui.calendarYear + " 年，暂按周末规则显示</span>";
  }

  function renderCalendarDay(date, month) {
    const dateKey = toISODate(date);
    const info = calendarHolidayInfo(date);
    const tasks = calendarTasksFor(date);
    const otherMonth = date.getMonth() !== month;
    const today = toISODate(new Date()) === dateKey;
    const selected = ui.calendarSelectedDate === dateKey;
    const classes = ["calendar-day"];
    if (otherMonth) classes.push("other-month");
    if (info.off) classes.push("is-off");
    if (info.special && !info.off) classes.push("is-makeup");
    if (today) classes.push("today");
    if (selected) classes.push("selected");
    const visible = tasks.slice(0, 3);
    return '<div class="' + classes.join(" ") + '" role="button" tabindex="0" data-action="calendar-day" data-date="' + dateKey + '" aria-label="' + calendarMonthLabel(date.getFullYear(), date.getMonth()) + date.getDate() + "日" + (info.name ? " " + info.name : "") + '">' +
      '<div class="calendar-day-head"><strong>' + date.getDate() + "</strong>" +
      (info.label ? '<span class="calendar-day-badge' + (info.off ? " off" : " work") + '">' + info.label + "</span>" : "") +
      (tasks.length ? '<span class="calendar-count">' + tasks.length + "</span>" : "") + "</div>" +
      (info.name ? '<span class="calendar-day-name">' + escapeHtml(info.name) + "</span>" : "") +
      '<div class="calendar-task-list">' + visible.map(function (task) {
        const displayStatus = taskDisplayStatus(task);
        return '<span class="calendar-task status-' + displayStatus + '" data-action="open-task" data-id="' + escapeHtml(task.id) + '" title="' + escapeHtml(task.title + " · " + statusLabel(task)) + '">' + escapeHtml(task.title) + "</span>";
      }).join("") + (tasks.length > 3 ? '<span class="calendar-more">还有 ' + (tasks.length - 3) + " 项</span>" : "") + "</div></div>";
  }

  function renderCalendarDayPanel() {
    const today = new Date();
    const todayKey = toISODate(today);
    const isCurrentMonth = ui.calendarYear === today.getFullYear() && ui.calendarMonth === today.getMonth();
    if (!ui.calendarSelectedDate && !isCurrentMonth) return "";
    const dateKey = ui.calendarSelectedDate || todayKey;
    const date = parseISODate(dateKey);
    if (!date) return "";
    const info = calendarHolidayInfo(date);
    const tasks = calendarTasksFor(date);
    return '<section class="calendar-day-panel"><div class="calendar-panel-head"><div><div class="section-title">' + escapeHtml(formatDateCN(date, { full: true, withWeekday: true })) +
      (info.name ? " · " + escapeHtml(info.name) : "") + '</div><small>' + (info.off ? "休息日" : "工作日") + " · " + tasks.length + " 项任务</small></div>" +
      '<button type="button" class="btn btn-sm btn-ghost" data-action="calendar-today">回到今天</button></div>' +
      (tasks.length ? '<div class="calendar-panel-list">' + tasks.map(function (task) {
        const owner = getPerson(task.assigneeId);
        return '<button type="button" class="calendar-panel-task" data-action="open-task" data-id="' + escapeHtml(task.id) + '">' +
          '<span class="calendar-panel-task-main"><strong>' + escapeHtml(task.title) + "</strong><small>" + escapeHtml(taskSource(task)) + " · " + escapeHtml(task.category || "") + "</small></span>" +
          '<span class="calendar-panel-task-side">' + userAvatar(owner, "sm") + "<span>" + escapeHtml(owner ? owner.name : "未指派") + "</span>" + statusPill(task) + "</span></button>";
      }).join("") + "</div>" : '<div class="calendar-panel-empty">' + icon("calendar") + "这一天没有任务。</div>") + "</section>";
  }

  function renderCalendar() {
    const year = ui.calendarYear;
    const month = ui.calendarMonth;
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < 42; i += 1) {
      days.push(new Date(year, month, 1 - offset + i));
    }
    const actions = '<div class="calendar-actions">' +
      '<button type="button" class="icon-button calendar-year-btn" data-action="calendar-prev-year" aria-label="上一年" title="上一年">«</button>' +
      '<button type="button" class="icon-button" data-action="calendar-prev" aria-label="上个月" title="上个月">' + icon("chevron-left") + "</button>" +
      '<strong class="calendar-month-label">' + escapeHtml(calendarMonthLabel(year, month)) + "</strong>" +
      '<button type="button" class="icon-button" data-action="calendar-next" aria-label="下个月" title="下个月">' + icon("chevron-right") + "</button>" +
      '<button type="button" class="icon-button calendar-year-btn" data-action="calendar-next-year" aria-label="下一年" title="下一年">»</button>' +
      '<button type="button" class="btn btn-sm" data-action="calendar-today">今天</button>' +
      (canManage() ? '<button type="button" class="btn btn-sm btn-soft" data-action="sync-holidays">' + icon("refresh") + "同步 " + year + " 年节假日</button>" +
        '<button type="button" class="btn btn-sm btn-ghost" data-action="trigger-holiday-import">导入 JSON</button>' : "") + "</div>";
    return pageHead("日历看板", "按截止日期查看全科任务；日历显示法定节假日和调休上班日，数据每年同步一次即可。", actions) +
      '<div class="calendar-toolbar">' + calendarStatus() +
      '<span class="calendar-legend"><span><i class="legend-dot off"></i>休息</span><span><i class="legend-dot work"></i>调休上班</span><span><i class="legend-dot today"></i>今天</span></span></div>' +
      '<div class="calendar-board"><div class="calendar-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
      '<div class="calendar-grid">' + days.map(function (day) { return renderCalendarDay(day, month); }).join("") + "</div></div>" +
      '<input type="file" id="holiday-file" accept=".json,application/json" hidden>' +
      renderCalendarDayPanel();
  }

  async function applyCalendarResponse(data) {
    await refreshState();
    if (data && data.calendar && Number(data.calendar.year) === ui.calendarYear) {
      state.calendar = data.calendar;
    }
    renderAll();
  }

  async function syncHolidays() {
    if (!canManage()) {
      toast("无权操作", "只有管理成员可以同步节假日。", "error");
      return;
    }
    const year = ui.calendarYear;
    try {
      toast("正在同步", "正在获取 " + year + " 年节假日数据……", "info");
      const data = await apiRequest("/api/calendar/sync", { method: "POST", json: { year: year } });
      await applyCalendarResponse(data);
      toast("节假日已同步", year + " 年放假和调休数据已保存。", "success");
    } catch (err) {
      toast("同步失败", err.message || ("当前网络无法获取 " + year + " 年数据，可导入年度 JSON 文件。"), "error");
    }
  }

  function importHolidayFile(file) {
    if (!file) return;
    if (!canManage()) {
      toast("无权操作", "只有管理成员可以导入节假日。", "error");
      return;
    }
    const year = ui.calendarYear;
    file.text().then(function (text) {
      let payload;
      try { payload = JSON.parse(text); } catch (err) { throw new Error("JSON 格式不正确"); }
      if (!payload || !Array.isArray(payload.days)) throw new Error("文件中缺少 days 数据");
      return apiRequest("/api/calendar/import", { method: "POST", json: { year: year, payload: payload } });
    }).then(function (data) {
      return applyCalendarResponse(data);
    }).then(function () {
      toast("节假日已导入", year + " 年放假和调休数据已保存。", "success");
    }).catch(function (err) {
      toast("导入失败", err.message || "请选择正确的年度 JSON 文件。", "error");
    });
  }

  /* ---------------- 任务清单 ---------------- */

  function taskRow(task) {
    const owner = getPerson(task.assigneeId);
    const due = dueState(task);
    const completed = task.status === "completed";
    const selectable = canManage();
    const selected = selectable && ui.selectedTaskIds && ui.selectedTaskIds.has(task.id);
    const duePrimary = completed ? "截止 " + formatMonthDay(task.dueDate) + " " + formatDueTime(task) : due.label;
    const dueClass = completed ? "done" : due.className;
    const small = completed && task.completedAt
      ? "办结 " + formatShortDateTime(task.completedAt)
      : formatDateCN(task.dueDate, { year: true }) + " " + formatDueTime(task);
    return '<div class="task-row' + (selected ? " selected" : "") + '" role="button" tabindex="0" data-action="open-task" data-id="' + escapeHtml(task.id) + '">' +
      '<span class="task-check-cell">' + (selectable ? '<input type="checkbox" class="task-check" data-id="' + escapeHtml(task.id) + '"' + (selected ? " checked" : "") + ' aria-label="选择任务 ' + escapeHtml(task.title) + '">' : "") + "</span>" +
      '<span class="task-main"><span class="task-name-line"><span class="task-name">' + escapeHtml(task.title) + "</span>" + typePill(task) + "</span>" + taskSubline(task) + "</span>" +
      '<span class="task-category-cell">' + categoryPill(task.category) + "</span>" +
      '<span class="task-owner">' + userAvatar(owner, "sm") + "<span>" + escapeHtml(owner ? owner.name : "未指派") + "</span></span>" +
      '<span class="task-start' + (task.startedAt ? "" : " muted") + '">' + escapeHtml(taskStartLabel(task)) + "</span>" +
      '<span class="task-due"><span class="due-label ' + dueClass + '">' + escapeHtml(duePrimary) + "</span><small>" + escapeHtml(small) + "</small></span>" +
      '<span class="task-status-cell">' + statusPill(task) + "</span>" +
      '<span class="task-chevron">' + icon("chevron-right") + "</span>" +
      "</div>";
  }

  function selectedTaskCount() {
    return ui.selectedTaskIds ? ui.selectedTaskIds.size : 0;
  }

  function selectionBar() {
    const count = selectedTaskCount();
    if (!canManage() || !count) return "";
    return '<div class="bulk-bar"><span>' + icon("check-circle") + "已选 <strong>" + count + "</strong> 项</span>" +
      '<button type="button" class="btn btn-sm btn-danger" data-action="bulk-delete">' + icon("trash") + "批量删除</button>" +
      '<button type="button" class="btn btn-sm btn-ghost" data-action="clear-task-selection">取消选择</button></div>';
  }

  function statusTabs() {
    const counts = scopedTaskCounts();
    const tabs = [
      { key: "all", label: "全部", count: counts.all },
      { key: "pending", label: "待办", count: counts.pending },
      { key: "in_progress", label: "办理中", count: counts.in_progress },
      { key: "review", label: "待审核", count: counts.review },
      { key: "completed", label: "已办结", count: counts.completed }
    ];
    return '<div class="status-tabs">' + tabs.map(function (tab) {
      return '<button type="button" class="status-tab' + (ui.taskStatus === tab.key ? " active" : "") + '" data-action="task-status" data-status="' + tab.key + '">' +
        tab.label + "<b>" + tab.count + "</b></button>";
    }).join("") + "</div>";
  }

  function assigneeOptions(selected, includeAll) {
    let html = includeAll ? '<option value="all">全部责任人</option>' : "";
    activePeople().forEach(function (person) {
      const isMe = person.id === state.currentUserId;
      html += '<option value="' + escapeHtml(person.id) + '"' + (selected === person.id ? " selected" : "") + ">" + escapeHtml(person.name) + (isMe ? "（我）" : "") + "</option>";
    });
    return html;
  }

  function currentTaskScopeLabel() {
    if (ui.taskAssignee === "all") return "全部责任人";
    const person = getPerson(ui.taskAssignee);
    if (!person) return "全部责任人";
    return person.id === state.currentUserId ? "我的任务" : person.name + "的任务";
  }

  function taskToolbar() {
    return '<div class="task-toolbar">' + statusTabs() +
      '<div class="task-filters">' +
      '<div class="search-field">' + icon("search") + '<input id="task-search" type="search" placeholder="搜索任务名称、编号或责任人" value="' + escapeHtml(ui.taskSearch) + '" autocomplete="off"></div>' +
      '<select class="filter-select" id="filter-assignee" aria-label="按责任人筛选">' + assigneeOptions(ui.taskAssignee, true) + "</select>" +
      '<select class="filter-select" id="filter-source" aria-label="按任务来源筛选">' + sourceOptions(ui.sourceFilter, true) + "</select>" +
      '<select class="filter-select" id="filter-type" aria-label="按任务类型筛选">' +
      '<option value="all">全部类型</option><option value="one-time"' + (ui.taskType === "one-time" ? " selected" : "") + ">一次性任务</option><option value=\"recurring\"" + (ui.taskType === "recurring" ? " selected" : "") + ">周期任务</option></select>" +
      '<select class="filter-select" id="filter-due" aria-label="按到期情况筛选">' +
      '<option value="all">全部截止</option><option value="upcoming"' + (ui.dueFilter === "upcoming" ? " selected" : "") + ">即将到期</option><option value=\"overdue\"" + (ui.dueFilter === "overdue" ? " selected" : "") + ">已逾期</option></select>" +
      '<button type="button" class="filter-reset" data-action="reset-task-filters">重置</button>' +
      "</div></div>";
  }

  function exportMenu() {
    if (!ui.exportOpen) return "";
    const filtered = filteredTasks();
    return '<div class="export-menu">' +
      '<button type="button" class="export-option" data-action="export" data-scope="all">' + icon("tasks") + '全部任务<small>' + state.tasks.length + " 项</small></button>" +
      '<button type="button" class="export-option" data-action="export" data-scope="open">' + icon("clock") + '未办结任务<small>' + taskCounts().unfinished + " 项</small></button>" +
      '<button type="button" class="export-option" data-action="export" data-scope="completed">' + icon("check-circle") + '已办结任务<small>' + taskCounts().completed + " 项</small></button>" +
      '<button type="button" class="export-option" data-action="export" data-scope="filtered">' + icon("filter") + '当前筛选结果<small>' + filtered.length + " 项</small></button>" +
      "</div>";
  }

  function renderTaskListRegion() {
    const tasks = filteredTasks();
    const scope = currentTaskScopeLabel();
    const canClearScope = !canManage() && ui.taskAssignee !== "all";
    const countText = '<div class="task-list-meta"><span>共 <strong>' + tasks.length + "</strong> 项任务" +
      ' · <span class="scope-label">当前：' + escapeHtml(scope) + "</span>" +
      (canClearScope ? '<button type="button" class="scope-switch" data-action="view-all-tasks">查看全员</button>' : "") +
      (ui.taskSearch ? ' · 搜索“' + escapeHtml(ui.taskSearch) + "”" : "") +
      "</span><span>" + (ui.taskStatus === "completed" ? "按办结时间排序" : "按截止时间排序") + "</span></div>";
    if (!tasks.length) {
      return countText + '<div class="task-table">' + emptyState("search", "没有找到符合条件的任务", "可以调整筛选条件，或点击“重置”恢复默认范围。") + "</div>";
    }
    const allSelected = tasks.length > 0 && tasks.every(function (task) { return ui.selectedTaskIds.has(task.id); });
    return countText + selectionBar() + '<div class="task-table">' +
      '<div class="task-row-head"><span class="task-check-cell">' + (canManage() ? '<input type="checkbox" class="task-select-all"' + (allSelected ? " checked" : "") + ' aria-label="全选当前任务">' : "") + '</span><span>任务</span><span>分类</span><span>责任人</span><span>开始时间</span><span>截止 / 办结</span><span>状态</span><span></span></div>' +
      tasks.map(taskRow).join("") + "</div>";
  }

  function renderTasks() {
    const actions = '<div class="export-wrap">' +
      '<button type="button" class="btn" data-action="toggle-export">' + icon("export") + "导出 Excel" + icon("chevron-down") + "</button>" +
      exportMenu() + "</div>" +
      (canCreateTasks() ? '<button type="button" class="btn btn-primary" data-action="new-task">' + icon("plus") + "新建任务</button>" : "");
    const description = canManage()
      ? "集中查看全部任务，可按责任人筛选；责任人只能更新自己负责的任务，审核由管理成员完成。"
      : "默认只显示由你负责的任务，可新建仅由本人负责的任务，也可切换责任人查看其他成员。";
    return pageHead("任务清单", description, actions) +
      taskToolbar() +
      '<div id="task-list-region">' + renderTaskListRegion() + "</div>";
  }

  /* ---------------- 周期任务 ---------------- */

  function seriesHistoryList(template, items, limit) {
    const sorted = items.slice().sort(function (a, b) {
      return String(b.dueDate).localeCompare(String(a.dueDate));
    });
    const visible = limit ? sorted.slice(0, limit) : sorted;
    if (!visible.length) return '<div class="series-empty">还没有历史期次，本期办结后会在此保留记录。</div>';
    return '<div class="history-dots">' + visible.map(function (task) {
      return '<button type="button" class="history-period" data-action="open-task" data-id="' + escapeHtml(task.id) + '" title="' + escapeHtml(task.title + " · " + task.dueDate) + '">' +
        "<small>" + escapeHtml(periodShortLabel(template.cycle, task.dueDate)) + "</small>" + statusPill(task) + "</button>";
    }).join("") + "</div>";
  }

  function renderRecurringCard(template) {
    const current = currentSeriesTask(template);
    const cycle = CYCLE[template.cycle];
    const owner = getPerson(current ? current.assigneeId : template.assigneeId);
    const allInstances = tasksBySeries(template.id).length;
    const history = tasksBySeries(template.id).filter(function (task) {
      return !current || task.periodKey !== current.periodKey;
    });
    return '<article class="series-card' + (template.active ? "" : " series-paused") + '">' +
      '<div class="series-head"><span class="cycle-mark">' + cycle.short + "<span>周期</span></span>" +
      '<div class="series-title-wrap"><div class="series-kicker"><span class="cycle-pill type-pill recurring">' + cycle.label + "生成</span>" +
      (template.active ? '<span class="type-pill">运行中</span>' : '<span class="type-pill">已暂停</span>') + "</div>" +
      '<h3 class="series-title">' + escapeHtml(template.title) + "</h3>" +
      '<p class="series-desc">' + escapeHtml(template.description) + "</p></div>" +
      "</div>" +
      '<div class="series-body"><div class="series-current-label"><span>本期 · ' + escapeHtml(periodLabel(template.cycle, current ? current.dueDate : new Date())) + "</span>" +
      "<strong>" + (current ? "已生成" : template.active ? "待生成" : "已暂停") + "</strong></div>" +
      '<div class="series-current">' + (current
        ? '<span class="series-current-title">' + escapeHtml(current.title) + '</span><span class="person-inline">' + userAvatar(owner, "sm") + "<span>" + escapeHtml(owner ? owner.name : "") + "</span></span>" + statusPill(current.status) + dueLabel(current)
        : '<span class="series-current-title">本期任务尚未生成，系统将在周期开始后自动创建。</span><span class="type-pill">等待中</span>') +
      "</div></div>" +
      '<div class="series-history"><div class="series-history-head"><span>历史期次 · 共 ' + history.length + " 期</span>" +
      (allInstances > 1 ? '<button type="button" data-action="series-history" data-id="' + escapeHtml(template.id) + '">查看全部</button>' : "") +
      "</div>" + seriesHistoryList(template, history, 4) + "</div>" +
      '<div class="series-foot"><div class="series-foot-meta">' + userAvatar(owner, "sm") + "责任人 " + escapeHtml(owner ? owner.name : "未指派") + " · 来源 " + escapeHtml(taskSource(template)) + " · 共 " + allInstances + " 期</div>" +
      '<div class="series-foot-actions">' +
      (current ? '<button type="button" class="btn btn-sm" data-action="open-task" data-id="' + escapeHtml(current.id) + '">查看本期</button>' : '<button type="button" class="btn btn-sm" disabled>等待生成</button>') +
      (canManage() ? '<button type="button" class="btn btn-sm btn-ghost" data-action="toggle-series" data-id="' + escapeHtml(template.id) + '">' + (template.active ? "暂停周期" : "恢复周期") + "</button>" : "") +
      "</div></div></article>";
  }

  function renderRecurring() {
    const cycleOrder = { weekly: 0, monthly: 1, quarterly: 2 };
    const templates = state.templates.slice().sort(function (a, b) {
      if (a.active !== b.active) return a.active ? -1 : 1;
      const orderDiff = (cycleOrder[a.cycle] != null ? cycleOrder[a.cycle] : 9) - (cycleOrder[b.cycle] != null ? cycleOrder[b.cycle] : 9);
      if (orderDiff !== 0) return orderDiff;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });
    const activeCount = templates.filter(function (t) { return t.active; }).length;
    const totalInstances = state.tasks.filter(function (task) { return task.type === "recurring"; }).length;
    const currentOpen = templates.filter(function (template) {
      const task = currentSeriesTask(template);
      return task && task.status !== "completed";
    }).length;
    const actions = canManage() ? '<button type="button" class="btn btn-primary" data-action="new-task" data-type="recurring">' + icon("plus") + "新建周期任务</button>" : "";
    const summary = '<div class="recurring-summary">' +
      '<span class="summary-chip">' + icon("repeat") + "运行中 <strong>" + activeCount + "</strong> 条规则</span>" +
      '<span class="summary-chip">' + icon("clock") + "本期未办结 <strong>" + currentOpen + "</strong> 项</span>" +
      '<span class="summary-chip">' + icon("archive") + "各期记录 <strong>" + totalInstances + "</strong> 条</span></div>";
    const grid = templates.length
      ? '<div class="recurring-grid">' + templates.map(renderRecurringCard).join("") + "</div>"
      : '<section class="panel">' + emptyState("repeat", "还没有周期任务", canManage() ? "点击右上角“新建周期任务”，设置按周、月或季度自动生成。" : "等待科长或主任科员创建周期任务。") + "</section>";
    return pageHead("周期任务", "每期任务在截止日前 5 个工作日生成，每期独立流转、独立留档；暂停规则不会影响已经生成的任务。", actions) +
      summary + grid;
  }

  /* ---------------- 归档 ---------------- */

  function renderArchiveRegion() {
    const tasks = filteredArchiveTasks();
    if (!tasks.length) {
      return '<div class="task-table">' + emptyState("archive", ui.archiveSearch ? "没有找到匹配的归档任务" : "还没有已办结任务", ui.archiveSearch ? "尝试更换关键词。" : "任务审核通过后会进入归档，按办结时间保留记录。") + "</div>";
    }
    const groups = {};
    tasks.forEach(function (task) {
      const key = String(task.completedAt || task.updatedAt).slice(0, 7);
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    });
    return Object.keys(groups).sort().reverse().map(function (key) {
      const groupDate = key + "-01";
      return '<div class="task-group-label">' + escapeHtml(formatMonth(groupDate)) + " · " + groups[key].length + " 项</div>" +
        '<div class="task-table">' +
        '<div class="task-row-head"><span class="task-check-cell">' + (canManage() ? '<input type="checkbox" class="task-select-all" aria-label="全选已归档任务">' : "") + '</span><span>任务</span><span>分类</span><span>责任人</span><span>开始时间</span><span>截止 / 办结</span><span>状态</span><span></span></div>' +
        groups[key].map(taskRow).join("") + "</div>";
    }).join("");
  }

  function renderArchive() {
    const completedCount = state.tasks.filter(function (task) { return task.status === "completed"; }).length;
    const periodicCount = state.tasks.filter(function (task) { return task.status === "completed" && task.type === "recurring"; }).length;
    const actions = '<button type="button" class="btn" data-action="export" data-scope="completed">' + icon("export") + "导出已办结</button>" +
      '<button type="button" class="btn btn-primary" data-action="open-report">' + icon("report") + "工作报送</button>";
    return pageHead("任务归档", "一次性任务办结后自动归档；周期任务按期保留历史记录，所有归档任务仍可查看与检索。", actions) +
      '<div class="recurring-summary"><span class="summary-chip">' + icon("archive") + "已归档 <strong>" + completedCount + "</strong> 项</span><span class=\"summary-chip\">" + icon("repeat") + "其中周期任务 <strong>" + periodicCount + "</strong> 项</span></div>" +
      '<div class="task-filters" style="padding:0 0 14px"><div class="search-field">' + icon("search") + '<input id="archive-search" type="search" placeholder="搜索已归档任务" value="' + escapeHtml(ui.archiveSearch) + '" autocomplete="off"></div></div>' +
      selectionBar() +
      '<div id="archive-region" class="archive">' + renderArchiveRegion() + "</div>";
  }

  /* ---------------- 工作报送 ---------------- */

  function reportRange(mode) {
    const today = startOfDay(new Date());
    let start;
    let end;
    if (mode === "last-month") {
      const prev = addMonths(today, -1);
      start = startOfMonth(prev);
      end = endOfMonth(prev);
    } else if (mode === "custom") {
      const startInput = document.getElementById("report-start");
      const endInput = document.getElementById("report-end");
      start = startInput && startInput.value ? parseISODate(startInput.value) : null;
      end = endInput && endInput.value ? parseISODate(endInput.value) : null;
      if (!start || !end) return null;
      if (start.getTime() > end.getTime()) {
        const swap = start;
        start = end;
        end = swap;
      }
    } else {
      start = addDays(weekStart(today), -7);
      end = addDays(weekStart(today), -1);
    }
    const finish = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
    return { start: startOfDay(start), end: finish };
  }

  function formatReportRange(range) {
    if (!range) return "请选择日期范围";
    const start = range.start;
    const end = range.end;
    const startText = start.getFullYear() + "年" + (start.getMonth() + 1) + "月" + start.getDate() + "日";
    const endText = (start.getFullYear() === end.getFullYear() ? "" : end.getFullYear() + "年") +
      (end.getMonth() + 1) + "月" + end.getDate() + "日";
    return startText + "—" + endText;
  }

  function reportFormValues() {
    const period = document.getElementById("report-period");
    const scope = document.getElementById("report-scope");
    const open = document.getElementById("report-include-open");
    return {
      mode: period ? period.value : "last-week",
      scope: scope ? scope.value : (canManage() ? "all" : "me"),
      includeOpen: Boolean(open && open.checked)
    };
  }

  function inReportRange(value, range) {
    if (!value || !range) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date >= range.start && date <= range.end;
  }

  function reportTaskResult(task) {
    const results = (task.progress || []).filter(function (entry) { return entry.type === "result" && entry.content; });
    if (results.length) return results[results.length - 1].content;
    if (task.reviewNote && task.reviewNote !== "审核通过") return task.reviewNote;
    return "已办结";
  }

  function collectReportData(values) {
    const range = reportRange(values.mode);
    if (!range) return { range: null, completed: [], open: [] };
    const scopeId = values.scope === "me" ? state.currentUserId : null;
    const completed = state.tasks.filter(function (task) {
      if (task.status !== "completed" || !inReportRange(task.completedAt, range)) return false;
      return !scopeId || task.assigneeId === scopeId;
    }).sort(function (a, b) {
      return String(a.completedAt).localeCompare(String(b.completedAt));
    });
    let open = [];
    if (values.includeOpen) {
      open = state.tasks.filter(function (task) {
        if (task.status === "completed") return false;
        if (scopeId && task.assigneeId !== scopeId) return false;
        const touched = [task.startedAt, task.createdAt].concat((task.progress || []).map(function (entry) { return entry.at; }));
        return touched.some(function (value) { return inReportRange(value, range); });
      }).sort(sortByDue);
    }
    return { range: range, completed: completed, open: open };
  }

  function reportGroups(data) {
    const order = state.categories.map(function (cat) { return cat.name; });
    const groups = {};
    data.completed.forEach(function (task) {
      const key = task.category || "其他事务";
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    });
    return Object.keys(groups).sort(function (a, b) {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }).map(function (name) {
      return { name: name, tasks: groups[name] };
    });
  }

  function reportPreviewHtml(data) {
    if (!data.range) return '<div class="report-empty">请选择完整的起止日期。</div>';
    if (!data.completed.length && !data.open.length) {
      return '<div class="report-empty">该周期暂无可报送的办理事项。可以切换周期，或勾选“附本周期在办事项”。</div>';
    }
    const groups = reportGroups(data);
    const chips = groups.map(function (group) {
      return '<span class="summary-chip">' + escapeHtml(group.name) + " <strong>" + group.tasks.length + "</strong></span>";
    }).join("");
    const list = groups.map(function (group) {
      return '<div class="report-preview-group"><strong>' + escapeHtml(group.name) + "</strong>" +
        group.tasks.map(function (task) {
          const owner = getPerson(task.assigneeId);
          return '<div class="report-preview-item"><span>' + escapeHtml(task.title) + "</span><small>" +
            escapeHtml((owner ? owner.name : "未指派") + " · " + formatShortDateTime(task.completedAt) + " · " + taskSource(task)) + "</small></div>";
        }).join("") + "</div>";
    }).join("");
    return '<div class="report-preview-summary">' + icon("check-circle") + "已办结 <strong>" + data.completed.length + "</strong> 项" +
      (data.open.length ? "，附在办 <strong>" + data.open.length + "</strong> 项" : "") + " · " + escapeHtml(formatReportRange(data.range)) + "</div>" +
      (chips ? '<div class="report-chip-row">' + chips + "</div>" : "") + list +
      (data.open.length ? '<div class="report-preview-group"><strong>本周期在办事项</strong>' + data.open.map(function (task) {
        const owner = getPerson(task.assigneeId);
        return '<div class="report-preview-item"><span>' + escapeHtml(task.title) + "</span><small>" +
          escapeHtml((owner ? owner.name : "未指派") + " · " + statusLabel(task)) + "</small></div>";
      }).join("") + "</div>" : "");
  }

  function refreshReportPreview() {
    const target = document.getElementById("report-preview");
    if (!target) return;
    const values = reportFormValues();
    const custom = document.getElementById("report-custom-range");
    if (custom) custom.hidden = values.mode !== "custom";
    target.innerHTML = reportPreviewHtml(collectReportData(values));
  }

  function reportModal() {
    const isManager = canManage();
    const form = '<form id="report-form">' +
      modalHead("工作报送", "按自然周或自然月汇总已办结工作，生成可直接修改上报的 Word 报送稿和 Excel 明细。") +
      '<div class="modal-body">' +
      '<div class="form-section"><div class="form-grid">' +
      '<div class="form-field"><label for="report-period">统计周期</label><select id="report-period" name="period">' +
      '<option value="last-week">上周（周一至周日）</option><option value="last-month">上月（自然月）</option><option value="custom">自定义日期</option></select></div>' +
      '<div class="form-field"><label for="report-scope">统计范围</label><select id="report-scope" name="scope">' +
      '<option value="all"' + (isManager ? " selected" : "") + '>全科</option><option value="me"' + (isManager ? "" : " selected") + '>仅本人</option></select></div>' +
      '<div class="form-field full" id="report-custom-range" hidden><div class="form-grid"><div class="form-field"><label for="report-start">开始日期</label><input id="report-start" type="date"></div><div class="form-field"><label for="report-end">结束日期</label><input id="report-end" type="date"></div></div></div>' +
      '<div class="form-field full"><label class="report-check"><input type="checkbox" id="report-include-open"><span>附本周期在办事项</span><small>除已办结工作外，附上本周期有进展但尚未办结的任务。</small></label></div>' +
      "</div></div>" +
      '<div id="report-preview" class="report-preview"></div>' +
      "</div>" +
      '<div class="modal-foot"><span class="foot-spacer"></span><button type="button" class="btn" data-action="close-modal">取消</button>' +
      '<button type="button" class="btn" data-action="report-export-excel">' + icon("export") + "导出 Excel 明细</button>" +
      '<button type="button" class="btn btn-primary" data-action="report-export-word">' + icon("report") + "导出 Word 报送稿</button></div>" +
      "</form>";
    openModal(form, { label: "工作报送", size: "modal-lg" });
    setTimeout(refreshReportPreview, 20);
  }

  function exportWorkReport(format) {
    const values = reportFormValues();
    const data = collectReportData(values);
    if (!data.range) {
      toast("请选择日期范围", "", "error");
      return;
    }
    if (!data.completed.length && !data.open.length) {
      toast("没有可报送的事项", "该周期暂无可导出的办理记录。", "info");
      return;
    }
    const rangeText = formatReportRange(data.range);
    const modeLabel = values.mode === "last-week" ? "上周" : values.mode === "last-month" ? "上月" : "本周期";
    const title = "开发区科" + modeLabel + "工作完成情况";
    const summary = "本周期共办结工作 " + data.completed.length + " 项" +
      (data.open.length ? "，另有在办事项 " + data.open.length + " 项" : "") + "。";
    const groups = reportGroups(data);
    const sections = groups.map(function (group) {
      return {
        heading: group.name + "（" + group.tasks.length + "项）",
        items: group.tasks.map(function (task) {
          const owner = getPerson(task.assigneeId);
          return {
            title: task.title,
            meta: "责任人：" + (owner ? owner.name : "未指派") + "｜开始：" + (task.startedAt ? formatShortDateTime(task.startedAt) : "未开始") + "｜完成：" + formatShortDateTime(task.completedAt) + "｜来源：" + taskSource(task),
            result: reportTaskResult(task)
          };
        })
      };
    });
    if (data.open.length) {
      sections.push({
        heading: "本周期在办事项（" + data.open.length + "项）",
        items: data.open.map(function (task) {
          const owner = getPerson(task.assigneeId);
          const last = (task.progress || []).slice().reverse().find(function (entry) { return entry.content; });
          return {
            title: task.title,
            meta: "责任人：" + (owner ? owner.name : "未指派") + "｜状态：" + statusLabel(task) + "｜开始：" + (task.startedAt ? formatShortDateTime(task.startedAt) : "未开始") + "｜来源：" + taskSource(task),
            result: last ? last.content : "正在推进"
          };
        })
      });
    }
    const stamp = toISODate(new Date()).replace(/-/g, "");
    try {
      if (format === "word") {
        const lib = window.DocxExport;
        if (!lib || typeof lib.buildReport !== "function") throw new Error("Word 组件未加载");
        const bytes = lib.buildReport({
          title: title,
          subtitle: rangeText,
          summary: summary,
          sections: sections,
          footer: "科务看板自动生成 · " + formatDateCN(new Date(), { full: true })
        });
        downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
          "开发区科工作报送_" + stamp + ".docx");
        toast("Word 报送稿已导出", "共 " + data.completed.length + " 项已办结工作，可直接修改后上报。", "success");
      } else {
        const lib = window.XlsxExport;
        if (!lib || typeof lib.buildWorkbook !== "function") throw new Error("Excel 组件未加载");
        const rows = [];
        data.completed.forEach(function (task) {
          const owner = getPerson(task.assigneeId);
          rows.push([
            rows.length + 1, "已办结", excelDateTime(task.completedAt), excelDateTime(task.startedAt), task.category || "",
            taskSource(task), task.title, owner ? owner.name : "未指派", reportTaskResult(task), task.code || ""
          ]);
        });
        data.open.forEach(function (task) {
          const owner = getPerson(task.assigneeId);
          const last = (task.progress || []).slice().reverse().find(function (entry) { return entry.content; });
          rows.push([
            rows.length + 1, "在办", "", excelDateTime(task.startedAt), task.category || "",
            taskSource(task), task.title, owner ? owner.name : "未指派", last ? last.content : "正在推进", task.code || ""
          ]);
        });
        const bytes = lib.buildWorkbook({
          sheetName: "工作报送",
          headers: ["序号", "办理状态", "完成时间", "开始时间", "工作分类", "任务来源", "工作事项", "责任人", "办理结果", "任务编号"],
          rows: rows,
          widths: [6, 10, 17, 17, 11, 12, 38, 10, 44, 15]
        });
        downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          "开发区科工作报送_" + stamp + ".xlsx");
        toast("Excel 明细已导出", "共 " + rows.length + " 项工作，含办理结果和任务来源。", "success");
      }
      closeModal();
    } catch (err) {
      console.error(err);
      toast("导出失败", err.message || "生成报送文件时出现错误。", "error");
    }
  }

  /* ---------------- 系统设置 ---------------- */

  function backupReasonLabel(reason) {
    if (reason === "auto") return "自动备份";
    if (reason === "manual") return "手动备份";
    if (reason === "pre-restore") return "恢复前快照";
    return "数据库快照";
  }

  function formatBytes(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return size + " B";
    if (size < 1024 * 1024) return (size / 1024).toFixed(0) + " KB";
    return (size / 1024 / 1024).toFixed(1) + " MB";
  }

  function renderPeopleRows() {
    const sorted = state.people.slice().sort(function (a, b) {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (a.role !== b.role) return a.role === "manager" ? -1 : 1;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });
    return sorted.map(function (person) {
      const openCount = state.tasks.filter(function (task) {
        return task.assigneeId === person.id && task.status !== "completed";
      }).length;
      const isSelf = person.id === state.currentUserId;
      const isLastManager = person.role === "manager" && person.active && state.people.filter(function (p) { return p.active && p.role === "manager"; }).length <= 1;
      return '<tr class="' + (person.active ? "" : "inactive-person") + '">' +
        '<td><div class="person-cell">' + userAvatar(person) +
        '<span class="person-cell-copy"><strong>' + escapeHtml(person.name) + (isSelf ? "（我）" : "") + "</strong><small>" + escapeHtml(person.title) + "</small></span></div></td>" +
        '<td><span class="role-tag ' + (person.role === "manager" ? "manager" : "staff") + '">' + (person.role === "manager" ? "管理与审核" : "任务办理") + "</span></td>" +
        '<td><span class="person-status' + (person.active ? "" : " inactive") + '">' + (person.active ? "在用" : "已停用") + "</span></td>" +
        '<td>' + (openCount ? openCount + " 项" : "—") + "</td>" +
        '<td><div class="person-actions"><button type="button" data-action="edit-person" data-id="' + escapeHtml(person.id) + '">编辑</button>' +
        (person.active
          ? '<button type="button" class="danger" data-action="toggle-person" data-id="' + escapeHtml(person.id) + '"' + (isSelf || isLastManager ? ' title="' + (isSelf ? "不能停用当前登录成员" : "至少保留一名在用管理人员") + '"' : "") + ">" + (isSelf || isLastManager ? "停用" : "停用") + "</button>"
          : '<button type="button" data-action="toggle-person" data-id="' + escapeHtml(person.id) + '">启用</button>') +
        "</div></td></tr>";
    }).join("");
  }

  function renderSnapshots() {
    if (!backups.length) {
      return '<div class="snapshot-list"><div class="snapshot-row"><span class="snapshot-copy"><strong>还没有主机备份</strong><small>点击“立即备份”创建第一份数据库快照</small></span></div></div>';
    }
    return '<div class="snapshot-list">' + backups.slice(0, 5).map(function (backup) {
      return '<div class="snapshot-row"><span class="snapshot-icon">' + icon("database") + "</span>" +
        '<span class="snapshot-copy"><strong>' + escapeHtml(backupReasonLabel(backup.reason)) + " · " + escapeHtml(formatShortDateTime(backup.createdAt)) + "</strong><small>" +
        escapeHtml(formatBytes(backup.size)) + " · " + escapeHtml(backup.fileName || backup.id) + "</small></span>" +
        '<button type="button" class="btn" data-action="download-snapshot" data-id="' + escapeHtml(backup.id) + '">下载</button>' +
        '<button type="button" class="btn" data-action="restore-snapshot" data-id="' + escapeHtml(backup.id) + '">恢复</button></div>';
    }).join("") + "</div>";
  }

  function renderCategoryRows() {
    const activeCount = state.categories.filter(function (cat) { return cat.active; }).length;
    return state.categories.map(function (cat) {
      const taskCount = state.tasks.filter(function (task) { return task.category === cat.name; }).length;
      const lastActive = cat.active && activeCount <= 1;
      return '<div class="category-row' + (cat.active ? "" : " is-inactive") + '">' +
        categoryPill(cat.name) +
        '<span class="category-count">' + (taskCount ? taskCount + " 项任务" : "暂无任务") + "</span>" +
        '<span class="category-state">' + (cat.active ? "启用中" : "已停用") + "</span>" +
        '<div class="category-actions">' +
        '<button type="button" data-action="edit-category" data-name="' + escapeHtml(cat.name) + '">重命名</button>' +
        '<button type="button" class="' + (cat.active ? "danger" : "") + '" data-action="toggle-category" data-name="' + escapeHtml(cat.name) + '"' +
        (lastActive ? ' title="至少保留一个启用中的分类"' : "") + ">" + (cat.active ? "停用" : "启用") + "</button>" +
        '<button type="button" class="danger" data-action="delete-category" data-name="' + escapeHtml(cat.name) + '">删除</button>' +
        "</div></div>";
    }).join("");
  }

  function renderRecycleRows() {
    const deleted = (state.deletedTasks || []).slice().sort(function (a, b) {
      return String(b.deletedAt).localeCompare(String(a.deletedAt));
    });
    if (!deleted.length) {
      return '<div class="recycle-empty">回收站为空，删除的任务会在这里保留 30 天。</div>';
    }
    return '<div class="recycle-list">' + deleted.map(function (task) {
      const person = getPerson(task.deletedBy);
      return '<div class="recycle-row"><div class="recycle-copy"><strong>' + escapeHtml(task.title) + "</strong><small>" +
        escapeHtml(task.code || "") + " · " + escapeHtml(formatShortDateTime(task.deletedAt)) + " 删除" +
        (person ? " · " + escapeHtml(person.name) : "") + "</small></div>" +
        '<div class="recycle-actions"><button type="button" data-action="restore-deleted" data-id="' + escapeHtml(task.id) + '">恢复</button>' +
        '<button type="button" class="danger" data-action="purge-deleted" data-id="' + escapeHtml(task.id) + '">彻底删除</button></div></div>';
    }).join("") + "</div>";
  }

  function renderSettings() {
    if (!canManage()) {
      return pageHead("无权访问", "系统设置仅对具有管理权限的成员开放。", "") +
        '<section class="panel">' + emptyState("lock", "需要管理权限", "请切换到科长或主任科员身份查看系统设置。") + "</section>";
    }
    const user = currentUser();
    const managerCount = activePeople().filter(function (p) { return p.role === "manager"; }).length;
    const lastBackup = backups[0];
    const peopleCard = '<section class="settings-card"><div class="settings-card-head"><div class="settings-card-title"><span class="settings-icon">' + icon("users") + "</span><div><h2>人员与权限</h2><p>支持新增、编辑和停用，人员不会被物理删除</p></div></div>" +
      '<button type="button" class="btn btn-sm" data-action="add-person">' + icon("plus") + "新增人员</button></div>" +
      '<table class="person-table"><thead><tr><th>成员</th><th>权限</th><th>状态</th><th>未办结</th><th style="text-align:right">操作</th></tr></thead><tbody>' + renderPeopleRows() + "</tbody></table>" +
      '<div class="permission-note">' + icon("info") + '<div><strong>权限规则：</strong>管理与审核人员可新建任意任务、分配责任人、审核办结和管理系统；任务办理人员可查看全部任务，可新建和编辑自己创建、本人负责的未办结任务，但只能更新自己负责任务的办理状态。所有成员均可导出任务数据。</div></div></section>';

    const categoryCard = '<section class="settings-card"><div class="settings-card-head"><div class="settings-card-title"><span class="settings-icon">' + icon("tag") + "</span><div><h2>工作分类</h2><p>新增、重命名、停用或删除；删除在用分类前需转移任务</p></div></div>" +
      '<button type="button" class="btn btn-sm" data-action="add-category">' + icon("plus") + "新增分类</button></div>" +
      '<div class="category-list">' + renderCategoryRows() + "</div>" +
      '<div class="permission-note">' + icon("info") + "<div>重命名会同步更新历史任务；删除在用分类时需将关联任务转入其他分类，历史记录不会丢失；至少保留一个启用中的分类。普通成员只能选择分类，不能维护分类。</div></div></section>";

    const autoChecked = state.settings.autoBackupEnabled ? " checked" : "";
    const backupCard = '<section class="settings-card"><div class="settings-card-head"><div class="settings-card-title"><span class="settings-icon">' + icon("database") + "</span><div><h2>数据与备份</h2><p>集中保存、自动快照与手动导出恢复</p></div></div></div>" +
      '<div class="backup-status"><div class="backup-status-main"><span class="backup-icon">' + icon("database") + '</span><div class="backup-status-copy"><strong>' + (lastBackup ? "上次备份 " + escapeHtml(formatShortDateTime(lastBackup.createdAt)) : "尚未创建备份") + "</strong><small>" +
      (lastBackup ? escapeHtml(backupReasonLabel(lastBackup.reason)) + " · 共保留 " + backups.length + " 份主机备份" : "建议先创建一份完整备份") + "</small></div></div>" +
      '<span class="type-pill">' + (state.settings.autoBackupEnabled ? "自动备份已开启" : "自动备份已关闭") + "</span></div>" +
      '<div class="auto-backup-toggle"><div class="auto-backup-toggle-copy"><strong>自动备份</strong><small>主机每 ' + (Number(state.settings.backupIntervalHours) || 24) + ' 小时自动保留一份数据库快照，最多保留 40 份。</small></div>' +
      '<label class="switch"><input type="checkbox" id="auto-backup-toggle"' + autoChecked + ' aria-label="自动备份开关"><span class="switch-track"></span></label></div>' +
      '<div class="backup-actions"><button type="button" class="btn btn-primary" data-action="backup-now">' + icon("database") + "立即备份</button>" +
      '<button type="button" class="btn" data-action="download-backup">' + icon("download") + "下载最新备份</button>" +
      '<button type="button" class="btn" data-action="trigger-restore-file">' + icon("upload") + "从文件恢复</button></div>" +
      '<input type="file" id="restore-file" accept=".db,application/octet-stream" hidden>' +
      '<div class="backup-snapshots"><div class="backup-snapshots-title"><span>主机备份快照</span><span>最近 ' + Math.min(backups.length, 5) + " 份</span></div>" + renderSnapshots() + "</div>" +
      '<div class="preview-warning">' + icon("alert-triangle") + "<div>数据库与备份集中保存在主机 data 目录。请勿在服务运行时移动或删除 data 目录；建议每周把最新备份复制到移动硬盘或另一台电脑。</div></div></section>";

    const deletedCount = (state.deletedTasks || []).length;
    const recycleCard = '<section class="settings-card"><div class="settings-card-head"><div class="settings-card-title"><span class="settings-icon">' + icon("trash") + "</span><div><h2>回收站</h2><p>已删除任务保留 30 天，可恢复或彻底删除</p></div></div>" +
      (deletedCount ? '<button type="button" class="btn btn-sm btn-ghost" data-action="empty-recycle">清空回收站</button>' : "") + "</div>" +
      renderRecycleRows() + "</section>";

    const permissionCard = '<section class="settings-card"><div class="settings-card-head"><div class="settings-card-title"><span class="settings-icon">' + icon("shield") + "</span><div><h2>权限边界</h2><p>当前身份：" + escapeHtml(user.name) + " · " + (user.role === "manager" ? "管理与审核" : "任务办理") + "</p></div></div></div>" +
      '<div class="rule-list">' +
      '<div class="rule-item"><span>1</span><div><strong>全员可见</strong>：所有成员均可查看全部任务、周期历史和归档记录。</div></div>' +
      '<div class="rule-item"><span>2</span><div><strong>自主任务</strong>：普通成员可新建仅由本人负责的一次性任务，并编辑自己创建、本人负责的未办结任务；不能给其他成员派任务。</div></div>' +
      '<div class="rule-item"><span>3</span><div><strong>办理隔离</strong>：责任人只能开始、提交或撤回自己的任务，不能修改其他责任人的办理状态。</div></div>' +
      '<div class="rule-item"><span>4</span><div><strong>审核办结</strong>：仅科长、主任科员可审核；审核通过后任务才办结，退回则回到办理中。</div></div>' +
      '<div class="rule-item"><span>5</span><div><strong>审核留痕</strong>：管理员可以审核本人办理的任务，也可以审核其他成员的任务；系统完整记录审核人和审核意见。</div></div>' +
      '<div class="rule-item"><span>6</span><div><strong>人员留痕</strong>：停用人员不会删除历史任务；有未办结任务时需先重新指派。</div></div>' +
      "</div></section>";

    const aboutCard = '<section class="settings-card"><div class="settings-card-head"><div class="settings-card-title"><span class="settings-icon">' + icon("info") + "</span><div><h2>系统信息</h2><p>局域网正式运行版本</p></div></div></div>" +
      '<div class="about-list">' +
      '<div class="about-row"><span>系统名称</span><strong>' + APP_NAME + " · " + APP_SUBTITLE + "</strong></div>" +
      '<div class="about-row"><span>版本</span><strong>1.2.2 正式版</strong></div>' +
      '<div class="about-row"><span>运行形态</span><strong>Windows 主机 · 局域网 Web 服务</strong></div>' +
      '<div class="about-row"><span>数据位置</span><strong>' + escapeHtml(state.settings.dataDir || "主机 data 目录") + '</strong></div>' +
      '<div class="about-row"><span>在用人员</span><strong>' + activePeople().length + " 人 · " + managerCount + " 名管理</strong></div>" +
      "</div>" +
      '<div class="about-note">本系统在科长办公电脑作为局域网服务器运行，其他成员通过浏览器访问，数据实时集中保存，不依赖互联网。</div>' +
      '<div class="about-action"><button type="button" class="btn btn-soft" data-action="open-help">' + icon("help") + "查看使用说明</button></div></section>";

    return pageHead("系统设置", "维护人员、工作分类与权限，管理数据备份与恢复；所有变更即时保存。", "") +
      '<div class="settings-layout"><div class="settings-stack">' + peopleCard + categoryCard + backupCard + recycleCard + "</div><div class=\"settings-stack\">" + permissionCard + aboutCard + "</div></div>";
  }

  /* ---------------- 抽屉：任务详情 ---------------- */

  function canEditTask(task) {
    if (!task || task.status === "completed") return false;
    if (canManage()) return true;
    const user = currentUser();
    return Boolean(
      user &&
      task.creatorId === user.id &&
      task.assigneeId === user.id &&
      (task.status === "pending" || task.status === "in_progress")
    );
  }

  function renderTimeline(task) {
    const items = (task.activity || []).slice().sort(function (a, b) {
      return String(b.at).localeCompare(String(a.at));
    });
    if (!items.length) return emptyState("clock", "暂无办理记录", "");
    return '<div class="timeline">' + items.map(function (item) {
      const person = getPerson(item.actorId);
      const tone = activityTone(item.action);
      const markerIcon = item.action === "approved" ? icon("check") : item.action === "rejected" ? icon("x") : "";
      const notes = ["", "创建了任务", "开始办理", "提交审核", "撤回审核", "审核通过", "审核通过，任务办结", "更新了任务进展", "更新了任务信息", "调整了责任人"];
      const note = item.note && notes.indexOf(String(item.note).trim()) === -1 ? item.note : "";
      return '<div class="timeline-item"><span class="timeline-marker ' + tone + '">' + markerIcon + "</span>" +
        '<div class="timeline-content"><div class="timeline-line"><strong>' + escapeHtml(activityLabel(item.action)) + '</strong><span class="timeline-time">' + escapeHtml(formatDateTime(item.at)) + "</span></div>" +
        (note ? '<div class="timeline-note">' + escapeHtml(note) + "</div>" : "") +
        '<div class="timeline-actor">' + escapeHtml(person ? person.name : "系统") + "</div></div></div>";
    }).join("") + "</div>";
  }

  function renderProgressSection(task) {
    const user = currentUser();
    const canAdd = task.assigneeId === user.id && task.status === "in_progress";
    const entries = (task.progress || []).slice().sort(function (a, b) {
      return String(b.at).localeCompare(String(a.at));
    });
    if (!entries.length && task.status === "pending") return "";

    let content = "";
    if (entries.length) {
      content = '<div class="progress-list">' + entries.map(function (entry, index) {
        const person = getPerson(entry.actorId);
        const isResult = entry.type === "result";
        return '<div class="progress-entry' + (index === 0 ? " is-latest" : "") + '">' +
          '<div class="progress-entry-head">' + userAvatar(person, "sm") +
          '<strong>' + escapeHtml(person ? person.name : "系统") + "</strong>" +
          '<span class="progress-kind ' + (isResult ? "result" : "update") + '">' + (isResult ? "办理结果" : "进展") + "</span>" +
          (index === 0 ? '<span class="progress-latest">最新</span>' : "") +
          '<span class="progress-time">' + escapeHtml(formatDateTime(entry.at)) + "</span></div>" +
          '<div class="progress-content">' + escapeHtml(entry.content) + "</div></div>";
      }).join("") + "</div>";
    } else {
      let hint = "该任务暂未填写任务进展。";
      if (task.status === "pending") hint = "任务开始办理后，可在这里记录处理过程。";
      else if (canAdd) hint = "还没有进展记录。办理过程中可随时记录处理情况。";
      content = '<div class="progress-empty">' + icon("file-text") + "<p>" + escapeHtml(hint) + "</p>" +
        (canAdd ? '<button type="button" class="btn btn-sm btn-soft" data-action="add-progress" data-id="' + escapeHtml(task.id) + '">记录第一条进展</button>' : "") +
        "</div>";
    }

    return '<section class="drawer-section progress-section">' +
      '<div class="drawer-section-title"><span>任务进展 <small>' + entries.length + " 条</small></span>" +
      '<small>记录任务是怎么处理的</small></div>' + content + "</section>";
  }

  function renderTaskTimeSection(task) {
    const started = task.startedAt;
    const submitted = task.submittedAt;
    const completed = task.completedAt;
    const nodes = [
      {
        key: "created",
        label: "新建任务",
        at: task.createdAt,
        state: "done",
        note: (getPerson(task.creatorId) || {}).name || "系统"
      },
      {
        key: "started",
        label: "开始办理",
        at: started,
        state: started ? "done" : "waiting",
        note: started ? "进入办理中" : "待开始"
      },
      {
        key: "submitted",
        label: "提交审核",
        at: submitted,
        state: submitted ? "done" : "waiting",
        note: submitted ? (task.rejectionCount ? "已提交 · 曾退回 " + task.rejectionCount + " 次" : "提交审核") : "待提交"
      },
      {
        key: "completed",
        label: "审核办结",
        at: completed,
        state: completed ? "done" : "waiting",
        note: completed ? "审核通过并归档" : (task.status === "review" ? "待审核" : "待办结")
      }
    ];
    return '<section class="drawer-section"><div class="drawer-section-title"><span>任务时间</span><span class="timeline-caption">新建 · 办理 · 提交 · 办结</span></div>' +
      '<div class="task-time-track">' + nodes.map(function (node) {
        return '<div class="task-time-node ' + node.state + '">' +
          '<span class="task-time-dot">' + (node.state === "done" ? icon("check") : "") + "</span>" +
          '<div class="task-time-copy"><strong>' + node.label + "</strong><span>" +
          (node.at ? formatShortDateTime(node.at) : node.note) + "</span>" +
          (node.at ? "<small>" + node.note + "</small>" : "") + "</div>" +
          "</div>";
      }).join("") + "</div></section>";
  }

  function renderDrawerFooter(task) {
    const user = currentUser();
    const isOwner = task.assigneeId === user.id;
    const reviewActions = canManage() && task.status === "review";
    const actions = [];

    if (task.status === "completed") {
      return '<div class="drawer-foot"><span class="drawer-foot-note">' + icon("check-circle") + " 任务已办结并归档，记录不可修改</span><span class=\"spacer\"></span>" +
        (canManage() ? '<button type="button" class="btn btn-ghost" style="color:var(--danger)" data-action="delete-task" data-id="' + escapeHtml(task.id) + '">' + icon("trash") + "删除任务</button>" : "") +
        "</div>";
    }

    if (canEditTask(task)) {
      actions.push('<button type="button" class="btn btn-ghost" data-action="edit-task" data-id="' + escapeHtml(task.id) + '">' + icon("edit") + "编辑任务</button>");
    }

    if (reviewActions) {
      actions.push('<button type="button" class="btn" data-action="review-task" data-mode="reject" data-id="' + escapeHtml(task.id) + '">退回办理</button>');
      actions.push('<button type="button" class="btn btn-primary" data-action="review-task" data-mode="approve" data-id="' + escapeHtml(task.id) + '">审核通过</button>');
    } else if (isOwner && task.status === "pending") {
      actions.push('<button type="button" class="btn btn-primary" data-action="start-task" data-id="' + escapeHtml(task.id) + '">' + icon("play") + "开始办理</button>");
    } else if (isOwner && task.status === "in_progress") {
      actions.push('<button type="button" class="btn btn-soft" data-action="add-progress" data-id="' + escapeHtml(task.id) + '">' + icon("edit") + "记录进展</button>");
      actions.push('<button type="button" class="btn btn-primary" data-action="submit-task" data-id="' + escapeHtml(task.id) + '">' + icon("check-circle") + "提交审核</button>");
    } else if (isOwner && task.status === "review") {
      actions.push('<button type="button" class="btn" data-action="withdraw-task" data-id="' + escapeHtml(task.id) + '">撤回审核</button>');
    }

    let note = "";
    if (!isOwner && !reviewActions) {
      note = '<span class="drawer-foot-note">' + icon("lock") + " 仅责任人可更新办理状态</span>";
    } else if (task.status === "review") {
      note = '<span class="drawer-foot-note">' + icon("clock") + (isOwner ? " 可自行审核办结，也可等待其他管理人员审核" : " 等待管理人员确认") + "</span>";
    }

    if (canManage()) {
      actions.push('<button type="button" class="btn btn-ghost" style="color:var(--danger)" data-action="delete-task" data-id="' + escapeHtml(task.id) + '">' + icon("trash") + "删除任务</button>");
    }
    return '<div class="drawer-foot">' + (note || "") + '<span class="spacer"></span>' + actions.join("") + "</div>";
  }

  function renderDrawer() {
    const root = document.getElementById("drawer-root");
    if (!root) return;
    if (!ui.drawerOpen || !ui.selectedTaskId) {
      root.innerHTML = "";
      document.body.classList.remove("drawer-open");
      return;
    }
    const task = getTask(ui.selectedTaskId);
    if (!task) {
      ui.drawerOpen = false;
      ui.selectedTaskId = null;
      root.innerHTML = "";
      document.body.classList.remove("drawer-open");
      return;
    }
    const owner = getPerson(task.assigneeId);
    const creator = getPerson(task.creatorId);
    const due = dueState(task);
    const rejection = latestRejection(task);
    const isRecurring = task.type === "recurring";
    const periodText = isRecurring && task.cycle
      ? CYCLE[task.cycle].label + " · " + periodLabel(task.cycle, task.dueDate)
      : "一次性任务";
    const dueBlock = '<div class="due-block ' + due.className + '"><div class="due-block-main"><span class="due-block-icon">' + icon(due.key === "overdue" ? "alert-triangle" : "calendar") + "</span>" +
      '<span class="due-block-copy"><strong>' + escapeHtml(formatDateCN(task.dueDate, { full: true, withWeekday: true }) + " " + formatDueTime(task)) + "</strong><small>" + escapeHtml(due.label) + "</small></span></div>" +
      '<span class="due-block-note ' + (due.key === "overdue" ? "strong" : "") + '">' + (task.status === "completed" && task.completedAt ? "办结于 " + escapeHtml(formatShortDateTime(task.completedAt)) : due.key === "overdue" ? "请优先处理" : due.key === "today" || due.key === "urgent" ? "临近截止" : "按计划推进") + "</span></div>";

    const body = '<div class="drawer-body">' +
      '<section class="drawer-section"><div class="meta-grid">' +
      '<div class="meta-item"><span class="meta-label">责任人</span><span class="meta-value">' + userAvatar(owner, "sm") + escapeHtml(owner ? owner.name + " · " + owner.title : "未指派") + "</span></div>" +
      '<div class="meta-item"><span class="meta-label">创建人</span><span class="meta-value">' + escapeHtml(creator ? creator.name : "—") + "</span></div>" +
      '<div class="meta-item"><span class="meta-label">任务类型</span><span class="meta-value">' + typePill(task) + "</span></div>" +
      '<div class="meta-item"><span class="meta-label">任务编号</span><span class="meta-value">' + escapeHtml(task.code) + "</span></div>" +
      '<div class="meta-item"><span class="meta-label">任务来源</span><span class="meta-value">' + escapeHtml(taskSource(task)) + "</span></div>" +
      '<div class="meta-item" style="grid-column:1 / -1"><span class="meta-label">' + (isRecurring ? "所属周期" : "工作分类") + '</span><span class="meta-value">' + categoryPill(task.category) + (isRecurring ? '<span style="color:var(--muted-light)">' + escapeHtml(periodText) + "</span>" : "") + "</span></div>" +
      "</div></section>" +
      '<section class="drawer-section">' + dueBlock + "</section>" +
      renderTaskTimeSection(task) +
      '<section class="drawer-section"><div class="drawer-section-title">任务说明</div><div class="task-description">' + (task.description ? escapeHtml(task.description) : "暂无补充说明。") + "</div></section>" +
      (rejection ? '<section class="drawer-section"><div class="review-note">' + icon("alert-triangle") + "<div><strong>上次审核退回意见</strong>" + escapeHtml(rejection.note) + "</div></div></section>" : "") +
      renderProgressSection(task) +
      '<section class="drawer-section"><details class="operation-log"><summary><span>操作记录</span><small>系统自动记录 ' + (task.activity || []).length + ' 条</small><span class="operation-chevron">' + icon("chevron-down") + "</span></summary>" +
      '<div class="operation-log-body">' + renderTimeline(task) + "</div></details></section>" +
      (!canEditTask(task) && task.assigneeId !== currentUser().id && task.status !== "completed" && !(canManage() && task.status === "review")
        ? '<section class="drawer-section"><div class="readonly-note">' + icon("lock") + "<div>你当前不是该任务的责任人，只能查看详情，不能更新办理状态。审核工作由科长或主任科员负责。</div></div></section>"
        : "") +
      "</div>";

    root.innerHTML = '<div class="drawer-backdrop" data-action="drawer-backdrop"></div>' +
      '<aside class="drawer" role="dialog" aria-modal="true" aria-label="任务详情">' +
      '<div class="drawer-head"><div><div class="drawer-kicker">' + typePill(task) + categoryPill(task.category) + statusPill(task) + "</div>" +
      '<h2 class="drawer-title">' + escapeHtml(task.title) + "</h2></div>" +
      '<div class="drawer-head-side">' + (canEditTask(task) ? '<button type="button" class="icon-button" data-action="edit-task" data-id="' + escapeHtml(task.id) + '" aria-label="编辑任务">' + icon("edit") + "</button>" : "") +
      '<button type="button" class="icon-button" data-action="close-drawer" aria-label="关闭详情">' + icon("x") + "</button></div></div>" +
      body + renderDrawerFooter(task) + "</aside>";
    document.body.classList.add("drawer-open");
  }

  /* ---------------- 弹窗 ---------------- */

  function openModal(html, options) {
    const opts = options || {};
    const root = document.getElementById("modal-root");
    if (!root) return;
    root.innerHTML = '<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal ' + (opts.size || "") + '" role="dialog" aria-modal="true" aria-label="' + escapeHtml(opts.label || "对话框") + '">' + html + "</div></div>";
    document.body.classList.add("modal-open");
    setTimeout(function () {
      const target = root.querySelector("[autofocus]") || root.querySelector("input:not([type=hidden]), textarea, select, button");
      if (target) target.focus();
    }, 40);
  }

  function closeModal() {
    const root = document.getElementById("modal-root");
    if (root) root.innerHTML = "";
    document.body.classList.remove("modal-open");
    pendingConfirm = null;
  }

  function modalHead(title, description) {
    return '<div class="modal-head"><div><h2>' + escapeHtml(title) + "</h2>" + (description ? "<p>" + escapeHtml(description) + "</p>" : "") + '</div><button type="button" class="icon-button modal-close" data-action="close-modal" aria-label="关闭">' + icon("x") + "</button></div>";
  }

  function taskModal(task, options) {
    const opts = options || {};
    const editing = Boolean(task);
    if (!editing && !canCreateTasks()) {
      toast("无法新建任务", "当前成员不可用。", "error");
      return;
    }
    if (editing && !canEditTask(task)) {
      toast("无法编辑", "只能编辑自己创建且自己负责的未办结任务。", "error");
      return;
    }
    const manager = canManage();
    const defaultDue = toISODate(addDays(new Date(), 3));
    const due = task ? task.dueDate : defaultDue;
    const dueTime = task ? formatDueTime(task) : "18:00";
    const selectedType = task ? task.type : (manager && opts.type === "recurring" ? "recurring" : "one-time");
    const selectedCycle = task && task.cycle ? task.cycle : "weekly";
    const title = editing ? "编辑任务" : "新建任务";
    const desc = editing
      ? "修改任务的名称、截止日期时间、分类或说明；历史办理记录会保留。"
      : (manager ? "一次性任务办理后归档；周期任务将按规则自动生成每一期。" : "普通成员新建的任务为一次性任务，责任人默认为本人。");
    const people = manager ? assignablePeople() : [currentUser()];
    let assigneeOptionsHtml = "";
    people.forEach(function (person) {
      const selected = task ? task.assigneeId === person.id : (state.currentUserId === person.id);
      assigneeOptionsHtml += '<option value="' + escapeHtml(person.id) + '"' + (selected ? " selected" : "") + ">" + escapeHtml(person.name) + " · " + escapeHtml(person.title) + "</option>";
    });
    if (task && !people.some(function (p) { return p.id === task.assigneeId; })) {
      const inactive = getPerson(task.assigneeId);
      if (inactive) assigneeOptionsHtml = '<option value="' + escapeHtml(inactive.id) + '" selected>' + escapeHtml(inactive.name) + "（已停用）</option>" + assigneeOptionsHtml;
    }
    const categoryList = state.categories.filter(function (cat) { return cat.active; });
    if (task && !categoryList.some(function (cat) { return cat.name === task.category; })) {
      const existingCategory = state.categories.find(function (cat) { return cat.name === task.category; });
      if (existingCategory) categoryList.push(existingCategory);
    }
    const defaultCategory = categoryList.length ? categoryList[0].name : "综合事务";
    const selectedCategory = task ? task.category : defaultCategory;
    const selectedSource = task ? taskSource(task) : "科室自定";
    const canChangeAssignee = manager && (!editing || task.status !== "review");
    const assigneeHint = !manager
      ? '<span class="field-hint">普通成员任务的责任人固定为本人。</span>'
      : (!canChangeAssignee ? '<span class="field-hint">待审核任务不能直接调整责任人，请先退回办理。</span>' : "");
    const typeSwitch = (!manager || editing) ? "" :
      '<div class="form-section"><div class="form-section-label">任务类型</div><div class="type-switch">' +
      '<label class="type-option"><input type="radio" name="taskType" value="one-time"' + (selectedType === "one-time" ? " checked" : "") + '><span class="type-option-indicator"></span><span>一次性任务 <small>办结后归档</small></span></label>' +
      '<label class="type-option"><input type="radio" name="taskType" value="recurring"' + (selectedType === "recurring" ? " checked" : "") + '><span class="type-option-indicator"></span><span>周期任务 <small>自动生成每期</small></span></label>' +
      "</div></div>";
    const recurringHidden = selectedType === "recurring" ? "" : " hidden";
    const form = '<form id="task-form" data-mode="' + (editing ? "edit" : "create") + '" data-id="' + escapeHtml(task ? task.id : "") + '" data-type="' + selectedType + '">' +
      modalHead(title, desc) +
      '<div class="modal-body">' +
      '<div class="form-section"><div class="form-grid">' +
      '<div class="form-field full"><label for="task-title">任务名称<span class="required">*</span></label><input id="task-title" name="title" type="text" maxlength="80" required autofocus placeholder="例如：汇总上报本月工业经济运行情况" value="' + escapeHtml(task ? task.title : "") + '"><span class="field-error" id="title-error"></span></div>' +
      '<div class="form-field"><label for="task-category">工作分类</label><select id="task-category" name="category">' +
      categoryList.map(function (cat) { return '<option value="' + escapeHtml(cat.name) + '"' + (selectedCategory === cat.name ? " selected" : "") + ">" + escapeHtml(cat.name) + (cat.active ? "" : "（已停用）") + "</option>"; }).join("") +
      "</select></div>" +
      '<div class="form-field"><label for="task-source">任务来源<span class="required">*</span></label><select id="task-source" name="source" required>' + sourceOptions(selectedSource, false) + "</select></div>" +
      '<div class="form-field"><label for="task-assignee">责任人员<span class="required">*</span></label><select id="task-assignee" name="assigneeId" required' + (canChangeAssignee ? "" : " disabled") + ">" + assigneeOptionsHtml + "</select>" +
      assigneeHint + "</div>" +
      '<div class="form-field"><label for="task-due" id="due-label">' + (selectedType === "recurring" ? "本期截止日期" : "截止日期") + '<span class="required">*</span></label><input id="task-due" name="dueDate" type="date" required value="' + escapeHtml(due) + '"' + (editing ? "" : ' min="' + toISODate(new Date()) + '"') + ">" +
      '<span class="field-hint" id="due-hint">' + (selectedType === "recurring" ? "每期任务会在此日期基础上按周期顺延。" : "系统会在截止前 3 天和 1 天提醒。") + "</span></div>" +
      '<div class="form-field"><label for="task-due-time" id="due-time-label">' + (selectedType === "recurring" ? "本期截止时间" : "截止时间") + '<span class="required">*</span></label><input id="task-due-time" name="dueTime" type="time" required step="60" value="' + escapeHtml(dueTime) + '"><span class="field-hint">默认 18:00，可按实际截止时刻调整。</span></div>' +
      '<div class="form-field recurring-only"' + recurringHidden + '><label for="task-cycle">重复周期<span class="required">*</span></label><select id="task-cycle" name="cycle">' +
      Object.keys(CYCLE).map(function (key) { return '<option value="' + key + '"' + (selectedCycle === key ? " selected" : "") + ">" + CYCLE[key].label + "</option>"; }).join("") +
      '</select><span class="field-hint">每期任务在截止日前 5 个工作日生成，历史期次独立保留。</span></div>' +
      '<div class="form-field full"><label for="task-description">任务说明</label><textarea id="task-description" name="description" maxlength="800" placeholder="补充任务背景、交付要求或需协调事项">' + escapeHtml(task ? task.description : "") + "</textarea></div>" +
      "</div></div>" +
      typeSwitch +
      (editing && task.type === "recurring" ? '<div class="form-callout">' + icon("info") + "<span>本次修改仅影响当前这一期，不会改变周期规则；后续期次仍按原规则生成。</span></div>" : "") +
      (!editing && selectedType === "recurring" ? '<div class="form-callout">' + icon("repeat") + "<span>创建周期规则后，首期任务将在截止日前 5 个工作日生成；之后每期自动生成，上一期办理记录完整保留。</span></div>" : "") +
      "</div>" +
      '<div class="modal-foot"><span class="foot-spacer"></span><button type="button" class="btn" data-action="close-modal">取消</button><button type="submit" class="btn btn-primary">' + (editing ? "保存修改" : "创建任务") + "</button></div>" +
      "</form>";
    openModal(form, { label: title });
    syncTaskTypeFields();
  }

  function syncTaskTypeFields() {
    const form = document.getElementById("task-form");
    if (!form) return;
    const selected = form.querySelector('input[name="taskType"]:checked');
    const type = selected ? selected.value : form.dataset.type;
    const recurring = type === "recurring";
    form.dataset.type = type;
    const fields = form.querySelectorAll(".recurring-only");
    fields.forEach(function (field) { field.hidden = !recurring; });
    const label = document.getElementById("due-label");
    if (label) label.innerHTML = (recurring ? "本期截止日期" : "截止日期") + '<span class="required">*</span>';
    const timeLabel = document.getElementById("due-time-label");
    if (timeLabel) timeLabel.innerHTML = (recurring ? "本期截止时间" : "截止时间") + '<span class="required">*</span>';
    const hint = document.getElementById("due-hint");
    if (hint) hint.textContent = recurring ? "每期任务在截止日前 5 个工作日生成，并在此日期基础上按周期顺延。" : "系统会在截止前 3 天和 1 天提醒。";
  }

  function personModal(person) {
    const editing = Boolean(person);
    const title = editing ? "编辑人员" : "新增人员";
    const desc = editing ? "调整姓名、职务或权限；停用请使用列表中的停用操作。" : "新增后即可在任务指派和登录账号中使用。";
    const isSelf = person && person.id === state.currentUserId;
    const role = person ? person.role : "staff";
    const form = '<form id="person-form" data-mode="' + (editing ? "edit" : "create") + '" data-id="' + escapeHtml(person ? person.id : "") + '">' +
      modalHead(title, desc) +
      '<div class="modal-body"><div class="form-section"><div class="form-grid">' +
      '<div class="form-field"><label for="person-name">姓名<span class="required">*</span></label><input id="person-name" name="name" type="text" maxlength="20" required autofocus value="' + escapeHtml(person ? person.name : "") + '" placeholder="请输入姓名"></div>' +
      '<div class="form-field"><label for="person-title">职务</label><input id="person-title" name="title" type="text" maxlength="30" value="' + escapeHtml(person ? person.title : "科员") + '" placeholder="例如：科员"></div>' +
      '<div class="form-field full"><label>系统权限</label><div class="radio-row">' +
      '<label class="role-choice"><input type="radio" name="role" value="staff"' + (role === "staff" ? " checked" : "") + '><span class="role-choice-indicator"></span><span class="role-choice-copy"><strong>任务办理</strong><small>查看全部任务，可新建本人任务，办理自己负责的任务</small></span></label>' +
      '<label class="role-choice"><input type="radio" name="role" value="manager"' + (role === "manager" ? " checked" : "") + '><span class="role-choice-indicator"></span><span class="role-choice-copy"><strong>管理与审核</strong><small>分配任务、维护分类、审核办结</small></span></label>' +
      "</div></div>" +
      "</div></div>" +
      (isSelf ? '<div class="form-callout warning">' + icon("lock") + "<span>当前登录成员不能修改自己的权限，避免误操作导致无人管理系统。</span></div>" : "") +
      "</div>" +
      '<div class="modal-foot">' +
      (editing && !isSelf ? '<button type="button" class="btn btn-ghost" style="color:var(--danger)" data-action="reset-person-password" data-id="' + escapeHtml(person.id) + '">重置密码</button>' : "") +
      '<span class="foot-spacer"></span><button type="button" class="btn" data-action="close-modal">取消</button><button type="submit" class="btn btn-primary">' + (editing ? "保存修改" : "添加人员") + "</button></div>" +
      "</form>";
    openModal(form, { label: title, size: "modal-sm" });
  }

  function showTemporaryPassword(name, password) {
    const content = modalHead("临时密码已生成", "请将临时密码告知 " + name + "，对方首次登录后必须修改。") +
      '<div class="modal-body"><div class="form-callout">' + icon("lock") + "<div>临时密码：<strong style=\"font-size:16px;letter-spacing:.08em\">" +
      escapeHtml(password) + "</strong><br>此密码只显示一次，请立即记录并通过可靠方式告知本人。</div></div></div>" +
      '<div class="modal-foot"><span class="foot-spacer"></span><button type="button" class="btn btn-primary" data-action="close-modal">我已记录</button></div>';
    openModal(content, { label: "临时密码", size: "modal-sm" });
  }

  function resetPersonPassword(personId) {
    const person = getPerson(personId);
    if (!person || !canManage()) return;
    confirmModal({
      title: "重置登录密码",
      description: "系统会生成一个新的临时密码，原密码立即失效。",
      message: "确认重置 <strong>" + escapeHtml(person.name) + "</strong> 的登录密码吗？",
      confirmLabel: "确认重置",
      tone: "danger",
      onConfirm: async function () {
        try {
          const data = await apiRequest("/api/people/" + encodeURIComponent(personId) + "/reset-password", { method: "POST" });
          closeModal();
          showTemporaryPassword(person.name, data.temporaryPassword);
        } catch (err) {
          toast("重置失败", err.message, "error");
        }
      }
    });
  }

  function categoryModal(category) {
    if (!canManage()) {
      toast("无权操作", "只有管理成员可以维护工作分类。", "error");
      return;
    }
    const editing = Boolean(category);
    const form = '<form id="category-form" data-name="' + escapeHtml(category ? category.name : "") + '">' +
      modalHead(editing ? "重命名分类" : "新增分类", editing ? "重命名后，使用该分类的历史任务和周期规则会同步更新。" : "新增后即可在新建任务时选择；停用分类不会删除历史数据。") +
      '<div class="modal-body"><div class="form-field"><label for="category-name">分类名称<span class="required">*</span></label>' +
      '<input id="category-name" name="name" type="text" maxlength="20" required autofocus value="' + escapeHtml(category ? category.name : "") + '" placeholder="例如：营商环境">' +
      '<span class="field-hint">建议使用简短、稳定的工作分类名称，便于统计。</span></div></div>' +
      '<div class="modal-foot"><span class="foot-spacer"></span><button type="button" class="btn" data-action="close-modal">取消</button><button type="submit" class="btn btn-primary">' + (editing ? "保存名称" : "添加分类") + "</button></div>" +
      "</form>";
    openModal(form, { label: editing ? "重命名分类" : "新增分类", size: "modal-sm" });
  }

  function categoryDeleteModal(category) {
    if (!canManage() || !category) {
      toast("无权操作", "只有管理成员可以删除工作分类。", "error");
      return;
    }
    const taskCount = state.tasks.filter(function (task) { return task.category === category.name; }).length;
    const templateCount = state.templates.filter(function (template) { return template.category === category.name; }).length;
    const used = taskCount + templateCount > 0;
    const activeCount = state.categories.filter(function (cat) { return cat.active; }).length;
    const targets = state.categories.filter(function (cat) {
      return cat.name !== category.name && cat.active;
    });
    if (used && !targets.length) {
      toast("无法删除", "没有其他启用中的分类可以接收这些任务，请先新增或启用一个分类。", "error");
      return;
    }
    if (!used && category.active && activeCount <= 1) {
      toast("至少保留一个分类", "不能删除最后一个启用中的工作分类。", "error");
      return;
    }
    const targetField = used
      ? '<div class="form-field"><label for="category-target">转入分类<span class="required">*</span></label><select id="category-target" name="targetCategory" required>' +
        targets.map(function (cat) { return '<option value="' + escapeHtml(cat.name) + '">' + escapeHtml(cat.name) + "</option>"; }).join("") +
        '</select><span class="field-hint">删除后，关联任务和周期规则会统一改为该分类。</span></div>'
      : "";
    const message = used
      ? '<div class="danger-callout">' + icon("alert-triangle") + "<div>“" + escapeHtml(category.name) + "”下还有 <strong>" + taskCount + "</strong> 项任务、" + templateCount + " 条周期规则。删除前请选择转入分类，历史记录不会丢失。</div></div>"
      : '<div class="form-callout">' + icon("info") + "<div>“" + escapeHtml(category.name) + "”没有关联任务或周期规则。删除后该分类将从列表中移除，此操作不可恢复。</div></div>";
    const form = '<form id="category-delete-form" data-name="' + escapeHtml(category.name) + '">' +
      modalHead("删除分类", "删除前请确认该分类下是否还有需要保留的任务。") +
      '<div class="modal-body">' + message + targetField + "</div>" +
      '<div class="modal-foot"><span class="foot-spacer"></span><button type="button" class="btn" data-action="close-modal">取消</button><button type="submit" class="btn btn-danger">' + (used ? "转移并删除" : "确认删除") + "</button></div>" +
      "</form>";
    openModal(form, { label: "删除分类", size: "modal-sm" });
  }

  function progressModal(task) {
    const user = currentUser();
    if (!task || task.assigneeId !== user.id || task.status !== "in_progress") {
      toast("当前不可记录进展", "只有责任人可以在办理中记录任务进展。", "error");
      return;
    }
    const form = '<form id="progress-form" data-id="' + escapeHtml(task.id) + '">' +
      modalHead("记录任务进展", "写下这次做了什么、进展到哪里，提交后会按时间保留。") +
      '<div class="modal-body">' +
      '<div class="form-callout" style="margin-bottom:14px">' + icon("file-text") + "<span><strong>" + escapeHtml(task.title) + "</strong><br>当前共 " + (task.progress || []).length + " 条进展记录</span></div>" +
      '<div class="form-field"><label for="progress-content">本次进展<span class="required">*</span></label><textarea id="progress-content" name="content" maxlength="1000" required autofocus placeholder="例如：已联系12家企业，完成台账信息更新，剩余3家明天补充。"></textarea>' +
      '<span class="field-hint">提交后按时间保留，不能修改；办结时请填写办理结果。</span></div>' +
      "</div>" +
      '<div class="modal-foot"><span class="foot-spacer"></span><button type="button" class="btn" data-action="close-modal">取消</button><button type="submit" class="btn btn-primary">保存进展</button></div>' +
      "</form>";
    openModal(form, { label: "记录任务进展", size: "modal-sm" });
  }

  function reviewModal(task, mode) {
    const copy = {
      submit: { title: "提交审核", desc: "提交后任务进入待审核。请填写办理结果，审核人将在任务进展中直接看到。", button: "提交审核", placeholder: "例如：台账已全部更新并核对完成，可以提交审核。" },
      approve: { title: "审核通过", desc: "确认办理结果无误，通过后任务即办结归档。", button: "确认通过", placeholder: "可填写审核意见（选填）。" },
      reject: { title: "退回办理", desc: "任务将回到办理中，由责任人补充或修改后重新提交。", button: "确认退回", placeholder: "请说明退回原因和需要补充的内容。" }
    }[mode];
    if (!copy) return;
    const noteRequired = mode === "submit" || mode === "reject";
    const noteLabel = mode === "submit" ? "办理结果" : mode === "reject" ? "退回意见" : "审核意见";
    const noteOptional = noteRequired ? '<span class="required">*</span>' : "（选填）";
    const form = '<form id="review-form" data-mode="' + mode + '" data-id="' + escapeHtml(task.id) + '">' +
      modalHead(copy.title, copy.desc) +
      '<div class="modal-body">' +
      '<div class="form-callout" style="margin-bottom:14px">' + icon("file-text") + "<span><strong>" + escapeHtml(task.title) + "</strong><br>责任人：" + escapeHtml((getPerson(task.assigneeId) || {}).name || "未指派") + " · 截止 " + escapeHtml(formatDateCN(task.dueDate, { full: true }) + " " + formatDueTime(task)) + "</span></div>" +
      '<div class="form-field"><label for="review-note">' + noteLabel + noteOptional + '</label><textarea id="review-note" name="note" maxlength="800" ' + (noteRequired ? "required" : "") + ' autofocus placeholder="' + copy.placeholder + '"></textarea></div>' +
      (mode === "submit" ? '<div class="form-callout" style="margin-top:14px">' + icon("file-text") + "<span>办理结果会写入“任务进展”，并与之前的进展记录一起留存。</span></div>" : "") +
      (mode === "approve" ? '<div class="form-callout" style="margin-top:14px">' + icon("check-circle") + "<span>审核通过后，任务将标记为已办结；一次性任务进入归档，周期任务保留本期记录。</span></div>" : "") +
      "</div>" +
      '<div class="modal-foot"><span class="foot-spacer"></span><button type="button" class="btn" data-action="close-modal">取消</button><button type="submit" class="btn ' + (mode === "reject" ? "btn-danger" : "btn-primary") + '">' + copy.button + "</button></div>" +
      "</form>";
    openModal(form, { label: copy.title, size: "modal-sm" });
  }

  function confirmModal(options) {
    const opts = options || {};
    pendingConfirm = opts.onConfirm || null;
    const iconName = opts.tone === "danger" ? "alert-triangle" : "info";
    openModal(
      modalHead(opts.title || "请确认", opts.description || "") +
      '<div class="modal-body"><div class="' + (opts.tone === "danger" ? "danger-callout" : "form-callout") + '">' + icon(iconName) + "<div>" + (opts.message || "") + "</div></div></div>" +
      '<div class="modal-foot"><span class="foot-spacer"></span><button type="button" class="btn" data-action="close-modal">取消</button><button type="button" class="btn ' + (opts.tone === "danger" ? "btn-danger" : "btn-primary") + '" data-action="run-confirm">' + escapeHtml(opts.confirmLabel || "确认") + "</button></div>",
      { label: opts.title || "确认", size: "modal-sm" }
    );
  }

  function helpModal() {
    const content = modalHead("使用说明", "数据集中保存在本科室主机，局域网内成员使用各自账号登录。") +
      '<div class="modal-body"><div class="help-list">' +
      '<div class="help-item"><span class="help-num">01</span><div class="help-item-copy"><strong>账号与登录</strong><p>首次登录使用部署说明中的初始密码，系统会要求立即修改。账号权限由科长、主任科员在系统设置中维护；忘记密码可请管理员重置。</p></div></div>' +
      '<div class="help-item"><span class="help-num">02</span><div class="help-item-copy"><strong>办理流程与任务进展</strong><p>任务从“待办”开始，责任人点击“开始办理”后可随时记录任务进展；提交审核时必须填写办理结果，审核通过后变为“已办结”，退回则回到“办理中”。</p></div></div>' +
      '<div class="help-item"><span class="help-num">03</span><div class="help-item-copy"><strong>任务清单默认范围</strong><p>科长和主任科员默认查看全部任务；其他人员进入任务清单时默认只看自己负责的任务，可通过责任人筛选查看全部或指定成员。</p></div></div>' +
      '<div class="help-item"><span class="help-num">04</span><div class="help-item-copy"><strong>周期任务</strong><p>按周、月、季度创建规则后，主机每天自动检查并生成本期任务。每一期独立办理、独立留档，可在“周期任务”查看历史期次。</p></div></div>' +
      '<div class="help-item"><span class="help-num">05</span><div class="help-item-copy"><strong>截止时间与审核提醒</strong><p>每个任务都有截止日期和具体时刻，默认 18:00。截止前 3 天显示即将到期，前 1 天加强提醒，超过具体时刻标记逾期；待审核任务同样会进入提醒，已办结任务不再提醒。</p></div></div>' +
      '<div class="help-item"><span class="help-num">06</span><div class="help-item-copy"><strong>工作分类与界面配色</strong><p>科长、主任科员可在系统设置中新增、重命名、停用或删除工作分类；停用保留历史任务，删除在用分类前需先转移任务。右上角调色板按钮可切换松石绿、黛蓝、暖砂、墨灰四套配色。</p></div></div>' +
      '<div class="help-item"><span class="help-num">07</span><div class="help-item-copy"><strong>导出与备份</strong><p>任务清单支持导出 Excel；系统设置中可立即备份数据库、下载 .db 备份文件、从主机快照或备份文件恢复。恢复前系统会自动保留安全快照。</p></div></div>' +
      '<div class="help-item"><span class="help-num">08</span><div class="help-item-copy"><strong>数据保存位置</strong><p>所有数据保存在主机 EXE 同目录的 data 文件夹，不保存在个人电脑或浏览器中。请勿在服务运行时移动或删除 data 目录。</p></div></div>' +
      "</div></div>" +
      '<div class="modal-foot"><span class="foot-spacer"></span><button type="button" class="btn btn-primary" data-action="close-modal">知道了</button></div>';
    openModal(content, { label: "使用说明", size: "modal-lg" });
  }

  function seriesHistoryModal(template) {
    const tasks = tasksBySeries(template.id).slice().sort(function (a, b) {
      return String(b.dueDate).localeCompare(String(a.dueDate));
    });
    const rows = tasks.map(function (task) {
      const due = dueState(task);
      return '<button type="button" class="history-modal-row" data-action="open-task" data-id="' + escapeHtml(task.id) + '">' +
        '<span class="history-modal-period">' + escapeHtml(periodShortLabel(template.cycle, task.dueDate)) + "</span>" +
        '<span class="history-modal-title">' + escapeHtml(task.title) + "</span>" +
        '<span class="due-label ' + due.className + '">' + escapeHtml(due.label) + "</span>" + statusPill(task) + "</button>";
    }).join("");
    const content = modalHead("历史期次 · " + template.title, "共 " + tasks.length + " 期，每一期均独立记录、独立审核。") +
      '<div class="modal-body"><div class="history-modal-list">' + (rows || emptyState("repeat", "还没有历史期次", "")) + "</div></div>" +
      '<div class="modal-foot"><span class="foot-spacer"></span><button type="button" class="btn btn-primary" data-action="close-modal">关闭</button></div>';
    openModal(content, { label: "历史期次", size: "modal-lg" });
  }

  function toast(title, message, type) {
    const root = document.getElementById("toast-root");
    if (!root) return;
    const id = "toast_" + (++toastSeq);
    const el = document.createElement("div");
    el.className = "toast";
    el.id = id;
    const iconName = type === "error" ? "alert-triangle" : type === "info" ? "info" : "check";
    el.innerHTML = '<span class="toast-icon ' + (type === "error" ? "error" : type === "info" ? "info" : "") + '">' + icon(iconName) + '</span><span class="toast-copy"><strong>' + escapeHtml(title) + "</strong>" + (message ? "<span>" + escapeHtml(message) + "</span>" : "") + '</span><button type="button" class="toast-close" data-action="close-toast" data-toast="' + id + '" aria-label="关闭">' + icon("x") + "</button>";
    root.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) {
        el.classList.add("leaving");
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 190);
      }
    }, 3600);
  }

  function closeToast(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("leaving");
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 180);
  }

  /* ---------------- 页面渲染与导航 ---------------- */

  function renderViewOnly() {
    const view = document.getElementById("view");
    if (!view) return;
    if (currentRoute === "settings" && !canManage()) {
      currentRoute = "dashboard";
      if (location.hash !== "#dashboard") history.replaceState(null, "", "#dashboard");
    }
    let html = "";
    if (currentRoute === "calendar") html = renderCalendar();
    else if (currentRoute === "tasks") html = renderTasks();
    else if (currentRoute === "recurring") html = renderRecurring();
    else if (currentRoute === "archive") html = renderArchive();
    else if (currentRoute === "settings") html = renderSettings();
    else html = renderDashboard();
    view.innerHTML = html;
  }

  function renderAll() {
    applyTheme(state.settings.theme);
    renderShell();
    renderViewOnly();
    renderDrawer();
  }

  function parseRoute() {
    const raw = (location.hash || "#dashboard").replace(/^#/, "");
    const parts = raw.split("?");
    const name = ROUTE_TITLES[parts[0]] ? parts[0] : "dashboard";
    return { name: name, params: new URLSearchParams(parts[1] || "") };
  }

  function handleRoute() {
    const parsed = parseRoute();
    currentRoute = parsed.name;
    ui.selectedTaskIds = new Set();
    if (currentRoute === "settings" && !canManage()) {
      currentRoute = "dashboard";
      history.replaceState(null, "", "#dashboard");
      toast("无权访问", "系统设置仅对管理成员开放。", "info");
    }
    if (currentRoute === "tasks") {
      ui.taskStatus = parsed.params.get("status") || "all";
      ui.dueFilter = parsed.params.get("due") || "all";
      ui.taskAssignee = resolveTaskAssignee(parsed.params.get("assignee"));
      ui.taskType = parsed.params.get("type") || "all";
      ui.taskSearch = parsed.params.get("q") || "";
      if (!STATUS[ui.taskStatus] && ui.taskStatus !== "all") ui.taskStatus = "all";
      if (["all", "upcoming", "overdue"].indexOf(ui.dueFilter) === -1) ui.dueFilter = "all";
      if (["all", "one-time", "recurring"].indexOf(ui.taskType) === -1) ui.taskType = "all";
      ui.exportOpen = false;
    }
    if (currentRoute === "archive") {
      ui.archiveSearch = "";
    }
    ui.drawerOpen = false;
    ui.selectedTaskId = null;
    ui.exportOpen = false;
    closePopovers();
    closeSidebar();
    renderAll();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function navigate(route, params) {
    const search = new URLSearchParams();
    if (params) {
      Object.keys(params).forEach(function (key) {
        const isMeaningful = params[key] != null && params[key] !== "";
        if (isMeaningful && (params[key] !== "all" || key === "assignee")) search.set(key, params[key]);
      });
    }
    const query = search.toString();
    const target = "#" + route + (query ? "?" + query : "");
    if (location.hash === target) handleRoute();
    else location.hash = target;
  }

  function closeSidebar() {
    const sidebar = document.getElementById("sidebar");
    const scrim = document.getElementById("sidebar-scrim");
    if (sidebar) sidebar.classList.remove("open");
    if (scrim) scrim.classList.remove("show");
  }

  function openDrawer(taskId) {
    const task = getTask(taskId);
    if (!task) {
      toast("未找到任务", "该任务可能已被移除。", "error");
      return;
    }
    ui.selectedTaskId = taskId;
    ui.drawerOpen = true;
    closePopovers();
    renderDrawer();
  }

  function closeDrawer() {
    ui.drawerOpen = false;
    ui.selectedTaskId = null;
    renderDrawer();
  }

  /* ---------------- 任务动作 ---------------- */

  async function startTask(taskId) {
    const task = getTask(taskId);
    const user = currentUser();
    if (!task) return;
    if (task.assigneeId !== user.id) {
      toast("无法操作", "只有任务责任人可以开始办理。", "error");
      return;
    }
    if (task.status !== "pending") {
      toast("当前状态不可操作", "只有待办任务可以开始办理。", "error");
      return;
    }
    try {
      await apiRequest("/api/tasks/" + encodeURIComponent(taskId) + "/start", { method: "POST", json: { version: task.version } });
      await refreshState();
      toast("已开始办理", "任务已进入办理中状态。", "success");
    } catch (err) {
      toast("无法开始办理", err.message, "error");
    }
  }

  function withdrawTask(taskId) {
    const task = getTask(taskId);
    const user = currentUser();
    if (!task) return;
    if (task.assigneeId !== user.id) {
      toast("无法操作", "只有任务责任人可以撤回审核。", "error");
      return;
    }
    if (task.status !== "review") {
      toast("当前状态不可操作", "只有待审核任务可以撤回。", "error");
      return;
    }
    confirmModal({
      title: "撤回审核",
      description: "任务将回到办理中，可继续修改后重新提交。",
      message: "确认撤回“" + escapeHtml(task.title) + "”的审核申请吗？",
      confirmLabel: "确认撤回",
      onConfirm: async function () {
        try {
          await apiRequest("/api/tasks/" + encodeURIComponent(taskId) + "/withdraw", { method: "POST", json: { version: task.version } });
          await refreshState();
          toast("已撤回审核", "任务已回到办理中。", "info");
        } catch (err) {
          toast("撤回失败", err.message, "error");
        }
      }
    });
  }

  function requestDeleteTasks(ids) {
    if (!canManage()) {
      toast("无权删除", "只有科长或主任科员可以删除任务。", "error");
      return;
    }
    const unique = Array.from(new Set(ids || []));
    const tasks = unique.map(getTask).filter(Boolean);
    if (!tasks.length) {
      toast("没有可删除的任务", "请先选择任务。", "info");
      return;
    }
    const recurring = tasks.filter(function (task) { return task.type === "recurring"; }).length;
    const names = tasks.slice(0, 5).map(function (task) { return escapeHtml(task.title); }).join("、");
    confirmModal({
      title: "删除任务",
      description: "删除后任务会移入回收站，保留 30 天，可随时恢复。",
      message: "确认删除这 <strong>" + tasks.length + "</strong> 项任务吗？<br>" + names + (tasks.length > 5 ? " 等" : "") +
        (recurring ? "<br><span style=\"color:var(--danger)\">其中 " + recurring + " 项为周期任务，只删除选中的本期，不会删除周期规则。</span>" : ""),
      confirmLabel: "移入回收站",
      tone: "danger",
      onConfirm: async function () {
        try {
          if (unique.length === 1) {
            await apiRequest("/api/tasks/" + encodeURIComponent(unique[0]), { method: "DELETE" });
          } else {
            await apiRequest("/api/tasks/bulk-delete", { method: "POST", json: { ids: unique } });
          }
          closeModal();
          ui.selectedTaskIds = new Set();
          if (ui.selectedTaskId && unique.indexOf(ui.selectedTaskId) !== -1) {
            ui.drawerOpen = false;
            ui.selectedTaskId = null;
          }
          await refreshState();
          toast("已移入回收站", "共 " + tasks.length + " 项任务，30 天内可在系统设置中恢复。", "success");
        } catch (err) {
          toast("删除失败", err.message, "error");
        }
      }
    });
  }

  async function restoreDeletedTask(id) {
    if (!canManage()) return;
    const task = getDeletedTask(id);
    if (!task) return;
    try {
      await apiRequest("/api/tasks/" + encodeURIComponent(id) + "/restore", { method: "POST" });
      await refreshState();
      toast("任务已恢复", task.title + " 已回到任务清单。", "success");
    } catch (err) {
      toast("恢复失败", err.message, "error");
    }
  }

  function permanentlyDeleteTask(id) {
    if (!canManage()) return;
    const task = getDeletedTask(id);
    if (!task) return;
    confirmModal({
      title: "彻底删除任务",
      description: "彻底删除后无法恢复，历史任务和办理记录将一并清除。",
      message: "确认彻底删除“" + escapeHtml(task.title) + "”吗？",
      confirmLabel: "彻底删除",
      tone: "danger",
      onConfirm: async function () {
        try {
          await apiRequest("/api/tasks/" + encodeURIComponent(id) + "/purge", { method: "DELETE" });
          closeModal();
          await refreshState();
          toast("任务已彻底删除", "", "info");
        } catch (err) {
          toast("彻底删除失败", err.message, "error");
        }
      }
    });
  }

  function emptyRecycleBin() {
    if (!canManage() || !(state.deletedTasks || []).length) return;
    confirmModal({
      title: "清空回收站",
      description: "清空后所有已删除任务无法恢复。",
      message: "确认清空 " + state.deletedTasks.length + " 项已删除任务吗？",
      confirmLabel: "清空回收站",
      tone: "danger",
      onConfirm: async function () {
        try {
          await apiRequest("/api/tasks/recycle/empty", { method: "POST" });
          closeModal();
          await refreshState();
          toast("回收站已清空", "", "info");
        } catch (err) {
          toast("清空失败", err.message, "error");
        }
      }
    });
  }

  /* ---------------- 表单提交 ---------------- */

  async function handleTaskForm(form) {
    const manager = canManage();
    const mode = form.dataset.mode;
    if (mode === "create" && !canCreateTasks()) {
      toast("无权操作", "当前成员不可新建任务。", "error");
      return;
    }
    if (mode === "create" && !manager && (form.dataset.type || "one-time") === "recurring") {
      toast("无法创建周期任务", "普通成员只能创建一次性任务。", "error");
      return;
    }
    const id = form.dataset.id;
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const category = String(formData.get("category") || "综合事务");
    const description = String(formData.get("description") || "").trim();
    const source = String(formData.get("source") || "科室自定");
    const dueDate = String(formData.get("dueDate") || "");
    const dueTime = normalizeTime(formData.get("dueTime"));
    const selectedAssignee = form.querySelector("#task-assignee") ? form.querySelector("#task-assignee").value : String(formData.get("assigneeId") || "");
    const assigneeId = manager ? selectedAssignee : currentUser().id;
    const taskType = manager ? (form.dataset.type || "one-time") : "one-time";
    const cycle = form.querySelector("#task-cycle") ? form.querySelector("#task-cycle").value : "weekly";
    const categoryRecord = state.categories.find(function (cat) { return cat.name === category; });

    if (!categoryRecord || (mode === "create" && !categoryRecord.active)) {
      toast("工作分类不可用", "请选择一个启用中的工作分类。", "error");
      return;
    }
    if (SOURCES.indexOf(source) === -1) {
      toast("任务来源无效", "请选择任务来源。", "error");
      return;
    }
    if (!title) {
      const err = document.getElementById("title-error");
      if (err) { err.textContent = "请填写任务名称。"; err.classList.add("show"); }
      toast("请填写任务名称", "", "error");
      return;
    }
    if (!dueDate || !parseISODate(dueDate)) {
      toast("请选择截止日期", "", "error");
      return;
    }
    if (!getPerson(assigneeId)) {
      toast("请选择责任人员", "", "error");
      return;
    }
    if (mode === "create" && taskType === "recurring" && new Date(dueDate + "T" + dueTime).getTime() < Date.now()) {
      toast("本期截止时间无效", "周期任务的本期截止日期和时间不能早于当前时间。", "error");
      return;
    }

    const payload = {
      title: title,
      description: description,
      category: category,
      source: source,
      dueDate: dueDate,
      dueTime: dueTime,
      assigneeId: assigneeId,
      type: taskType,
      cycle: cycle
    };

    if (mode === "edit") {
      const task = getTask(id);
      if (!task || !canEditTask(task)) {
        toast("无法编辑", "该任务当前不可编辑。", "error");
        return;
      }
      payload.version = task.version;
      try {
        await apiRequest("/api/tasks/" + encodeURIComponent(id), { method: "PUT", json: payload });
        closeModal();
        await refreshState();
        ui.drawerOpen = true;
        ui.selectedTaskId = id;
        renderDrawer();
        toast("任务已更新", "修改已保存并记录在操作记录中。", "success");
      } catch (err) {
        toast("保存失败", err.message, "error");
      }
      return;
    }

    try {
      const created = await apiRequest("/api/tasks", { method: "POST", json: payload });
      closeModal();
      ui.taskStatus = "all";
      ui.taskSearch = "";
      ui.taskAssignee = "all";
      ui.taskType = "all";
      ui.sourceFilter = "all";
      ui.dueFilter = "all";
      currentRoute = "tasks";
      history.replaceState(null, "", "#tasks");
      await refreshState();
      if (created.scheduled) {
        toast("周期规则已创建", "首期任务将在截止日前 5 个工作日生成（" + created.dueDate + "）。", "success");
        return;
      }
      ui.drawerOpen = true;
      ui.selectedTaskId = created.id;
      renderDrawer();
      toast(
        taskType === "recurring" ? "周期任务已创建" : "任务已创建",
        taskType === "recurring" ? "本期任务已生成，后续将在截止日前 5 个工作日生成。" : "已分配给" + (getPerson(assigneeId) || {}).name + "。",
        "success"
      );
    } catch (err) {
      toast("创建失败", err.message, "error");
    }
  }

  async function handlePersonForm(form) {
    if (!canManage()) {
      toast("无权操作", "只有管理成员可以维护人员。", "error");
      return;
    }
    const mode = form.dataset.mode;
    const id = form.dataset.id;
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const title = String(formData.get("title") || "").trim() || "科员";
    const role = String(formData.get("role") || "staff") === "manager" ? "manager" : "staff";
    if (!name) {
      toast("请填写姓名", "", "error");
      return;
    }
    try {
      if (mode === "create") {
        await apiRequest("/api/people", { method: "POST", json: { name: name, title: title, role: role } });
        closeModal();
        await refreshState();
        toast("人员已添加", name + " 已加入，初始密码为 Kewu@2026，首次登录需修改。", "success");
      } else {
        await apiRequest("/api/people/" + encodeURIComponent(id), { method: "PUT", json: { name: name, title: title, role: role } });
        closeModal();
        await refreshState();
        toast("人员信息已更新", "姓名、职务或权限已同步。", "success");
      }
    } catch (err) {
      toast("保存失败", err.message, "error");
    }
  }

  async function handleCategoryForm(form) {
    if (!canManage()) {
      toast("无权操作", "只有管理成员可以维护工作分类。", "error");
      return;
    }
    const oldName = String(form.dataset.name || "").trim();
    const name = String(new FormData(form).get("name") || "").trim();
    if (!name) {
      toast("请填写分类名称", "", "error");
      return;
    }
    try {
      if (oldName) {
        await apiRequest("/api/categories", { method: "PUT", json: { oldName: oldName, name: name } });
        closeModal();
        await refreshState();
        toast("分类已更新", "历史任务和周期规则已同步使用新名称。", "success");
      } else {
        await apiRequest("/api/categories", { method: "POST", json: { name: name } });
        closeModal();
        await refreshState();
        toast("分类已添加", name + " 已加入工作分类。", "success");
      }
    } catch (err) {
      toast("保存失败", err.message, "error");
    }
  }

  async function toggleCategory(name) {
    if (!canManage()) {
      toast("无权操作", "只有管理成员可以维护工作分类。", "error");
      return;
    }
    const category = state.categories.find(function (cat) { return cat.name === name; });
    if (!category) {
      toast("未找到分类", "", "error");
      return;
    }
    try {
      await apiRequest("/api/categories/toggle", { method: "POST", json: { name: name } });
      await refreshState();
      toast(category.active ? "分类已停用" : "分类已启用",
        category.active ? "历史任务仍保留该分类，新建任务不再显示。" : name + " 已恢复可选。", "success");
    } catch (err) {
      toast("操作失败", err.message, "error");
    }
  }

  async function handleCategoryDeleteForm(form) {
    if (!canManage()) {
      toast("无权操作", "只有管理成员可以删除工作分类。", "error");
      return;
    }
    const name = String(form.dataset.name || "");
    const category = state.categories.find(function (cat) { return cat.name === name; });
    if (!category) {
      toast("未找到分类", "", "error");
      return;
    }
    const taskCount = state.tasks.filter(function (task) { return task.category === name; }).length;
    const templateCount = state.templates.filter(function (template) { return template.category === name; }).length;
    const used = taskCount + templateCount > 0;
    const targetName = used ? String(new FormData(form).get("targetCategory") || "") : "";
    try {
      await apiRequest("/api/categories", { method: "DELETE", json: { name: name, targetCategory: targetName } });
      closeModal();
      await refreshState();
      toast("分类已删除", targetName ? "关联记录已转入“" + targetName + "”。" : "该分类已从列表移除。", "success");
    } catch (err) {
      toast("删除失败", err.message, "error");
    }
  }

  async function handleProgressForm(form) {
    const task = getTask(form.dataset.id);
    const user = currentUser();
    const content = String(new FormData(form).get("content") || "").trim();
    if (!task) {
      toast("任务不存在", "", "error");
      return;
    }
    if (task.assigneeId !== user.id || task.status !== "in_progress") {
      toast("当前不可记录进展", "只有责任人可以在办理中记录任务进展。", "error");
      return;
    }
    if (!content) {
      toast("请填写本次进展", "", "error");
      return;
    }
    try {
      await apiRequest("/api/tasks/" + encodeURIComponent(task.id) + "/progress", {
        method: "POST", json: { content: content, version: task.version }
      });
      closeModal();
      ui.drawerOpen = true;
      ui.selectedTaskId = task.id;
      await refreshState();
      toast("进展已记录", "已追加到任务进展，不会覆盖之前的记录。", "success");
    } catch (err) {
      toast("记录失败", err.message, "error");
    }
  }

  async function handleReviewForm(form) {
    const mode = form.dataset.mode;
    const id = form.dataset.id;
    const task = getTask(id);
    const user = currentUser();
    const note = String(new FormData(form).get("note") || "").trim();
    if (!task) {
      toast("任务不存在", "", "error");
      return;
    }
    if (mode === "submit") {
      if (task.assigneeId !== user.id || task.status !== "in_progress") {
        toast("当前状态不可提交", "只有责任人可以将办理中的任务提交审核。", "error");
        return;
      }
      if (!note) {
        toast("请填写办理结果", "办理结果会记录到任务进展，供审核人查看。", "error");
        return;
      }
      try {
        await apiRequest("/api/tasks/" + encodeURIComponent(id) + "/submit", {
          method: "POST", json: { note: note, version: task.version }
        });
        closeModal();
        ui.drawerOpen = true;
        ui.selectedTaskId = id;
        await refreshState();
        toast("已提交审核", "等待科长或主任科员确认。", "success");
      } catch (err) {
        toast("提交失败", err.message, "error");
      }
      return;
    }

    if (!canManage()) {
      toast("无权审核", "只有管理成员可以审核任务。", "error");
      return;
    }
    if (task.status !== "review") {
      toast("当前状态不可审核", "该任务不在待审核状态。", "error");
      return;
    }
    if (mode === "reject" && !note) {
      toast("请填写退回意见", "退回任务时需要说明需要补充或修改的内容。", "error");
      return;
    }
    try {
      await apiRequest("/api/tasks/" + encodeURIComponent(id) + "/" + (mode === "approve" ? "approve" : "reject"), {
        method: "POST", json: { note: note, version: task.version }
      });
      closeModal();
      ui.drawerOpen = true;
      ui.selectedTaskId = id;
      await refreshState();
      toast(mode === "approve" ? "审核通过" : "已退回办理",
        mode === "approve" ? "任务已办结并归档。" : "任务已回到办理中，责任人可修改后重新提交。",
        mode === "approve" ? "success" : "info");
    } catch (err) {
      toast("审核失败", err.message, "error");
    }
  }

  /* ---------------- Excel 与备份文件 ---------------- */

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function excelDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()) + " " + pad2(date.getHours()) + ":" + pad2(date.getMinutes());
  }

  function taskProgressText(task) {
    return (task.progress || []).map(function (entry) {
      const actor = getPerson(entry.actorId);
      return excelDateTime(entry.at) + " " + (actor ? actor.name : "系统") + "：" + String(entry.content || "").trim();
    }).join("\n");
  }

  function exportTasks(scope) {
    const lib = window.XlsxExport;
    if (!lib || typeof lib.buildWorkbook !== "function") {
      toast("导出组件未加载", "请刷新页面后重试。", "error");
      return;
    }
    let tasks = [];
    let label = "全部任务";
    if (scope === "open") {
      tasks = state.tasks.filter(isUnfinished);
      label = "未办结任务";
    } else if (scope === "completed") {
      tasks = state.tasks.filter(function (task) { return task.status === "completed"; });
      label = "已办结任务";
    } else if (scope === "filtered") {
      tasks = filteredTasks();
      label = "筛选结果";
    } else {
      tasks = state.tasks.slice();
      label = "全部任务";
    }
    tasks = tasks.slice().sort(function (a, b) {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (b.status === "completed" && a.status !== "completed") return -1;
      if (a.status === "completed" && b.status === "completed") {
        return String(b.completedAt || b.updatedAt).localeCompare(String(a.completedAt || a.updatedAt));
      }
      return dueSortValue(a).localeCompare(dueSortValue(b));
    });
    if (!tasks.length) {
      toast("没有可导出的任务", "当前范围内暂无数据。", "info");
      return;
    }
    const headers = ["序号", "任务编号", "任务名称", "任务类型", "重复周期", "工作分类", "任务来源", "责任人", "任务状态", "截止时间", "到期情况", "开始时间", "创建人", "创建时间", "提交审核时间", "办结时间", "审核人", "审核意见", "任务说明", "任务进展"];
    const rows = tasks.map(function (task, index) {
      const assignee = getPerson(task.assigneeId);
      const creator = getPerson(task.creatorId);
      const reviewer = getPerson(task.reviewerId);
      const due = dueState(task);
      return [
        index + 1,
        task.code || "",
        task.title,
        task.type === "recurring" ? "周期任务" : "一次性任务",
        task.cycle ? CYCLE[task.cycle].label : "—",
        task.category || "",
        taskSource(task),
        assignee ? assignee.name : "未指派",
        statusLabel(task),
        task.dueDate ? task.dueDate + " " + formatDueTime(task) : "",
        due.label,
        excelDateTime(task.startedAt),
        creator ? creator.name : "",
        excelDateTime(task.createdAt),
        excelDateTime(task.submittedAt),
        excelDateTime(task.completedAt),
        reviewer ? reviewer.name : "",
        task.reviewNote || "",
        task.description || "",
        taskProgressText(task)
      ];
    });
    try {
      const bytes = lib.buildWorkbook({
        sheetName: "任务清单",
        headers: headers,
        rows: rows,
        widths: [6, 15, 34, 11, 10, 11, 12, 10, 10, 12, 12, 17, 10, 17, 17, 17, 10, 26, 44, 64]
      });
      const stamp = toISODate(new Date()).replace(/-/g, "") + "-" + pad2(new Date().getHours()) + pad2(new Date().getMinutes());
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      downloadBlob(blob, "科务看板_" + label + "_" + stamp + ".xlsx");
      ui.exportOpen = false;
      renderViewOnly();
      toast("Excel 已导出", label + "共 " + tasks.length + " 项，已生成 .xlsx 文件。", "success");
    } catch (err) {
      console.error(err);
      toast("导出失败", "生成 Excel 文件时出现错误，请重试。", "error");
    }
  }

  async function downloadBackupFile() {
    try {
      let backup = backups[0];
      if (!backup) backup = await createBackup("manual", true);
      toast("正在下载备份", "浏览器将下载主机数据库快照。", "info");
      window.location.href = "/api/backups/" + encodeURIComponent(backup.id);
    } catch (err) {
      toast("下载失败", err.message, "error");
    }
  }

  function restoreSnapshot(backupId) {
    const backup = backups.find(function (item) { return item.id === backupId; });
    if (!backup) {
      toast("未找到备份", "", "error");
      return;
    }
    confirmModal({
      title: "恢复数据库备份",
      description: "当前数据会被该备份覆盖，恢复前主机会自动保留一份当前数据快照。",
      message: "备份时间：" + escapeHtml(formatShortDateTime(backup.createdAt)) + "<br>文件：" + escapeHtml(backup.fileName || backup.id) + "<br>恢复完成后需要重新登录。",
      confirmLabel: "确认恢复",
      tone: "danger",
      onConfirm: async function () {
        try {
          await apiRequest("/api/backups/" + encodeURIComponent(backupId) + "/restore", { method: "POST" });
          toast("数据已恢复", "即将返回登录页，请使用恢复后的账号登录。", "success");
          setTimeout(function () { window.location.href = "/login"; }, 900);
        } catch (err) {
          toast("恢复失败", err.message, "error");
        }
      }
    });
  }

  function uploadRestoreFile(file) {
    if (!file) return;
    if (!/\.db$/i.test(file.name)) {
      toast("文件格式不正确", "请选择科务看板导出的 .db 数据库备份。", "error");
      return;
    }
    confirmModal({
      title: "从文件恢复",
      description: "当前数据会被所选备份覆盖，恢复前主机会自动保留一份当前数据快照。",
      message: "文件：" + escapeHtml(file.name) + "<br>恢复完成后需要重新登录。",
      confirmLabel: "确认恢复",
      tone: "danger",
      onConfirm: async function () {
        const formData = new FormData();
        formData.append("file", file);
        try {
          await apiRequest("/api/backups/upload", { method: "POST", body: formData });
          toast("数据已恢复", "即将返回登录页，请使用恢复后的账号登录。", "success");
          setTimeout(function () { window.location.href = "/login"; }, 900);
        } catch (err) {
          toast("恢复失败", err.message, "error");
        }
      }
    });
  }

  /* ---------------- 人员与周期动作 ---------------- */

  async function togglePerson(personId) {
    const person = getPerson(personId);
    if (!person) return;
    const applyToggle = async function () {
      try {
        await apiRequest("/api/people/" + encodeURIComponent(personId) + "/toggle", { method: "POST" });
        closeModal();
        await refreshState();
        toast(person.active ? "人员已停用" : "人员已启用",
          person.active ? person.name + " 已从在用名单中移除。" : person.name + " 已恢复为在用状态。",
          "info");
      } catch (err) {
        toast("操作失败", err.message, "error");
      }
    };
    if (person.active) {
      confirmModal({
        title: "停用人员",
        description: "停用后该成员不再出现在任务指派中，历史任务记录会保留。",
        message: "确认停用 <strong>" + escapeHtml(person.name) + "</strong>（" + escapeHtml(person.title) + "）吗？",
        confirmLabel: "确认停用",
        tone: "danger",
        onConfirm: applyToggle
      });
      return;
    }
    await applyToggle();
  }

  function toggleSeries(templateId) {
    const template = getTemplate(templateId);
    if (!template) return;
    if (!canManage()) {
      toast("无权操作", "只有管理成员可以调整周期规则。", "error");
      return;
    }
    const applyToggle = async function () {
      try {
        await apiRequest("/api/templates/" + encodeURIComponent(templateId) + "/toggle", { method: "POST" });
        closeModal();
        await refreshState();
        toast(template.active ? "周期任务已暂停" : "周期任务已恢复",
          template.active ? "后续将不再自动生成本期任务。" : "将按周期规则继续生成。",
          "info");
      } catch (err) {
        toast("操作失败", err.message, "error");
      }
    };
    if (template.active) {
      confirmModal({
        title: "暂停周期任务",
        description: "暂停后不再自动生成新的期次。",
        message: "已生成的各期任务不受影响，历史记录继续保留。确认暂停“" + escapeHtml(template.title) + "”吗？",
        confirmLabel: "暂停周期",
        onConfirm: applyToggle
      });
      return;
    }
    applyToggle();
  }

  /* ---------------- 事件处理 ---------------- */

  function handleAction(action, el, event) {
    if (!action) return;
    if (action === "modal-backdrop") {
      if (event.target === el) closeModal();
      return;
    }
    if (action === "drawer-backdrop") {
      closeDrawer();
      return;
    }
    if (action === "toggle-sidebar") {
      const sidebar = document.getElementById("sidebar");
      const scrim = document.getElementById("sidebar-scrim");
      if (sidebar) sidebar.classList.toggle("open");
      if (scrim) scrim.classList.toggle("show");
      return;
    }
    if (action === "close-sidebar") {
      closeSidebar();
      return;
    }
    if (action === "close-drawer") { closeDrawer(); return; }
    if (action === "close-modal") { closeModal(); return; }
    if (action === "close-toast") { closeToast(el.dataset.toast); return; }

    if (action === "new-task") {
      if (!canCreateTasks()) { toast("无权新建任务", "当前成员不可新建任务。", "error"); return; }
      const requestedType = el.dataset.type === "recurring" && canManage() ? "recurring" : "one-time";
      taskModal(null, { type: requestedType });
      return;
    }
    if (action === "edit-task") {
      const task = getTask(el.dataset.id);
      if (!task) return;
      if (!canEditTask(task)) { toast("无法编辑", "已办结或当前不可编辑的任务不能修改。", "error"); return; }
      taskModal(task);
      return;
    }
    if (action === "open-task") {
      if (event && event.target.closest(".task-check-cell")) return;
      openDrawer(el.dataset.id);
      return;
    }
    if (action === "bulk-delete") {
      requestDeleteTasks(Array.from(ui.selectedTaskIds || []));
      return;
    }
    if (action === "clear-task-selection") {
      ui.selectedTaskIds = new Set();
      renderViewOnly();
      return;
    }
    if (action === "delete-task") {
      requestDeleteTasks([el.dataset.id]);
      return;
    }
    if (action === "restore-deleted") {
      restoreDeletedTask(el.dataset.id);
      return;
    }
    if (action === "purge-deleted") {
      permanentlyDeleteTask(el.dataset.id);
      return;
    }
    if (action === "empty-recycle") {
      emptyRecycleBin();
      return;
    }
    if (action === "change-password") { closePopovers(); changeOwnPassword(); return; }
    if (action === "start-task") { startTask(el.dataset.id); return; }
    if (action === "logout-account") { closePopovers(); logout(); return; }
    if (action === "add-progress") {
      const task = getTask(el.dataset.id);
      if (!task) return;
      progressModal(task);
      return;
    }
    if (action === "submit-task") {
      const task = getTask(el.dataset.id);
      if (!task) return;
      if (task.assigneeId !== currentUser().id || task.status !== "in_progress") {
        toast("当前状态不可提交", "只有责任人可以将办理中的任务提交审核。", "error");
        return;
      }
      reviewModal(task, "submit");
      return;
    }
    if (action === "review-task") {
      const task = getTask(el.dataset.id);
      if (!task) return;
      if (!canManage() || task.status !== "review") {
        toast("当前状态不可审核", "任务不在待审核状态。", "error");
        return;
      }
      reviewModal(task, el.dataset.mode);
      return;
    }
    if (action === "withdraw-task") { withdrawTask(el.dataset.id); return; }

    if (action === "filter-tasks") {
      // 首页指标是全科口径，点进清单时保留全科范围，避免数字与列表不一致。
      navigate("tasks", { status: el.dataset.status || "all", due: el.dataset.due || "all", assignee: "all" });
      return;
    }
    if (action === "filter-due") {
      navigate("tasks", { due: el.dataset.due || "all", assignee: "all" });
      return;
    }
    if (action === "task-status") {
      ui.taskStatus = el.dataset.status || "all";
      ui.selectedTaskIds = new Set();
      ui.exportOpen = false;
      renderViewOnly();
      return;
    }
    if (action === "reset-task-filters") {
      ui.taskStatus = "all";
      ui.taskSearch = "";
      ui.taskAssignee = defaultTaskAssignee();
      ui.taskType = "all";
      ui.sourceFilter = "all";
      ui.dueFilter = "all";
      ui.selectedTaskIds = new Set();
      ui.exportOpen = false;
      renderViewOnly();
      return;
    }
    if (action === "view-all-tasks") {
      ui.taskAssignee = "all";
      ui.exportOpen = false;
      renderViewOnly();
      return;
    }
    if (action === "attention-tab") {
      ui.attentionTab = el.dataset.tab === "review" ? "review" : "all";
      renderViewOnly();
      return;
    }
    if (action === "reminder-tab") {
      ui.reminderTab = el.dataset.tab === "overdue" ? "overdue" : "upcoming";
      renderViewOnly();
      return;
    }
    if (action === "dismiss-banner") {
      ui.bannerDismissed = true;
      renderViewOnly();
      return;
    }
    if (action === "view-my-tasks" || action === "view-all-reminders") {
      navigate("tasks");
      return;
    }
    if (action === "go-recurring") { navigate("recurring"); return; }
    if (action === "go-archive") { navigate("archive"); return; }

    if (action === "toggle-export") {
      ui.exportOpen = !ui.exportOpen;
      renderViewOnly();
      return;
    }
    if (action === "export") {
      exportTasks(el.dataset.scope || "all");
      return;
    }
    if (action === "open-report") {
      reportModal();
      return;
    }
    if (action === "calendar-prev") { shiftCalendar(-1, 0); return; }
    if (action === "calendar-next") { shiftCalendar(1, 0); return; }
    if (action === "calendar-prev-year") { shiftCalendar(0, -1); return; }
    if (action === "calendar-next-year") { shiftCalendar(0, 1); return; }
    if (action === "calendar-today") {
      const today = new Date();
      ui.calendarYear = today.getFullYear();
      ui.calendarMonth = today.getMonth();
      ui.calendarSelectedDate = toISODate(today);
      renderViewOnly();
      return;
    }
    if (action === "calendar-day") {
      ui.calendarSelectedDate = el.dataset.date || null;
      renderViewOnly();
      setTimeout(function () {
        const panel = document.querySelector(".calendar-day-panel");
        if (panel) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 40);
      return;
    }
    if (action === "sync-holidays") { syncHolidays(); return; }
    if (action === "trigger-holiday-import") {
      const input = document.getElementById("holiday-file");
      if (input) input.click();
      return;
    }
    if (action === "report-export-word" || action === "report-export-excel") {
      exportWorkReport(action === "report-export-word" ? "word" : "excel");
      return;
    }

    if (action === "add-person") { if (canManage()) personModal(null); return; }
    if (action === "edit-person") {
      const person = getPerson(el.dataset.id);
      if (person && canManage()) personModal(person);
      return;
    }
    if (action === "toggle-person") { togglePerson(el.dataset.id); return; }
    if (action === "reset-person-password") { resetPersonPassword(el.dataset.id); return; }

    if (action === "set-theme") { setTheme(el.dataset.themeId); return; }

    if (action === "add-category") { if (canManage()) categoryModal(null); return; }
    if (action === "edit-category") {
      const category = state.categories.find(function (cat) { return cat.name === el.dataset.name; });
      if (category && canManage()) categoryModal(category);
      return;
    }
    if (action === "toggle-category") { toggleCategory(el.dataset.name); return; }
    if (action === "delete-category") {
      const category = state.categories.find(function (cat) { return cat.name === el.dataset.name; });
      if (category) categoryDeleteModal(category);
      return;
    }

    if (action === "backup-now") { createBackup("manual", false).catch(function (err) { toast("备份失败", err.message, "error"); }); return; }
    if (action === "download-backup") { downloadBackupFile(); return; }
    if (action === "download-snapshot") { window.location.href = "/api/backups/" + encodeURIComponent(el.dataset.id); return; }
    if (action === "trigger-restore-file") {
      const input = document.getElementById("restore-file");
      if (input) input.click();
      return;
    }
    if (action === "restore-snapshot") { restoreSnapshot(el.dataset.id); return; }
    if (action === "run-confirm") {
      const fn = pendingConfirm;
      pendingConfirm = null;
      closeModal();
      if (typeof fn === "function") fn();
      return;
    }

    if (action === "series-history") {
      const template = getTemplate(el.dataset.id);
      if (template) seriesHistoryModal(template);
      return;
    }
    if (action === "toggle-series") { toggleSeries(el.dataset.id); return; }

    if (action === "open-help") { closePopovers(); helpModal(); return; }
  }

  function onDocumentClick(event) {
    const actionEl = event.target.closest("[data-action]");
    const wasExportOpen = ui.exportOpen;
    if (actionEl) {
      handleAction(actionEl.getAttribute("data-action"), actionEl, event);
      if (actionEl.getAttribute("data-action") !== "toggle-export" && ui.exportOpen) {
        ui.exportOpen = false;
        if (currentRoute === "tasks") renderViewOnly();
      }
    }

    if (!event.target.closest("details.popover-wrap")) closePopovers();

    if (wasExportOpen && !event.target.closest(".export-wrap") && !actionEl) {
      ui.exportOpen = false;
      if (currentRoute === "tasks") renderViewOnly();
    }
  }

  function refreshTaskSearch(value) {
    ui.taskSearch = value;
    ui.selectedTaskIds = new Set();
    ui.exportOpen = false;
    const tabs = document.querySelector(".status-tabs");
    if (tabs) tabs.outerHTML = statusTabs();
    const region = document.getElementById("task-list-region");
    if (region) region.innerHTML = renderTaskListRegion();
  }

  function onInput(event) {
    const target = event.target;
    if (target.id === "task-search") {
      refreshTaskSearch(target.value);
      return;
    }
    if (target.id === "archive-search") {
      ui.archiveSearch = target.value;
      const region = document.getElementById("archive-region");
      if (region) region.innerHTML = renderArchiveRegion();
    }
  }

  function onChange(event) {
    const target = event.target;
    if (target.classList && target.classList.contains("task-check")) {
      if (!ui.selectedTaskIds) ui.selectedTaskIds = new Set();
      if (target.checked) ui.selectedTaskIds.add(target.dataset.id);
      else ui.selectedTaskIds.delete(target.dataset.id);
      renderViewOnly();
      return;
    }
    if (target.classList && target.classList.contains("task-select-all")) {
      const visible = currentRoute === "archive" ? filteredArchiveTasks() : filteredTasks();
      if (!ui.selectedTaskIds) ui.selectedTaskIds = new Set();
      if (target.checked) visible.forEach(function (task) { ui.selectedTaskIds.add(task.id); });
      else ui.selectedTaskIds.clear();
      renderViewOnly();
      return;
    }
    if (target.id === "task-search") {
      refreshTaskSearch(target.value);
      return;
    }
    if (target.id === "archive-search") {
      ui.archiveSearch = target.value;
      ui.selectedTaskIds = new Set();
      const region = document.getElementById("archive-region");
      if (region) region.innerHTML = renderArchiveRegion();
      return;
    }
    if (target.id === "filter-assignee") {
      ui.taskAssignee = target.value;
      ui.selectedTaskIds = new Set();
      renderViewOnly();
      return;
    }
    if (target.id === "filter-type") {
      ui.taskType = target.value;
      ui.selectedTaskIds = new Set();
      renderViewOnly();
      return;
    }
    if (target.id === "filter-source") {
      ui.sourceFilter = target.value;
      ui.selectedTaskIds = new Set();
      renderViewOnly();
      return;
    }
    if (["report-period", "report-scope", "report-include-open", "report-start", "report-end"].indexOf(target.id) !== -1) {
      refreshReportPreview();
      return;
    }
    if (target.id === "filter-due") {
      ui.dueFilter = target.value;
      ui.selectedTaskIds = new Set();
      renderViewOnly();
      return;
    }
    if (target.id === "holiday-file") {
      const file = target.files && target.files[0];
      target.value = "";
      importHolidayFile(file);
      return;
    }
    if (target.name === "taskType") {
      syncTaskTypeFields();
      return;
    }
    if (target.id === "auto-backup-toggle") {
      const enabled = Boolean(target.checked);
      apiRequest("/api/settings", {
        method: "POST",
        json: { autoBackupEnabled: enabled, backupIntervalHours: Number(state.settings.backupIntervalHours) || 24 }
      }).then(function () {
        return refreshState();
      }).then(function () {
        toast("备份设置已更新", enabled ? "自动备份已开启。" : "自动备份已关闭。", "info");
      }).catch(function (err) {
        target.checked = !enabled;
        toast("设置保存失败", err.message, "error");
      });
      return;
    }
    if (target.id === "restore-file") {
      const file = target.files && target.files[0];
      target.value = "";
      uploadRestoreFile(file);
      return;
    }
  }

  function onSubmit(event) {
    const form = event.target;
    const handlers = {
      "task-form": handleTaskForm,
      "person-form": handlePersonForm,
      "category-form": handleCategoryForm,
      "category-delete-form": handleCategoryDeleteForm,
      "review-form": handleReviewForm,
      "progress-form": handleProgressForm
    };
    const handler = handlers[form.id];
    if (!handler) return;
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton && submitButton.disabled) return;
    if (submitButton) submitButton.disabled = true;
    Promise.resolve(handler(form)).catch(function (err) {
      console.error(err);
      toast("操作失败", err.message || "请稍后重试。", "error");
    }).finally(function () {
      if (submitButton && document.body.contains(submitButton)) submitButton.disabled = false;
    });
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") return;
    const modal = document.querySelector(".modal-backdrop");
    if (modal) {
      closeModal();
      return;
    }
    if (ui.drawerOpen) {
      closeDrawer();
      return;
    }
    closeSidebar();
    closePopovers();
  }

  /* ---------------- 初始化 ---------------- */

  let pollInFlight = false;

  async function pollServerState() {
    if (pollInFlight || document.hidden) return;
    if (document.querySelector(".modal-backdrop") || ui.drawerOpen) return;
    const active = document.activeElement;
    if (active && ["INPUT", "TEXTAREA", "SELECT"].indexOf(active.tagName) !== -1) return;
    pollInFlight = true;
    try {
      await loadServerState();
      renderAll();
    } catch (err) {
      // 网络短暂中断时保留当前界面，下一次轮询继续。
    } finally {
      pollInFlight = false;
    }
  }

  async function init() {
    hydrateStaticIcons();
    applyTheme(storedTheme());
    try {
      await loadServerState();
    } catch (err) {
      const boot = document.getElementById("boot-screen");
      if (boot) {
        boot.innerHTML = '<strong style="color:var(--danger)">无法载入工作台</strong><span>' + escapeHtml(err.message || "请刷新页面重试。") + "</span>" +
          '<button type="button" class="btn btn-primary" onclick="location.reload()">重新加载</button>';
      }
      return;
    }

    const parsed = parseRoute();
    currentRoute = parsed.name;
    if (currentRoute === "settings" && !canManage()) currentRoute = "dashboard";
    if (!location.hash) history.replaceState(null, "", "#" + currentRoute);
    if (location.hash !== "#" + currentRoute) history.replaceState(null, "", "#" + currentRoute);

    document.addEventListener("click", onDocumentClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("hashchange", handleRoute);

    if (currentRoute === "tasks") {
      ui.taskStatus = parsed.params.get("status") || "all";
      ui.dueFilter = parsed.params.get("due") || "all";
      ui.taskType = parsed.params.get("type") || "all";
      ui.taskSearch = parsed.params.get("q") || "";
      ui.taskAssignee = resolveTaskAssignee(parsed.params.get("assignee"));
    }

    renderAll();
    const boot = document.getElementById("boot-screen");
    if (boot) boot.remove();
    window.setInterval(pollServerState, 30000);
    window.addEventListener("focus", pollServerState);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();





