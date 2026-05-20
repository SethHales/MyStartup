export function getTodayLocal() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateValue) {
  if (!dateValue) {
    return new Date();
  }

  const [year, month, day] = `${dateValue}`.split("-").map(Number);
  if ([year, month, day].some((part) => Number.isNaN(part))) {
    return new Date(dateValue);
  }

  return new Date(year, month - 1, day);
}

export function formatDurationFromParts(hours, minutes) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

export function parseDurationToParts(duration) {
  const parts = `${duration || "00:00:00"}`
    .split(":")
    .map((part) => Number(part));

  if (parts.length === 3 && parts.every((part) => Number.isFinite(part) && part >= 0)) {
    return {
      hours: Math.min(23, Math.max(0, Math.floor(parts[0]))),
      minutes: Math.min(59, Math.max(0, Math.floor(parts[1]))),
    };
  }

  if (parts.length === 2 && parts.every((part) => Number.isFinite(part) && part >= 0)) {
    const totalMinutes = Math.floor(parts[0]);
    return {
      hours: Math.min(23, Math.floor(totalMinutes / 60)),
      minutes: Math.min(59, totalMinutes % 60),
    };
  }

  return { hours: 0, minutes: 0 };
}

export function getTotalMinutes(duration) {
  const { hours, minutes } = parseDurationToParts(duration);
  return hours * 60 + minutes;
}

export function formatDurationLabel(duration) {
  const { hours, minutes } = parseDurationToParts(duration);
  const parts = [];

  if (hours > 0) {
    parts.push(`${hours} hr${hours === 1 ? "" : "s"}`);
  }

  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} min`);
  }

  return parts.join(" ");
}

export function formatStudyDate(dateValue) {
  const date = parseLocalDate(dateValue);
  const now = new Date();
  const showYear = date.getFullYear() !== now.getFullYear();

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
  });
}

export function formatStudyDayLabel(dateValue) {
  const date = parseLocalDate(dateValue);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function groupSessionsByMonth(sessions) {
  const currentYear = new Date().getFullYear();
  const groups = [];
  const groupMap = new Map();

  sessions.forEach((session) => {
    const sessionDate = parseLocalDate(session.date);
    const monthLabel = sessionDate.toLocaleDateString("en-US", {
      month: "long",
      ...(sessionDate.getFullYear() !== currentYear ? { year: "numeric" } : {}),
    });
    const key = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, "0")}`;

    if (!groupMap.has(key)) {
      const group = { key, label: monthLabel, sessions: [] };
      groupMap.set(key, group);
      groups.push(group);
    }

    groupMap.get(key).sessions.push(session);
  });

  return groups;
}
