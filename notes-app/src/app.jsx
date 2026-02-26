import React from "react";
import "./app.css";

const STORAGE_KEY = "notes_app_v3";

const starterClassId = "class-general";
const starterNoteId = "doc-welcome";

const STARTER_STATE = {
  classes: [{ id: starterClassId, name: "General" }],
  notes: [
    {
      id: starterNoteId,
      classId: starterClassId,
      title: "Welcome Document",
      content:
        "<p>This app now uses a document workflow. Click a class, browse documents in the grid, then open one to edit.</p>",
      updatedAt: new Date().toISOString(),
    },
  ],
  activeClassId: starterClassId,
  activeNoteId: null,
  theme: "light",
};

function makeId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeHtml(html) {
  if (typeof html !== "string") {
    return "<p></p>";
  }
  const trimmed = html.trim();
  return trimmed ? trimmed : "<p></p>";
}

function htmlToText(html) {
  if (typeof html !== "string") {
    return "";
  }
  if (typeof window === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

function normalizeState(rawState) {
  if (!rawState || typeof rawState !== "object") {
    return STARTER_STATE;
  }

  const classes = Array.isArray(rawState.classes)
    ? rawState.classes
        .filter((item) => item && typeof item.id === "string" && typeof item.name === "string")
        .map((item) => ({ id: item.id, name: item.name.trim() || "Untitled Class" }))
    : [];

  const safeClasses = classes.length > 0 ? classes : STARTER_STATE.classes;
  const classIds = new Set(safeClasses.map((item) => item.id));

  const notes = Array.isArray(rawState.notes)
    ? rawState.notes
        .filter((item) => item && typeof item.id === "string" && classIds.has(item.classId))
        .map((item) => ({
          id: item.id,
          classId: item.classId,
          title: typeof item.title === "string" && item.title.trim() ? item.title : "Untitled Document",
          content: normalizeHtml(item.content),
          updatedAt:
            typeof item.updatedAt === "string" && !Number.isNaN(Date.parse(item.updatedAt))
              ? item.updatedAt
              : new Date().toISOString(),
        }))
    : [];

  const activeClassId =
    typeof rawState.activeClassId === "string" && classIds.has(rawState.activeClassId)
      ? rawState.activeClassId
      : safeClasses[0].id;

  const noteIdsInClass = new Set(notes.filter((note) => note.classId === activeClassId).map((note) => note.id));
  const activeNoteId =
    typeof rawState.activeNoteId === "string" && noteIdsInClass.has(rawState.activeNoteId)
      ? rawState.activeNoteId
      : null;

  const theme = rawState.theme === "dark" ? "dark" : "light";

  return {
    classes: safeClasses,
    notes,
    activeClassId,
    activeNoteId,
    theme,
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return STARTER_STATE;
    }
    return normalizeState(JSON.parse(raw));
  } catch {
    return STARTER_STATE;
  }
}

function formatTimestamp(value) {
  const date = new Date(value);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function countWords(content) {
  return htmlToText(content)
    .split(/\s+/)
    .filter(Boolean).length;
}

function makePreview(content) {
  const text = htmlToText(content);
  if (!text) {
    return "No content yet.";
  }
  return text.slice(0, 160);
}

export default function App() {
  const initial = React.useMemo(() => loadState(), []);

  const [classes, setClasses] = React.useState(initial.classes);
  const [notes, setNotes] = React.useState(initial.notes);
  const [activeClassId, setActiveClassId] = React.useState(initial.activeClassId);
  const [activeNoteId, setActiveNoteId] = React.useState(initial.activeNoteId);
  const [theme, setTheme] = React.useState(initial.theme ?? "light");

  const [newClassName, setNewClassName] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");

  const [editorTitle, setEditorTitle] = React.useState("");
  const [editorHtml, setEditorHtml] = React.useState("<p></p>");
  const [saveStatus, setSaveStatus] = React.useState("saved");
  const [lastSavedAt, setLastSavedAt] = React.useState(null);

  const editorRef = React.useRef(null);

  const activeClass = React.useMemo(
    () => classes.find((item) => item.id === activeClassId) ?? classes[0],
    [classes, activeClassId]
  );

  const classNotes = React.useMemo(() => {
    if (!activeClass) {
      return [];
    }

    const query = searchQuery.trim().toLowerCase();

    return notes
      .filter((note) => note.classId === activeClass.id)
      .filter((note) => {
        if (!query) {
          return true;
        }
        const haystack = `${note.title} ${htmlToText(note.content)}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [activeClass, notes, searchQuery]);

  const activeNote = React.useMemo(
    () => notes.find((note) => note.id === activeNoteId && note.classId === activeClass?.id) ?? null,
    [notes, activeNoteId, activeClass]
  );

  const isEditorOpen = Boolean(activeNote);

  React.useEffect(() => {
    const payload = { classes, notes, activeClassId, activeNoteId, theme };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [classes, notes, activeClassId, activeNoteId, theme]);

  React.useEffect(() => {
    if (!activeClass || !activeNoteId) {
      return;
    }

    const stillExists = notes.some((note) => note.id === activeNoteId && note.classId === activeClass.id);
    if (!stillExists) {
      setActiveNoteId(null);
    }
  }, [notes, activeNoteId, activeClass]);

  React.useEffect(() => {
    if (!activeNote) {
      setEditorTitle("");
      setEditorHtml("<p></p>");
      setSaveStatus("saved");
      setLastSavedAt(null);
      return;
    }

    const nextHtml = normalizeHtml(activeNote.content);
    setEditorTitle(activeNote.title);
    setEditorHtml(nextHtml);
    setLastSavedAt(activeNote.updatedAt);
    setSaveStatus("saved");

    if (editorRef.current) {
      editorRef.current.innerHTML = nextHtml;
    }
  }, [activeNote]);

  React.useEffect(() => {
    if (!activeNote) {
      return;
    }

    if (editorTitle === activeNote.title && normalizeHtml(editorHtml) === normalizeHtml(activeNote.content)) {
      return;
    }

    setSaveStatus("saving");
    const timeoutId = window.setTimeout(() => {
      const now = new Date().toISOString();
      const normalized = normalizeHtml(editorHtml);

      setNotes((prev) =>
        prev.map((note) =>
          note.id === activeNote.id
            ? {
                ...note,
                title: editorTitle.trim() ? editorTitle : "Untitled Document",
                content: normalized,
                updatedAt: now,
              }
            : note
        )
      );

      setLastSavedAt(now);
      setSaveStatus("saved");
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [editorTitle, editorHtml, activeNote]);

  const handleCreateClass = (event) => {
    event.preventDefault();
    const trimmed = newClassName.trim();
    if (!trimmed) {
      return;
    }

    const duplicate = classes.some((item) => item.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      return;
    }

    const nextClass = { id: makeId("class"), name: trimmed };
    setClasses((prev) => [...prev, nextClass]);
    setActiveClassId(nextClass.id);
    setActiveNoteId(null);
    setSearchQuery("");
    setNewClassName("");
  };

  const handleRenameClass = (classId) => {
    const current = classes.find((item) => item.id === classId);
    if (!current) {
      return;
    }

    const nextName = window.prompt("Rename class", current.name);
    if (!nextName) {
      return;
    }

    const trimmed = nextName.trim();
    if (!trimmed) {
      return;
    }

    const duplicate = classes.some((item) => item.id !== classId && item.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      return;
    }

    setClasses((prev) => prev.map((item) => (item.id === classId ? { ...item, name: trimmed } : item)));
  };

  const handleDeleteClass = (classId) => {
    const current = classes.find((item) => item.id === classId);
    if (!current) {
      return;
    }

    if (classes.length === 1) {
      window.alert("At least one class is required.");
      return;
    }

    const confirmed = window.confirm(`Delete class \"${current.name}\" and all documents in it?`);
    if (!confirmed) {
      return;
    }

    const remainingClasses = classes.filter((item) => item.id !== classId);
    const fallbackClass = remainingClasses[0];

    setClasses(remainingClasses);
    setNotes((prev) => prev.filter((note) => note.classId !== classId));

    if (activeClassId === classId) {
      setActiveClassId(fallbackClass.id);
      setActiveNoteId(null);
      setSearchQuery("");
    }
  };

  const handleCreateDocument = React.useCallback(() => {
    if (!activeClass) {
      return;
    }

    const now = new Date().toISOString();
    const nextDoc = {
      id: makeId("doc"),
      classId: activeClass.id,
      title: "Untitled Document",
      content: "<p></p>",
      updatedAt: now,
    };

    setNotes((prev) => [nextDoc, ...prev]);
    setActiveNoteId(nextDoc.id);
  }, [activeClass]);

  React.useEffect(() => {
    const handler = (event) => {
      const isModifierPressed = event.metaKey || event.ctrlKey;
      if (!isModifierPressed || event.key.toLowerCase() !== "n") {
        return;
      }
      event.preventDefault();
      handleCreateDocument();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleCreateDocument]);

  const handleDeleteDocument = (noteId) => {
    const target = notes.find((note) => note.id === noteId);
    if (!target) {
      return;
    }

    const confirmed = window.confirm(`Delete document \"${target.title}\"?`);
    if (!confirmed) {
      return;
    }

    setNotes((prev) => prev.filter((note) => note.id !== noteId));
    if (activeNoteId === noteId) {
      setActiveNoteId(null);
    }
  };

  const runFormat = (command, value = null) => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.focus();
    document.execCommand(command, false, value);
    setEditorHtml(editorRef.current.innerHTML);
  };

  const saveLabel =
    saveStatus === "saving" ? "Saving..." : lastSavedAt ? `Saved ${formatTimestamp(lastSavedAt)}` : "Saved";

  return (
    <main className="docs-shell" data-theme={theme}>
      <div className="bg-glow glow-a" aria-hidden="true"></div>
      <div className="bg-glow glow-b" aria-hidden="true"></div>
      <section className="docs-app" aria-label="Class document notes app">
        <aside className="class-sidebar">
          <header>
            <div className="title-row">
              <div>
                <p className="eyebrow">Notes</p>
                <h1>Classes</h1>
              </div>
              <button
                type="button"
                className="theme-toggle"
                onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
                aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
                title={theme === "light" ? "Dark mode" : "Light mode"}
              >
                {theme === "light" ? "☀" : "☾"}
              </button>
            </div>
          </header>

          <form className="create-class-form" onSubmit={handleCreateClass}>
            <input
              type="text"
              value={newClassName}
              onChange={(event) => setNewClassName(event.target.value)}
              placeholder="Add class"
              maxLength={40}
            />
            <button type="submit">Add</button>
          </form>

          <div className="class-list" role="tablist" aria-label="Class list">
            {classes.map((item, index) => {
              const isActive = activeClass?.id === item.id;
              const count = notes.filter((note) => note.classId === item.id).length;

              return (
                <button
                  key={item.id}
                  type="button"
                  className={isActive ? "class-item active" : "class-item"}
                  style={{ animationDelay: `${Math.min(index, 12) * 32}ms` }}
                  onClick={() => {
                    setActiveClassId(item.id);
                    setActiveNoteId(null);
                    setSearchQuery("");
                  }}
                >
                  <div className="class-item-main">
                    <strong>{item.name}</strong>
                    <small>{count} docs</small>
                  </div>
                  <div className="class-item-actions">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRenameClass(item.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          handleRenameClass(item.id);
                        }
                      }}
                    >
                      Rename
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteClass(item.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          handleDeleteClass(item.id);
                        }
                      }}
                    >
                      Delete
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="workspace-pane">
          {!isEditorOpen ? (
            <>
              <header className="workspace-header">
                <div>
                  <h2>{activeClass?.name ?? "Class"}</h2>
                  <p className="eyebrow">Documents</p>
                </div>
                <button type="button" className="primary-btn" onClick={handleCreateDocument}>
                  New Document
                </button>
              </header>

              <input
                className="search-input"
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search documents in this class"
              />

              <div className="doc-grid" aria-live="polite">
                {classNotes.length === 0 ? (
                  <div className="empty-state">
                    <p>No documents found in this class.</p>
                    <button type="button" className="primary-btn" onClick={handleCreateDocument}>
                      Create first document
                    </button>
                  </div>
                ) : (
                  classNotes.map((note, index) => (
                    <article
                      key={note.id}
                      className="doc-card"
                      style={{ animationDelay: `${Math.min(index, 16) * 28}ms` }}
                      onClick={() => setActiveNoteId(note.id)}
                    >
                      <h3>{note.title || "Untitled Document"}</h3>
                      <p>{makePreview(note.content)}</p>
                      <div className="doc-meta">
                        <span>{countWords(note.content)} words</span>
                        <span>Edited {formatTimestamp(note.updatedAt)}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <header className="editor-topbar">
                <input
                  className="document-title"
                  type="text"
                  value={editorTitle}
                  onChange={(event) => setEditorTitle(event.target.value)}
                  placeholder="Document title"
                  maxLength={90}
                />

                <div className="toolbar" role="toolbar" aria-label="Formatting toolbar">
                  <button type="button" onClick={() => runFormat("formatBlock", "<p>")}>P</button>
                  <button type="button" onClick={() => runFormat("formatBlock", "<h1>")}>H1</button>
                  <button type="button" onClick={() => runFormat("formatBlock", "<h2>")}>H2</button>
                  <button type="button" onClick={() => runFormat("bold")}><strong>B</strong></button>
                  <button type="button" onClick={() => runFormat("italic")}><em>I</em></button>
                  <button type="button" onClick={() => runFormat("underline")}><u>U</u></button>
                  <button type="button" onClick={() => runFormat("insertUnorderedList")}>List</button>
                </div>

                <div className="editor-actions">
                  <span className={`save-pill ${saveStatus}`}>{saveLabel}</span>
                  <button type="button" className="secondary-btn" onClick={() => setActiveNoteId(null)}>
                    Back To Grid
                  </button>
                  <button type="button" className="danger-btn" onClick={() => handleDeleteDocument(activeNote.id)}>
                    Delete
                  </button>
                </div>
              </header>

              <div className="document-surface-full">
                <div
                  ref={editorRef}
                  className="document-editor"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(event) => setEditorHtml(event.currentTarget.innerHTML)}
                ></div>
              </div>

              <footer className="editor-footer">
                <span>{countWords(editorHtml)} words</span>
                <span>{saveLabel}</span>
                <span>Shortcut: Ctrl/Cmd + N</span>
              </footer>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
