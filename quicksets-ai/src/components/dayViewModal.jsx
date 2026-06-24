import React from "react";
import { createPortal } from "react-dom";
import "./dayViewModal.css";
import {
  formatMeasurementLabel,
  getSetDisplayLabel,
  parseLocalDate,
} from "../utils/workoutDomain";
import { getWorkoutColor } from "../utils/workoutColors";

const setFields = [
  { key: "reps", label: "Reps", fallbackUnit: "" },
  { key: "weight", label: "Weight", fallbackUnit: "lbs" },
  { key: "duration", label: "Time", fallbackUnit: "" },
  { key: "distance", label: "Distance", fallbackUnit: "mi" },
];

export function DayViewModal({
  date,
  sessions = [],
  onClose,
  onEditSession,
  onDeleteSession,
  eyebrow = "View Day",
}) {
  const [expandedSessionKeys, setExpandedSessionKeys] = React.useState([]);
  const [openSessionMenuKey, setOpenSessionMenuKey] = React.useState(null);
  const sortedSessions = React.useMemo(
    () => sortDaySessions(sessions),
    [sessions]
  );
  const totalSets = React.useMemo(
    () => sortedSessions.reduce((sum, session) => sum + (session.sets?.length || 0), 0),
    [sortedSessions]
  );

  React.useEffect(() => {
    setExpandedSessionKeys([]);
    setOpenSessionMenuKey(null);
  }, [date]);

  React.useEffect(() => {
    const visibleSessionKeys = new Set(sortedSessions.map(getSessionKey));
    setExpandedSessionKeys((currentKeys) =>
      currentKeys.filter((sessionKey) => visibleSessionKeys.has(sessionKey))
    );
  }, [sortedSessions]);

  const toggleExpandedSession = React.useCallback((sessionKey) => {
    setExpandedSessionKeys((currentKeys) =>
      currentKeys.includes(sessionKey)
        ? currentKeys.filter((currentKey) => currentKey !== sessionKey)
        : [...currentKeys, sessionKey]
    );
  }, []);

  React.useEffect(() => {
    if (!openSessionMenuKey) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (event.target?.closest?.("[data-day-view-menu-root='true']")) {
        return;
      }

      setOpenSessionMenuKey(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [openSessionMenuKey]);

  React.useEffect(() => {
    if (!date) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [date, onClose]);

  if (!date || typeof document === "undefined") {
    return null;
  }

  const readableDate = formatDayModalDate(date);

  return createPortal(
    <div
      className="day-view-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <section
        className="day-view-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-view-modal-title"
      >
        <header className="day-view-header">
          <div>
            <p className="day-view-eyebrow">{eyebrow}</p>
            <h2 id="day-view-modal-title">{readableDate}</h2>
          </div>
          <button
            type="button"
            className="day-view-close"
            aria-label="Close day view"
            onClick={onClose}
          >
            X
          </button>
        </header>

        <div className="day-view-summary" aria-label="Day summary">
          <span>
            <strong>{sortedSessions.length}</strong>
            session{sortedSessions.length === 1 ? "" : "s"}
          </span>
          <span>
            <strong>{totalSets}</strong>
            set{totalSets === 1 ? "" : "s"}
          </span>
        </div>

        {sortedSessions.length > 0 ? (
          <div className="day-view-session-list">
            {sortedSessions.map((session) => {
              const sessionKey = getSessionKey(session);

              return (
                <DayViewSessionCard
                  key={sessionKey}
                  session={session}
                  isExpanded={expandedSessionKeys.includes(sessionKey)}
                  isMenuOpen={openSessionMenuKey === sessionKey}
                  onToggle={() => toggleExpandedSession(sessionKey)}
                  onToggleMenu={() => setOpenSessionMenuKey((currentKey) => currentKey === sessionKey ? null : sessionKey)}
                  onEdit={onEditSession ? () => {
                    setOpenSessionMenuKey(null);
                    onEditSession(session);
                  } : null}
                  onDelete={onDeleteSession ? () => {
                    setOpenSessionMenuKey(null);
                    onDeleteSession(session);
                  } : null}
                />
              );
            })}
          </div>
        ) : (
          <div className="day-view-empty">
            <p>No sessions logged for this day.</p>
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}

function DayViewSessionCard({
  session,
  isExpanded,
  isMenuOpen,
  onToggle,
  onToggleMenu,
  onEdit,
  onDelete,
}) {
  const sessionColor = getWorkoutColor(session);
  const sessionName = session.isMixed
    ? "Full Workout"
    : (session.templateName || session.exercise || "Exercise");
  const visibleFields = getVisibleSetFields(session);
  const hasMenuActions = Boolean(onEdit || onDelete);
  const notes = typeof session.notes === "string" ? session.notes.trim() : "";

  return (
    <article
      className={isExpanded ? "day-view-session-card is-expanded" : "day-view-session-card"}
      style={{ "--day-session-color": sessionColor }}
    >
      <div className="day-view-session-header">
        <button
          type="button"
          className="day-view-session-toggle"
          aria-expanded={isExpanded}
          onClick={onToggle}
        >
          <span className="day-view-session-dot" aria-hidden="true" />
          <span className="day-view-session-header-copy">
            <span className="day-view-session-title">{sessionName}</span>
            <span className="day-view-session-subtitle">
              {session.sets?.length || 0} set{session.sets?.length === 1 ? "" : "s"}
            </span>
          </span>
          {notes && (
            <span className="day-view-session-header-notes" title={notes}>
              {notes}
            </span>
          )}
        </button>

        {hasMenuActions && (
          <div className="day-view-session-menu" data-day-view-menu-root="true">
            <button
              type="button"
              className="day-view-session-menu-trigger"
              aria-label={`Manage ${sessionName}`}
              aria-expanded={isMenuOpen}
              onClick={onToggleMenu}
            >
              ...
            </button>
            {isMenuOpen && (
              <div className="day-view-session-menu-popover">
                {onEdit && (
                  <button type="button" className="day-view-session-menu-item" onClick={onEdit}>
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button type="button" className="day-view-session-menu-item delete" onClick={onDelete}>
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="day-view-session-details">
          {Array.isArray(session.sets) && session.sets.length > 0 ? (
            <div className="day-view-set-list">
              {session.sets.map((set, index) => (
                <div key={set.id ?? index} className="day-view-set-row">
                  <span className="day-view-set-label">
                    Set {getSetDisplayLabel(set, session.sets, index)}
                  </span>
                  <span className="day-view-set-values">
                    {formatDaySetValues(set, visibleFields, getSetMeasurements(session, set))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="day-view-no-sets">No sets saved.</p>
          )}
        </div>
      )}
    </article>
  );
}

function getVisibleSetFields(session) {
  const savedFields = session?.fields;
  if (savedFields) {
    return setFields.filter((field) => savedFields[field.key]);
  }

  return setFields.filter((field) =>
    Array.isArray(session?.sets) && session.sets.some((set) => hasValue(set?.[field.key]))
  );
}

function formatDaySetValues(set, visibleFields, measurements) {
  const values = visibleFields
    .map((field) => {
      const value = set?.[field.key];
      if (!hasValue(value)) {
        return null;
      }

      const unit = getSetFieldUnit(field, measurements);
      return `${field.label}: ${value}${unit ? ` ${unit}` : ""}`;
    })
    .filter(Boolean);

  return values.length > 0 ? values.join(" | ") : "No tracked values";
}

function getSetFieldUnit(field, measurements) {
  if (field.key === "weight") {
    return formatMeasurementLabel(measurements?.weight, field.fallbackUnit);
  }

  if (field.key === "distance") {
    return formatMeasurementLabel(measurements?.distance, field.fallbackUnit);
  }

  return field.fallbackUnit;
}

function getSetMeasurements(session, set) {
  return session?.isMixed
    ? set?.measurements || session?.measurements || {}
    : session?.measurements || {};
}

function hasValue(value) {
  return value !== undefined && value !== null && `${value}` !== "";
}

function sortDaySessions(sessions) {
  return [...sessions].sort((left, right) => {
    const leftOrder = getDayOrder(left);
    const rightOrder = getDayOrder(right);

    if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    const leftTime = getSessionTime(left);
    const rightTime = getSessionTime(right);

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return `${left.id || ""}`.localeCompare(`${right.id || ""}`);
  });
}

function getSessionKey(session) {
  return `${session?.sourceWorkoutId || session?.id || session?._id || ""}`;
}

function getDayOrder(session) {
  const numericOrder = Number(session?.dayOrder);
  return Number.isFinite(numericOrder) ? numericOrder : null;
}

function getSessionTime(session) {
  const createdAtTime = Date.parse(session?.createdAt || "");
  if (!Number.isNaN(createdAtTime)) {
    return createdAtTime;
  }

  const objectIdValue = typeof session?._id === "string"
    ? session._id
    : session?._id?.toString?.();

  if (objectIdValue && /^[a-f0-9]{24}$/i.test(objectIdValue)) {
    return parseInt(objectIdValue.slice(0, 8), 16) * 1000;
  }

  return 0;
}

function formatDayModalDate(date) {
  return parseLocalDate(date).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
