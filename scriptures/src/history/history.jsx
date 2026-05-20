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

export function History() {
  const [sessions, setSessions] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [editingSession, setEditingSession] = React.useState(null);
  const [draftSession, setDraftSession] = React.useState(null);
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
        setSessions(body);
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

  const openEditModal = (session) => {
    setEditingSession(session);
    setDraftSession({
      date: session.date,
      duration: session.duration,
      notes: session.notes || "",
    });
    setOpenMenuSessionId(null);
    setMenuPosition(null);
  };

  const closeEditModal = () => {
    setEditingSession(null);
    setDraftSession(null);
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

    try {
      const response = await fetch(`/api/study-sessions/${editingSession.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(draftSession),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(body.msg || 'Failed to save study session');
        return;
      }

      setSessions((currentSessions) =>
        currentSessions.map((session) => session.id === body.id ? body : session)
      );
      closeEditModal();
    } catch (err) {
      console.error('Failed to update study session:', err);
    }
  };

  return (
    <main>
      <div className="main-formatting">
        <section className="study-history-hero">
          <div>
            <p className="study-history-kicker">History</p>
            <h2>{sessions.length} session{sessions.length === 1 ? "" : "s"} logged</h2>
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

        {editingSession && draftSession && (
          <div className="study-history-modal-backdrop" role="presentation">
            <div className="study-history-modal" role="dialog" aria-modal="true" aria-labelledby="edit-study-session-title">
              <button
                type="button"
                className="study-history-close-icon"
                onClick={closeEditModal}
                aria-label="Close study session editor"
              >
                ×
              </button>

              <div className="study-history-modal-header">
                <div>
                  <p className="study-history-kicker">Edit Session</p>
                  <h3 id="edit-study-session-title">Update your study log</h3>
                </div>
                <button type="submit" form="study-session-edit-form" className="btn btn-primary">
                  Save
                </button>
              </div>

              <form id="study-session-edit-form" className="study-history-modal-form" onSubmit={handleSaveSession}>
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
                    summaryLabel="Edited session"
                  />
                </div>

                <label className="study-history-input-block">
                  <span>Notes</span>
                  <textarea
                    rows="4"
                    value={draftSession.notes}
                    onChange={(event) => setDraftSession((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>

                <div className="study-history-modal-actions">
                  <button type="button" className="study-history-cancel-button" onClick={closeEditModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Save
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
