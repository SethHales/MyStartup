import React from "react";
import { createPortal } from "react-dom";
import "./history.css";
import { DatePicker } from "../components/datePicker";
import { StudyDurationPicker } from "../components/studyDurationPicker";
import {
  formatDurationLabel,
  formatStudyDate,
  getTodayLocal,
  getTotalMinutes,
  parseLocalDate,
} from "../utils/studySessions";

const DEFAULT_DURATION = "00:15:00";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthStart(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : parseLocalDate(dateValue);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatCalendarDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatCalendarMonth(date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatDayHeading(dateValue) {
  return parseLocalDate(dateValue).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function buildCalendarDays(monthDate) {
  const firstOfMonth = getMonthStart(monthDate);
  const calendarStart = new Date(firstOfMonth);
  calendarStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  const lastOfMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0);
  const calendarEnd = new Date(lastOfMonth);
  calendarEnd.setDate(lastOfMonth.getDate() + (6 - lastOfMonth.getDay()));
  const dayCount = Math.round((calendarEnd - calendarStart) / (1000 * 60 * 60 * 24)) + 1;

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);

    return {
      date,
      key: formatCalendarDateKey(date),
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
      isToday: formatCalendarDateKey(date) === getTodayLocal(),
    };
  });
}

function sortSessionsNewestFirst(sessions) {
  return [...sessions].sort((first, second) => {
    const dateCompare = new Date(`${second.date}T00:00:00`) - new Date(`${first.date}T00:00:00`);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return String(second.id).localeCompare(String(first.id));
  });
}

function getHeatLevel(minutes) {
  if (minutes <= 0) {
    return 0;
  }

  if (minutes < 20) {
    return 1;
  }

  if (minutes < 40) {
    return 2;
  }

  if (minutes < 60) {
    return 3;
  }

  return 4;
}

function shiftDateKey(dateKey, offset) {
  const date = parseLocalDate(dateKey);
  date.setDate(date.getDate() + offset);
  return formatCalendarDateKey(date);
}

function getStudyStreakStats(sessions) {
  const studyDates = new Set(sessions.map((session) => session.date).filter(Boolean));

  if (studyDates.size === 0) {
    return { current: 0, longest: 0 };
  }

  const today = getTodayLocal();
  let cursor = studyDates.has(today) ? today : shiftDateKey(today, -1);
  let current = 0;

  while (studyDates.has(cursor)) {
    current += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  const sortedDates = [...studyDates].sort();
  let longest = 0;
  let running = 0;
  let previousDate = null;

  sortedDates.forEach((dateKey) => {
    running = previousDate && shiftDateKey(previousDate, 1) === dateKey ? running + 1 : 1;
    longest = Math.max(longest, running);
    previousDate = dateKey;
  });

  return { current, longest };
}

function createSessionDraft(session) {
  return {
    date: session.date,
    duration: session.duration,
    content: session.content || "",
    notes: session.notes || "",
  };
}

export function History() {
  const [sessions, setSessions] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedDay, setSelectedDay] = React.useState(null);
  const [focusedSessionId, setFocusedSessionId] = React.useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [draftSession, setDraftSession] = React.useState(null);
  const [isSessionModalClosing, setIsSessionModalClosing] = React.useState(false);
  const [isSavingSession, setIsSavingSession] = React.useState(false);
  const [saveNotice, setSaveNotice] = React.useState("");
  const [visibleMonth, setVisibleMonth] = React.useState(() => getMonthStart());
  const [calendarDirection, setCalendarDirection] = React.useState("current");

  const loadSessions = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/study-sessions", {
        method: "GET",
        credentials: "include",
      });

      const body = await response.json().catch(() => []);
      if (response.ok) {
        setSessions(sortSessionsNewestFirst(body));
      }
    } catch (err) {
      console.error("Failed to load study sessions:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const sessionsByDate = React.useMemo(() => {
    const map = new Map();

    sessions.forEach((session) => {
      if (!map.has(session.date)) {
        map.set(session.date, []);
      }

      map.get(session.date).push(session);
    });

    map.forEach((daySessions) => {
      daySessions.sort((first, second) => String(second.id).localeCompare(String(first.id)));
    });

    return map;
  }, [sessions]);

  const focusedSession = sessions.find((session) => session.id === focusedSessionId) || null;
  const selectedDaySessions = selectedDay ? sessionsByDate.get(selectedDay) || [] : [];
  const calendarDays = React.useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const visibleMonthKey = getMonthKey(visibleMonth);
  const visibleMonthSessions = React.useMemo(
    () => sessions.filter((session) => getMonthKey(parseLocalDate(session.date)) === visibleMonthKey),
    [sessions, visibleMonthKey]
  );
  const visibleMonthMinutes = visibleMonthSessions.reduce(
    (sum, session) => sum + getTotalMinutes(session.duration),
    0
  );
  const calendarMonthLabel = formatCalendarMonth(visibleMonth);
  const isViewingCurrentMonth = visibleMonthKey === getMonthKey(getMonthStart());
  const totalMinutes = sessions.reduce((sum, session) => sum + getTotalMinutes(session.duration), 0);
  const streakStats = React.useMemo(() => getStudyStreakStats(sessions), [sessions]);

  const openAddModal = (date = getTodayLocal()) => {
    setIsSessionModalClosing(false);
    setIsAddModalOpen(true);
    setDraftSession({
      date,
      duration: DEFAULT_DURATION,
      content: "",
      notes: "",
    });
  };

  const openFocusedSession = (session) => {
    setSelectedDay(null);
    setFocusedSessionId(session.id);
    setDraftSession(createSessionDraft(session));
    setSaveNotice("");
  };

  const closeSessionModal = () => {
    if (!isAddModalOpen) {
      return;
    }

    setIsSessionModalClosing(true);
    setIsSavingSession(false);

    window.setTimeout(() => {
      setIsAddModalOpen(false);
      setDraftSession(null);
      setIsSessionModalClosing(false);
    }, 220);
  };

  const clearAddModal = () => {
    setIsAddModalOpen(false);
    setDraftSession(null);
    setIsSessionModalClosing(false);
    setIsSavingSession(false);
  };

  const handleBackToCalendar = () => {
    setFocusedSessionId(null);
    setDraftSession(null);
    setSaveNotice("");
  };

  const handleShiftMonth = (offset) => {
    setCalendarDirection(offset > 0 ? "next" : "previous");
    setVisibleMonth((currentMonth) => new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + offset,
      1
    ));
    setSelectedDay(null);
  };

  const handleJumpToToday = () => {
    setCalendarDirection("current");
    setVisibleMonth(getMonthStart());
    setSelectedDay(null);
  };

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm("Delete this study entry? This cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`/api/study-sessions/${sessionId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        alert(body.msg || "Failed to delete study session");
        return;
      }

      setSessions((currentSessions) => currentSessions.filter((session) => session.id !== sessionId));
      if (focusedSessionId === sessionId) {
        handleBackToCalendar();
      }
    } catch (err) {
      console.error("Failed to delete study session:", err);
      alert("Unable to connect to the server");
    }
  };

  const handleSaveSession = async (event) => {
    event.preventDefault();

    if (!draftSession?.date || getTotalMinutes(draftSession.duration) <= 0) {
      alert("Please choose a date and a study duration before saving.");
      return;
    }

    const isEditingSession = Boolean(focusedSessionId);
    setIsSavingSession(true);
    setSaveNotice("");

    try {
      const response = await fetch(
        isEditingSession ? `/api/study-sessions/${focusedSessionId}` : "/api/study-sessions",
        {
          method: isEditingSession ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(draftSession),
        }
      );

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(body.msg || "Failed to save study session");
        return;
      }

      setSessions((currentSessions) => {
        const nextSessions = isEditingSession
          ? currentSessions.map((session) => session.id === body.id ? body : session)
          : [body, ...currentSessions];

        return sortSessionsNewestFirst(nextSessions);
      });

      if (isEditingSession) {
        setDraftSession(createSessionDraft(body));
        setSaveNotice("Saved");
      } else {
        clearAddModal();
      }
    } catch (err) {
      console.error("Failed to save study session:", err);
      alert("Unable to connect to the server");
    } finally {
      setIsSavingSession(false);
    }
  };

  const renderFields = (summaryLabel) => (
    <>
      <label className="study-history-input-block">
        <span>Date</span>
        <DatePicker
          value={draftSession.date}
          onChange={(nextDate) => setDraftSession((current) => ({ ...current, date: nextDate }))}
          ariaLabel="Session date"
        />
      </label>

      <div className="study-history-input-block">
        <span>Duration</span>
        <StudyDurationPicker
          duration={draftSession.duration}
          onChange={(nextDuration) => setDraftSession((current) => ({ ...current, duration: nextDuration }))}
          summaryLabel={summaryLabel}
        />
      </div>

      <label className="study-history-input-block">
        <span>Content Studied</span>
        <input
          type="text"
          placeholder="For example: 1 Nephi 3, Alma 32, Come Follow Me, or conference talk."
          value={draftSession.content}
          onChange={(event) => setDraftSession((current) => ({ ...current, content: event.target.value }))}
        />
      </label>

      <label className="study-history-input-block">
        <span>Notes</span>
        <textarea
          rows="7"
          placeholder="What stood out? Add a verse, thought, question, or prompting."
          value={draftSession.notes}
          onChange={(event) => setDraftSession((current) => ({ ...current, notes: event.target.value }))}
        />
      </label>
    </>
  );

  return (
    <main>
      <div className="main-formatting">
        {focusedSession && draftSession ? (
          <section className="study-entry-focus">
            <div className="study-entry-focus-toolbar">
              <button type="button" className="study-entry-back-button" onClick={handleBackToCalendar}>
                <span aria-hidden="true">&larr;</span>
                Back to calendar
              </button>
              {saveNotice ? <p className="study-entry-save-notice">{saveNotice}</p> : null}
            </div>

            <article className="study-entry-page">
              <div className="study-entry-page-header">
                <p className="study-history-kicker">Study Reflection</p>
                <h2>{draftSession.content || "Scripture study entry"}</h2>
                <p>
                  {formatStudyDate(draftSession.date)}
                  <span aria-hidden="true"> / </span>
                  {formatDurationLabel(draftSession.duration)}
                </p>
              </div>

              <form className="study-entry-focus-form" onSubmit={handleSaveSession}>
                {renderFields("Study time")}
                <div className="study-entry-focus-actions">
                  <button
                    type="button"
                    className="study-entry-delete-button"
                    onClick={() => handleDeleteSession(focusedSession.id)}
                  >
                    Delete Entry
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSavingSession}>
                    {isSavingSession ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </article>
          </section>
        ) : (
          <div className="study-history-layout">
            <section className="study-history-hero">
              <div className="study-history-hero-copy">
                <div>
                  <p className="study-history-kicker">Study Journal</p>
                  <h2>Today's study notebook</h2>
                </div>
                <button
                  type="button"
                  className="btn btn-primary study-history-add-button"
                  onClick={() => openAddModal()}
                >
                  Add Entry
                </button>
              </div>
              <div className="study-history-page-metrics">
                <section className="study-history-metric-section">
                  <p className="study-history-section-label">Streak</p>
                  <div className="study-history-streak-grid">
                    <div>
                      <span>Current</span>
                      <strong>
                        {streakStats.current}
                        <small>{streakStats.current === 1 ? " day" : " days"}</small>
                      </strong>
                    </div>
                    <div>
                      <span>Longest</span>
                      <strong>
                        {streakStats.longest}
                        <small>{streakStats.longest === 1 ? " day" : " days"}</small>
                      </strong>
                    </div>
                  </div>
                </section>

                <section className="study-history-metric-section">
                  <p className="study-history-section-label">Total Time</p>
                  <div className="study-history-total-time">
                    <strong>{totalMinutes}</strong>
                    <span>minutes studied</span>
                  </div>
                </section>
              </div>
            </section>

            {isLoading ? (
              <section className="study-history-empty">
                <p>Opening your study journal...</p>
              </section>
            ) : (
              <section className="study-history-calendar-card">
                <div className="study-history-calendar-toolbar">
                  <button
                    type="button"
                    className="study-calendar-nav-button"
                    onClick={() => handleShiftMonth(-1)}
                    aria-label="View previous month"
                  >
                    <span aria-hidden="true">&larr;</span>
                  </button>

                  <div className="study-history-calendar-heading">
                    <p className="study-history-kicker">Reading History</p>
                    <h3>{calendarMonthLabel}</h3>
                    <span>
                      {visibleMonthSessions.length} {visibleMonthSessions.length === 1 ? "entry" : "entries"}
                      {" / "}
                      {visibleMonthMinutes} min
                    </span>
                  </div>

                  <button
                    type="button"
                    className="study-calendar-nav-button"
                    onClick={() => handleShiftMonth(1)}
                    aria-label="View next month"
                  >
                    <span aria-hidden="true">&rarr;</span>
                  </button>
                </div>

                {!isViewingCurrentMonth ? (
                  <div className="study-history-calendar-actions">
                    <button type="button" onClick={handleJumpToToday}>
                      Current Month
                    </button>
                  </div>
                ) : null}

                <div className="study-history-calendar-weekdays" aria-hidden="true">
                  {WEEKDAY_LABELS.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>

                <div
                  key={`${visibleMonthKey}-${calendarDirection}`}
                  className={`study-history-calendar-grid direction-${calendarDirection}`}
                >
                  {calendarDays.map((day) => {
                    const daySessions = sessionsByDate.get(day.key) || [];
                    const dayMinutes = daySessions.reduce(
                      (sum, session) => sum + getTotalMinutes(session.duration),
                      0
                    );
                    const heatLevel = getHeatLevel(dayMinutes);
                    const entryLabel = `${daySessions.length} ${daySessions.length === 1 ? "entry" : "entries"}`;

                    return (
                      <button
                        key={day.key}
                        type="button"
                        className={[
                          "study-calendar-day",
                          `heat-${heatLevel}`,
                          day.isCurrentMonth ? "" : "is-outside-month",
                          day.isToday ? "is-today" : "",
                          daySessions.length ? "has-entries" : "",
                        ].filter(Boolean).join(" ")}
                        onClick={() => setSelectedDay(day.key)}
                        aria-label={`${formatDayHeading(day.key)}. ${entryLabel}. ${dayMinutes} minutes studied. View entries.`}
                      >
                        <span className="study-calendar-day-number">{day.date.getDate()}</span>
                      </button>
                    );
                  })}
                </div>

                {sessions.length === 0 ? (
                  <p className="study-history-calendar-empty">
                    No reflections yet. Start with a few quiet minutes from today's study.
                  </p>
                ) : null}
              </section>
            )}
          </div>
        )}

        {selectedDay && !focusedSession && !isAddModalOpen && typeof document !== "undefined" && createPortal(
          <div
            className="study-day-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedDay(null);
              }
            }}
          >
            <section className="study-day-modal" role="dialog" aria-modal="true" aria-labelledby="study-day-modal-title">
              <button
                type="button"
                className="study-history-close-icon"
                onClick={() => setSelectedDay(null)}
                aria-label="Close day entries"
              >
                X
              </button>
              <div className="study-day-modal-header">
                <p className="study-history-kicker">Daily Entries</p>
                <h3 id="study-day-modal-title">{formatDayHeading(selectedDay)}</h3>
                <p>
                  {selectedDaySessions.length} {selectedDaySessions.length === 1 ? "entry" : "entries"}
                  {" / "}
                  {selectedDaySessions.reduce((sum, session) => sum + getTotalMinutes(session.duration), 0)} min
                </p>
              </div>

              <div className="study-day-entry-list">
                {selectedDaySessions.length ? selectedDaySessions.map((session) => (
                  <button
                    type="button"
                    key={session.id}
                    className="study-day-entry-row"
                    onClick={() => openFocusedSession(session)}
                  >
                    <div>
                      <strong>{session.content || "Scripture study entry"}</strong>
                      <span>{session.notes || "Open to add notes and reflections."}</span>
                    </div>
                    <em>{formatDurationLabel(session.duration)}</em>
                  </button>
                )) : (
                  <p className="study-day-empty">
                    No study logged for this day yet. Add an entry when you are ready.
                  </p>
                )}
              </div>

              <button
                type="button"
                className="btn btn-primary study-day-add-button"
                onClick={() => openAddModal(selectedDay)}
              >
                {selectedDaySessions.length ? "Add Another Entry" : "Add Entry"}
              </button>
            </section>
          </div>,
          document.body
        )}

        {isAddModalOpen && draftSession && typeof document !== "undefined" && createPortal(
          <div className={`study-history-modal-backdrop ${isSessionModalClosing ? "is-closing" : "is-opening"}`} role="presentation">
            <div className="study-history-modal" role="dialog" aria-modal="true" aria-labelledby="study-session-modal-title">
              <button
                type="button"
                className="study-history-close-icon"
                onClick={closeSessionModal}
                aria-label="Close study session editor"
              >
                X
              </button>

              <div className="study-history-modal-header">
                <div>
                  <p className="study-history-kicker">Add Entry</p>
                  <h3 id="study-session-modal-title">Add a study entry</h3>
                </div>
                <button type="submit" form="study-session-add-form" className="btn btn-primary" disabled={isSavingSession}>
                  {isSavingSession ? "Saving..." : "Save"}
                </button>
              </div>

              <form id="study-session-add-form" className="study-history-modal-form" onSubmit={handleSaveSession}>
                {renderFields("New session")}
                <div className="study-history-modal-actions">
                  <button type="button" className="study-history-cancel-button" onClick={closeSessionModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSavingSession}>
                    {isSavingSession ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
      </div>
    </main>
  );
}
