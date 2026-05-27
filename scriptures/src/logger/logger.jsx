import React from 'react';
import "./logger.css";
import { DatePicker } from "../components/datePicker";
import { StudyDurationPicker } from "../components/studyDurationPicker";
import {
  formatDurationLabel,
  formatDurationFromParts,
  formatStudyDayLabel,
  getTodayLocal,
  getTotalMinutes,
  parseDurationToParts,
} from "../utils/studySessions";

const LOGGER_DRAFT_KEY = "scriptures.studyDraft";
const DEFAULT_DURATION = "00:15:00";

function readDraft() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawDraft = window.localStorage.getItem(LOGGER_DRAFT_KEY);
    if (!rawDraft) {
      return null;
    }

    return JSON.parse(rawDraft);
  } catch (_err) {
    return null;
  }
}

export function Logger({ currentUser = null }) {
  const storedDraft = React.useMemo(() => readDraft(), []);
  const [date, setDate] = React.useState(storedDraft?.date || getTodayLocal());
  const [duration, setDuration] = React.useState(storedDraft?.duration || DEFAULT_DURATION);
  const [content, setContent] = React.useState(storedDraft?.content || "");
  const [notes, setNotes] = React.useState(storedDraft?.notes || "");
  const [sessions, setSessions] = React.useState([]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;

    fetch('/api/study-sessions', {
      method: 'GET',
      credentials: 'include',
    })
      .then((response) => response.ok ? response.json() : [])
      .then((savedSessions) => {
        if (isMounted) {
          setSessions(savedSessions);
        }
      })
      .catch((err) => {
        console.error('Failed to load study sessions:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    const totalMinutes = getTotalMinutes(duration);
    if (!date && totalMinutes === 0 && !content.trim() && !notes.trim()) {
      window.localStorage.removeItem(LOGGER_DRAFT_KEY);
      return;
    }

    window.localStorage.setItem(
      LOGGER_DRAFT_KEY,
      JSON.stringify({ date, duration, content, notes })
    );
  }, [date, duration, content, notes]);

  const totalMinutes = getTotalMinutes(duration);
  const todaysSessions = React.useMemo(
    () => sessions.filter((session) => session.date === date),
    [date, sessions]
  );
  const todaysMinutes = todaysSessions.reduce(
    (sum, session) => sum + getTotalMinutes(session.duration),
    0
  );
  const lastSession = sessions[0] || null;
  const canSave = Boolean(date) && totalMinutes > 0;
  const { hours, minutes } = parseDurationToParts(duration);

  const resetForm = React.useCallback(() => {
    setDate(getTodayLocal());
    setDuration(DEFAULT_DURATION);
    setContent("");
    setNotes("");
    window.localStorage.removeItem(LOGGER_DRAFT_KEY);
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch('/api/study-sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date,
          duration,
          content,
          notes,
        }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(body.msg || 'Failed to save study session');
        return;
      }

      setSessions((currentSessions) => [body, ...currentSessions]);
      resetForm();
    } catch (err) {
      console.error('Failed to save study session:', err);
      alert('Unable to connect to the server');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main>
      <div className="main-formatting">
        <section className="study-hero-card">
          <div>
            <p className="study-kicker">Daily Study</p>
            <h2>{currentUser?.name ? `${currentUser.name}'s study journal` : "Scripture study journal"}</h2>
            <p className="study-subcopy">Make a quiet note of the time you spent and anything that felt worth remembering.</p>
          </div>
          <div className="study-hero-stats">
            <article className="study-stat-card">
              <span>Selected day</span>
              <strong>{formatStudyDayLabel(date)}</strong>
            </article>
            <article className="study-stat-card">
              <span>Logged today</span>
              <strong>{todaysMinutes} min</strong>
            </article>
            <article className="study-stat-card">
              <span>Last entry</span>
              <strong>{lastSession ? formatDurationLabel(lastSession.duration) : "None yet"}</strong>
            </article>
          </div>
        </section>

        <form className="study-form-card" onSubmit={handleSubmit}>
          <div className="study-form-header">
            <div>
              <p className="study-kicker">Notebook</p>
              <h3>Record today’s study</h3>
            </div>
            <button
              type="button"
              className="study-reset-button"
              onClick={resetForm}
              disabled={isSaving}
            >
              Reset
            </button>
          </div>

          <div className="study-form-grid">
            <label className="study-input-block">
              <span>Date</span>
              <DatePicker
                value={date}
                onChange={setDate}
                ariaLabel="Study date"
              />
            </label>

            <div className="study-input-block">
              <span>Duration</span>
              <StudyDurationPicker
                duration={duration}
                onChange={setDuration}
                summaryLabel="This entry"
              />
            </div>
          </div>

          <label className="study-input-block">
            <span>Content Studied</span>
            <input
              type="text"
              placeholder="For example: 1 Nephi 3, Alma 32, Come Follow Me, or conference talk."
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>

          <label className="study-input-block">
            <span>Study Notes</span>
            <textarea
              rows="4"
              placeholder="What stood out? Add a verse, thought, question, or prompting."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <div className="study-form-footer">
            <p className="study-save-summary">
              Saving <strong>{formatDurationFromParts(hours, minutes)}</strong> of study time.
            </p>
            <button
              type="submit"
              className="btn btn-primary study-save-button"
              disabled={!canSave || isSaving}
            >
              {isSaving ? "Saving..." : "Save Entry"}
            </button>
          </div>
        </form>

        <section className="study-mini-history-card">
          <div className="study-mini-history-header">
            <div>
              <p className="study-kicker">Recent Reflections</p>
              <h3>Last few entries</h3>
            </div>
          </div>

          {isLoading ? (
            <p className="study-empty-copy">Opening your recent reflections...</p>
          ) : sessions.length === 0 ? (
            <p className="study-empty-copy">No reflections yet. Start with a verse that stood out to you today.</p>
          ) : (
            <div className="study-mini-history-list">
              {sessions.slice(0, 5).map((session) => (
                <article key={session.id} className="study-mini-history-item">
                  <div>
                    <strong>{formatStudyDayLabel(session.date)}</strong>
                    {session.content ? <em>{session.content}</em> : null}
                    {session.notes ? <p>{session.notes}</p> : null}
                  </div>
                  <span>{formatDurationLabel(session.duration)}</span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
