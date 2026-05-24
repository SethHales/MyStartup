import React from 'react';
import { createPortal } from 'react-dom';
import "./history.css";
import { DatePicker } from "../components/datePicker";
import { StudyDurationPicker } from "../components/studyDurationPicker";
import {
  formatDurationLabel,
  formatStudyDate,
  getTodayLocal,
  groupSessionsByMonth,
  getTotalMinutes,
} from "../utils/studySessions";

const DEFAULT_DURATION = "00:15:00";

function sortSessionsNewestFirst(sessions) {
  return [...sessions].sort((first, second) => {
    const dateCompare = new Date(`${second.date}T00:00:00`) - new Date(`${first.date}T00:00:00`);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return String(second.id).localeCompare(String(first.id));
  });
}

export function History() {
  const [sessions, setSessions] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [editingSession, setEditingSession] = React.useState(null);
  const [draftSession, setDraftSession] = React.useState(null);
  const [isSavingSession, setIsSavingSession] = React.useState(false);
  const [openMenuSessionId, setOpenMenuSessionId] = React.useState(null);
  const [menuPosition, setMenuPosition] = React.useState(null);
  const menuRef = React.useRef(null);

  const loadSessions = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/study-sessions', {
        method: 'GET',
        credentials: 'include',
      });

      const body = await response.json().catch(() => []);
      if (response.ok) {
        setSessions(sortSessionsNewestFirst(body));
      }
    } catch (err) {
      console.error('Failed to load study sessions:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  React.useEffect(() => {
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target) && !event.target.closest?.(".study-history-menu-trigger")) {
        setOpenMenuSessionId(null);
        setMenuPosition(null);
      }
    };

    const handleViewportChange = () => {
      setOpenMenuSessionId(null);
      setMenuPosition(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, []);

  const groupedSessions = React.useMemo(
    () => groupSessionsByMonth(sessions),
    [sessions]
  );
  const totalMinutes = sessions.reduce((sum, session) => sum + getTotalMinutes(session.duration), 0);
  const thisWeekMinutes = sessions
    .filter((session) => {
      const sessionDate = new Date(`${session.date}T00:00:00`);
      const diffDays = (new Date() - sessionDate) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays < 7;
    })
    .reduce((sum, session) => sum + getTotalMinutes(session.duration), 0);

  const openAddModal = () => {
    setIsAddModalOpen(true);
    setEditingSession(null);
    setDraftSession({
      date: getTodayLocal(),
      duration: DEFAULT_DURATION,
      notes: "",
    });
    setOpenMenuSessionId(null);
    setMenuPosition(null);
  };

  const openEditModal = (session) => {
    setIsAddModalOpen(false);
    setEditingSession(session);
    setDraftSession({
      date: session.date,
      duration: session.duration,
      notes: session.notes || "",
    });
    setOpenMenuSessionId(null);
    setMenuPosition(null);
  };

  const closeSessionModal = () => {
    setIsAddModalOpen(false);
    setEditingSession(null);
    setDraftSession(null);
    setIsSavingSession(false);
  };

  const handleToggleMenu = (event, sessionId) => {
    event.stopPropagation();

    if (openMenuSessionId === sessionId) {
      setOpenMenuSessionId(null);
      setMenuPosition(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 170;
    const viewportWidth = window.innerWidth;
    const left = Math.min(
      Math.max(12, rect.right - menuWidth),
      Math.max(12, viewportWidth - menuWidth - 12)
    );

    setOpenMenuSessionId(sessionId);
    setMenuPosition({
      top: rect.bottom + 8,
      left,
    });
  };

  const handleDeleteSession = async (sessionId) => {
    setOpenMenuSessionId(null);
    setMenuPosition(null);

    try {
      const response = await fetch(`/api/study-sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        alert(body.msg || 'Failed to delete study session');
        return;
      }

      setSessions((currentSessions) => currentSessions.filter((session) => session.id !== sessionId));
    } catch (err) {
      console.error('Failed to delete study session:', err);
    }
  };

  const handleSaveSession = async (event) => {
    event.preventDefault();

    if (!draftSession?.date || getTotalMinutes(draftSession.duration) <= 0) {
      alert("Please choose a date and a study duration before saving.");
      return;
    }

    setIsSavingSession(true);

    try {
      const response = await fetch(
        editingSession ? `/api/study-sessions/${editingSession.id}` : '/api/study-sessions',
        {
          method: editingSession ? 'PUT' : 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(draftSession),
        }
      );

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(body.msg || 'Failed to save study session');
        return;
      }

      setSessions((currentSessions) => {
        const nextSessions = editingSession
          ? currentSessions.map((session) => session.id === body.id ? body : session)
          : [body, ...currentSessions];

        return sortSessionsNewestFirst(nextSessions);
      });
      closeSessionModal();
    } catch (err) {
      console.error('Failed to save study session:', err);
      alert('Unable to connect to the server');
    } finally {
      setIsSavingSession(false);
    }
  };

  const isSessionModalOpen = isAddModalOpen || Boolean(editingSession);
  const modalTitle = editingSession ? "Update your study log" : "Add a study log";
  const modalKicker = editingSession ? "Edit Session" : "Add Entry";
  const modalFormId = editingSession ? "study-session-edit-form" : "study-session-add-form";

  return (
    <main>
      <div className="main-formatting">
        <section className="study-history-hero">
          <div className="study-history-hero-copy">
            <div>
              <p className="study-history-kicker">History</p>
              <h2>{sessions.length} session{sessions.length === 1 ? "" : "s"} logged</h2>
            </div>
            <button
              type="button"
              className="btn btn-primary study-history-add-button"
              onClick={openAddModal}
            >
              Add Entry
            </button>
          </div>
          <div className="study-history-stats">
            <article className="study-history-stat-card">
              <span>This week</span>
              <strong>{thisWeekMinutes} min</strong>
            </article>
            <article className="study-history-stat-card">
              <span>Total logged</span>
              <strong>{totalMinutes} min</strong>
            </article>
            <article className="study-history-stat-card">
              <span>Latest date</span>
              <strong>{sessions[0] ? formatStudyDate(sessions[0].date) : formatStudyDate(getTodayLocal())}</strong>
            </article>
          </div>
        </section>

        {isLoading ? (
          <section className="study-history-empty">
            <p>Loading your study history...</p>
          </section>
        ) : sessions.length === 0 ? (
          <section className="study-history-empty">
            <p>No study sessions logged yet.</p>
          </section>
        ) : (
          groupedSessions.map((group) => (
            <section key={group.key} className="study-history-month">
              <div className="study-history-month-header">
                <h3>{group.label}</h3>
              </div>

              <div className="study-history-list">
                {group.sessions.map((session) => (
                  <article key={session.id} className="study-history-item">
                    <div className="study-history-item-copy">
                      <strong>{formatStudyDate(session.date)}</strong>
                      <span>{formatDurationLabel(session.duration)}</span>
                      {session.notes ? <p>{session.notes}</p> : null}
                    </div>
                    <button
                      type="button"
                      className="study-history-menu-trigger"
                      aria-label="Manage study session"
                      onClick={(event) => handleToggleMenu(event, session.id)}
                    >
                      ...
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}

        {openMenuSessionId && menuPosition && typeof document !== "undefined" && createPortal(
          <div
            ref={menuRef}
            className="study-history-menu"
            style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
          >
            <button
              type="button"
              onClick={() => {
                const session = sessions.find((item) => item.id === openMenuSessionId);
                if (session) {
                  openEditModal(session);
                }
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="delete"
              onClick={() => handleDeleteSession(openMenuSessionId)}
            >
              Delete
            </button>
          </div>,
          document.body
        )}

        {isSessionModalOpen && draftSession && (
          <div className="study-history-modal-backdrop" role="presentation">
            <div className="study-history-modal" role="dialog" aria-modal="true" aria-labelledby="study-session-modal-title">
              <button
                type="button"
                className="study-history-close-icon"
                onClick={closeSessionModal}
                aria-label="Close study session editor"
              >
                ×
              </button>

              <div className="study-history-modal-header">
                <div>
                  <p className="study-history-kicker">{modalKicker}</p>
                  <h3 id="study-session-modal-title">{modalTitle}</h3>
                </div>
                <button type="submit" form={modalFormId} className="btn btn-primary" disabled={isSavingSession}>
                  {isSavingSession ? "Saving..." : "Save"}
                </button>
              </div>

              <form id={modalFormId} className="study-history-modal-form" onSubmit={handleSaveSession}>
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
                    summaryLabel={editingSession ? "Edited session" : "New session"}
                  />
                </div>

                <label className="study-history-input-block">
                  <span>Notes</span>
                  <textarea
                    rows="4"
                    placeholder="Optional thoughts, chapters, or what stood out today."
                    value={draftSession.notes}
                    onChange={(event) => setDraftSession((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>

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
          </div>
        )}
      </div>
    </main>
  );
}
