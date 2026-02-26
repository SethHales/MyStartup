import React from "react";
import "./app.css";

const STORAGE_KEY = "notes_app_v3";

const starterClassId = "class-general";
const starterNoteId = "doc-welcome";
const COLOR_OPTIONS = ["blue", "red", "green", "purple", "yellow", "orange", "teal", "pink"];

const STARTER_STATE = {
  classes: [{ id: starterClassId, name: "General", color: "blue" }],
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

function pickRandomColor() {
  return COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)];
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
        .map((item) => ({
          id: item.id,
          name: item.name.trim() || "Untitled Class",
          color: COLOR_OPTIONS.includes(item.color) ? item.color : "blue",
        }))
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

function getClosestCodeBlock(node) {
  if (!(node instanceof Node)) {
    return null;
  }

  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!element) {
    return null;
  }

  return element.closest(".doc-code-block");
}

function getCaretOffsetWithinElement(element) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return 0;
  }

  const range = selection.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}

function setCaretOffsetWithinElement(element, targetOffset) {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  let currentOffset = 0;
  let node = walker.nextNode();

  while (node) {
    const nextOffset = currentOffset + node.textContent.length;
    if (targetOffset <= nextOffset) {
      const offsetInNode = Math.max(0, targetOffset - currentOffset);
      range.setStart(node, offsetInNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    currentOffset = nextOffset;
    node = walker.nextNode();
  }

  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function disableChecksOnCodeBlocks(rootElement) {
  if (!rootElement) {
    return;
  }

  const blocks = rootElement.querySelectorAll(".doc-code-block, .doc-code-block code, .doc-code-block__code");
  blocks.forEach((node) => {
    node.setAttribute("spellcheck", "false");
    node.setAttribute("autocorrect", "off");
    node.setAttribute("autocapitalize", "off");
    node.setAttribute("data-gramm", "false");
    node.setAttribute("data-gramm_editor", "false");
    node.setAttribute("data-enable-grammarly", "false");
  });
}

function pairCloseCharacter(key) {
  if (key === "(") return ")";
  if (key === "[") return "]";
  if (key === "{") return "}";
  if (key === "\"") return "\"";
  if (key === "'") return "'";
  if (key === "`") return "`";
  return "";
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
  const [classMenu, setClassMenu] = React.useState({ isOpen: false, classId: null, x: 0, y: 0 });

  const [editorTitle, setEditorTitle] = React.useState("");
  const [editorHtml, setEditorHtml] = React.useState("<p></p>");
  const [saveStatus, setSaveStatus] = React.useState("saved");
  const [lastSavedAt, setLastSavedAt] = React.useState(null);
  const [textColor, setTextColor] = React.useState("#18243b");
  const [highlightColor, setHighlightColor] = React.useState("#fff59d");

  const editorRef = React.useRef(null);
  const hydratedNoteIdRef = React.useRef(null);
  const classMenuRef = React.useRef(null);

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
      hydratedNoteIdRef.current = null;
      setEditorTitle("");
      setEditorHtml("<p></p>");
      setSaveStatus("saved");
      setLastSavedAt(null);
      return;
    }

    // Only hydrate editor DOM when switching documents, not on every autosave.
    if (hydratedNoteIdRef.current === activeNote.id) {
      return;
    }

    hydratedNoteIdRef.current = activeNote.id;
    const nextHtml = normalizeHtml(activeNote.content);
    setEditorTitle(activeNote.title);
    setEditorHtml(nextHtml);
    setLastSavedAt(activeNote.updatedAt);
    setSaveStatus("saved");

    if (editorRef.current) {
      editorRef.current.innerHTML = nextHtml;
      disableChecksOnCodeBlocks(editorRef.current);
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

  React.useEffect(() => {
    if (!classMenu.isOpen) {
      return undefined;
    }

    const closeMenu = () => setClassMenu((prev) => ({ ...prev, isOpen: false }));
    const onEscape = (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", onEscape);
    };
  }, [classMenu.isOpen]);

  React.useLayoutEffect(() => {
    if (!classMenu.isOpen || !classMenuRef.current) {
      return;
    }

    const menu = classMenuRef.current.getBoundingClientRect();
    const maxX = window.innerWidth - menu.width - 8;
    const maxY = window.innerHeight - menu.height - 8;
    const safeX = Math.max(8, Math.min(classMenu.x, maxX));
    const safeY = Math.max(8, Math.min(classMenu.y, maxY));

    if (safeX !== classMenu.x || safeY !== classMenu.y) {
      setClassMenu((prev) => ({ ...prev, x: safeX, y: safeY }));
    }
  }, [classMenu]);

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

    const nextClass = { id: makeId("class"), name: trimmed, color: pickRandomColor() };
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
    setClassMenu((prev) => ({ ...prev, isOpen: false }));
  };

  const handleDeleteClass = (classId) => {
    const current = classes.find((item) => item.id === classId);
    if (!current) {
      return;
    }

    if (classes.length === 1) {
      window.alert("At least one class is required.");
      setClassMenu((prev) => ({ ...prev, isOpen: false }));
      return;
    }

    const confirmed = window.confirm(`Delete class \"${current.name}\" and all documents in it?`);
    if (!confirmed) {
      setClassMenu((prev) => ({ ...prev, isOpen: false }));
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
    setClassMenu((prev) => ({ ...prev, isOpen: false }));
  };

  const handleChangeClassColor = (classId, color) => {
    setClasses((prev) => prev.map((item) => (item.id === classId ? { ...item, color } : item)));
    setClassMenu((prev) => ({ ...prev, isOpen: false }));
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

  const runBlockFormat = (tag) => {
    runFormat("formatBlock", `<${tag}>`);
  };

  const handleTextTypeChange = (event) => {
    const value = event.target.value;
    if (!value) {
      return;
    }

    if (value === "p" || value === "h1" || value === "h2" || value === "h3") {
      runBlockFormat(value);
    } else if (value === "blockquote") {
      runBlockFormat("blockquote");
    }

    event.target.value = "";
  };

  const handleListTypeChange = (event) => {
    const value = event.target.value;
    if (!value) {
      return;
    }

    if (value === "ul") {
      runFormat("insertUnorderedList");
    } else if (value === "ol") {
      runFormat("insertOrderedList");
    }

    event.target.value = "";
  };

  const handleInsertAction = (event) => {
    const value = event.target.value;
    if (!value) {
      return;
    }

    if (value === "link") {
      handleInsertLink();
    } else if (value === "image") {
      handleInsertImage();
    } else if (value === "codeblock") {
      handleInsertCodeBlock();
    } else if (value === "hr") {
      runFormat("insertHorizontalRule");
    } else if (value === "unlink") {
      runFormat("unlink");
    } else if (value === "clear") {
      runFormat("removeFormat");
    }

    event.target.value = "";
  };

  const handleInsertLink = () => {
    if (!editorRef.current) {
      return;
    }

    const rawUrl = window.prompt("Enter URL");
    if (!rawUrl) {
      return;
    }

    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return;
    }

    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : "";

    editorRef.current.focus();

    if (selectedText) {
      document.execCommand("createLink", false, normalized);
    } else {
      document.execCommand("insertHTML", false, `<a href="${normalized}" target="_blank" rel="noopener noreferrer">${normalized}</a>`);
    }

    setEditorHtml(editorRef.current.innerHTML);
  };

  const handleInsertImage = () => {
    if (!editorRef.current) {
      return;
    }

    const rawUrl = window.prompt("Image URL");
    if (!rawUrl) {
      return;
    }

    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return;
    }

    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    editorRef.current.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<img src="${normalized}" alt="Inserted" style="max-width:100%;height:auto;border-radius:10px;" />`
    );
    setEditorHtml(editorRef.current.innerHTML);
  };

  const handleInsertCodeBlock = () => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<div class="doc-code-block" data-lang="code" data-mode="edit" spellcheck="false" autocorrect="off" autocapitalize="off" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"><div class="doc-code-block__toolbar" contenteditable="false"><span class="doc-code-block__lang">code</span><div class="doc-code-block__actions"><button type="button" class="doc-code-block__btn is-lock" data-code-action="lock" title="Lock code block">✓</button><button type="button" class="doc-code-block__btn is-copy" data-code-action="copy" title="Copy code">Copy</button></div></div><code class="doc-code-block__code" contenteditable="true" spellcheck="false" autocorrect="off" autocapitalize="off" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false">// Start coding here</code></div><p><br></p>`
    );

    disableChecksOnCodeBlocks(editorRef.current);

    const codeBlocks = editorRef.current.querySelectorAll(".doc-code-block__code");
    const latest = codeBlocks[codeBlocks.length - 1];
    if (latest?.firstChild) {
      const range = document.createRange();
      range.setStart(latest.firstChild, latest.firstChild.textContent.length);
      range.collapse(true);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    setEditorHtml(editorRef.current.innerHTML);
  };

  const handleEditorClick = async (event) => {
    if (!editorRef.current) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionButton = target.closest("[data-code-action]");
    if (!actionButton) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const codeBlock = actionButton.closest(".doc-code-block");
    const codeElement = codeBlock?.querySelector(".doc-code-block__code");
    if (!codeBlock || !codeElement) {
      return;
    }

    const action = actionButton.getAttribute("data-code-action");

    if (action === "lock") {
      codeBlock.setAttribute("data-mode", "view");
      codeElement.setAttribute("contenteditable", "false");
    } else if (action === "edit") {
      codeBlock.setAttribute("data-mode", "edit");
      codeElement.setAttribute("contenteditable", "true");
      codeElement.focus();
      setCaretOffsetWithinElement(codeElement, (codeElement.textContent ?? "").length);
    } else if (action === "copy") {
      const codeText = codeElement.textContent ?? "";
      try {
        await navigator.clipboard.writeText(codeText);
      } catch {
        const textarea = document.createElement("textarea");
        textarea.value = codeText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
    }

    setEditorHtml(editorRef.current.innerHTML);
  };

  const handleEditorKeyDown = (event) => {
    if (!editorRef.current) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const codeBlock = getClosestCodeBlock(selection.anchorNode);
    if (!codeBlock) {
      return;
    }

    const codeElement = codeBlock.querySelector(".doc-code-block__code") ?? codeBlock.querySelector("code");
    if (!codeElement || codeElement.getAttribute("contenteditable") !== "true") {
      return;
    }
    const content = codeElement.textContent ?? "";
    const caretOffset = getCaretOffsetWithinElement(codeElement);
    const beforeCaret = content.slice(0, caretOffset);
    const afterCaret = content.slice(caretOffset);
    const hasSelection = !selection.isCollapsed;

    if (
      !hasSelection &&
      (event.key === ")" || event.key === "]" || event.key === "}" || event.key === "\"" || event.key === "'" || event.key === "`") &&
      afterCaret.startsWith(event.key)
    ) {
      event.preventDefault();
      setCaretOffsetWithinElement(codeElement, caretOffset + 1);
      return;
    }

    const closePair = pairCloseCharacter(event.key);
    if (closePair && !event.ctrlKey && !event.metaKey && !event.altKey && !hasSelection) {
      event.preventDefault();
      const nextContent = `${beforeCaret}${event.key}${closePair}${afterCaret}`;
      codeElement.textContent = nextContent;
      setCaretOffsetWithinElement(codeElement, caretOffset + 1);
      setEditorHtml(editorRef.current.innerHTML);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const lineStart = beforeCaret.lastIndexOf("\n") + 1;
      const currentLine = beforeCaret.slice(lineStart);

      if (event.shiftKey) {
        if (currentLine.startsWith("\t")) {
          const nextContent = `${beforeCaret.slice(0, lineStart)}${currentLine.slice(1)}${afterCaret}`;
          codeElement.textContent = nextContent;
          setCaretOffsetWithinElement(codeElement, Math.max(lineStart, caretOffset - 1));
        } else if (currentLine.startsWith("    ")) {
          const nextContent = `${beforeCaret.slice(0, lineStart)}${currentLine.slice(4)}${afterCaret}`;
          codeElement.textContent = nextContent;
          setCaretOffsetWithinElement(codeElement, Math.max(lineStart, caretOffset - 4));
        }
      } else {
        const nextContent = `${beforeCaret}\t${afterCaret}`;
        codeElement.textContent = nextContent;
        setCaretOffsetWithinElement(codeElement, caretOffset + 1);
      }

      setEditorHtml(editorRef.current.innerHTML);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const currentLine = beforeCaret.slice(beforeCaret.lastIndexOf("\n") + 1);
      const indent = (currentLine.match(/^\s+/) || [""])[0];
      const charBefore = beforeCaret.slice(-1);
      const charAfter = afterCaret.slice(0, 1);

      let insertion = "";
      if (charBefore === "{" && charAfter === "}") {
        insertion = `\n${indent}\t\n${indent}`;
      } else {
        const shouldIndent = currentLine.trimEnd().endsWith("{");
        insertion = `\n${indent}${shouldIndent ? "\t" : ""}`;
      }

      const nextContent = `${beforeCaret}${insertion}${afterCaret}`;
      codeElement.textContent = nextContent;
      if (charBefore === "{" && charAfter === "}") {
        setCaretOffsetWithinElement(codeElement, caretOffset + indent.length + 2);
      } else {
        setCaretOffsetWithinElement(codeElement, caretOffset + insertion.length);
      }
      setEditorHtml(editorRef.current.innerHTML);
    }
  };

  const saveLabel =
    saveStatus === "saving" ? "Saving..." : lastSavedAt ? `Saved ${formatTimestamp(lastSavedAt)}` : "Saved";

  return (
    <main className="docs-shell" data-theme={theme} data-class-color={activeClass?.color ?? "blue"}>
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
                  className={isActive ? `class-item active ${item.color ?? "blue"}` : `class-item ${item.color ?? "blue"}`}
                  style={{ animationDelay: `${Math.min(index, 12) * 32}ms` }}
                  onClick={() => {
                    setActiveClassId(item.id);
                    setActiveNoteId(null);
                    setSearchQuery("");
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setClassMenu({ isOpen: true, classId: item.id, x: event.clientX, y: event.clientY });
                  }}
                  title="Right click for options"
                >
                  <div className="class-item-main">
                    <strong>
                      <span className={`class-color-dot ${item.color ?? "blue"}`} aria-hidden="true"></span>
                      {item.name}
                    </strong>
                    <small>{count} docs</small>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="class-hint">Right click a class to rename, delete, or change color.</p>
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
                <div className="editor-meta-row">
                  <input
                    className="document-title"
                    type="text"
                    value={editorTitle}
                    onChange={(event) => setEditorTitle(event.target.value)}
                    placeholder="Document title"
                    maxLength={90}
                  />

                  <div className="editor-actions">
                    <span className={`save-pill ${saveStatus}`}>{saveLabel}</span>
                    <button type="button" className="secondary-btn" onClick={() => setActiveNoteId(null)}>
                      Back To Grid
                    </button>
                    <button type="button" className="danger-btn" onClick={() => handleDeleteDocument(activeNote.id)}>
                      Delete
                    </button>
                  </div>
                </div>

                <div className="toolbar" role="toolbar" aria-label="Formatting toolbar">
                  <div className="toolbar-group toolbar-group-selects">
                    <select className="toolbar-select" defaultValue="" onChange={handleTextTypeChange} title="Text Type">
                      <option value="" disabled>
                        Text Type
                      </option>
                      <option value="p">Paragraph</option>
                      <option value="h1">Heading 1</option>
                      <option value="h2">Heading 2</option>
                      <option value="h3">Heading 3</option>
                      <option value="blockquote">Quote</option>
                    </select>
                    <select className="toolbar-select" defaultValue="" onChange={handleListTypeChange} title="Lists">
                      <option value="" disabled>
                        Lists
                      </option>
                      <option value="ul">Bulleted List</option>
                      <option value="ol">Numbered List</option>
                    </select>
                    <select className="toolbar-select" defaultValue="" onChange={handleInsertAction} title="Insert">
                      <option value="" disabled>
                        Insert
                      </option>
                      <option value="link">Link</option>
                      <option value="image">Image</option>
                      <option value="codeblock">Code Block</option>
                      <option value="hr">Horizontal Rule</option>
                      <option value="unlink">Remove Link</option>
                      <option value="clear">Clear Formatting</option>
                    </select>
                  </div>

                  <div className="toolbar-group">
                    <button type="button" className="toolbar-icon-btn" onClick={() => runFormat("undo")} title="Undo">
                      ↺
                    </button>
                    <button type="button" className="toolbar-icon-btn" onClick={() => runFormat("redo")} title="Redo">
                      ↻
                    </button>
                  </div>

                  <div className="toolbar-group">
                    <button type="button" className="toolbar-icon-btn" onClick={() => runFormat("bold")} title="Bold">
                      <strong>B</strong>
                    </button>
                    <button type="button" className="toolbar-icon-btn" onClick={() => runFormat("italic")} title="Italic">
                      <em>I</em>
                    </button>
                    <button type="button" className="toolbar-icon-btn" onClick={() => runFormat("underline")} title="Underline">
                      <u>U</u>
                    </button>
                    <button type="button" className="toolbar-icon-btn" onClick={() => runFormat("strikeThrough")} title="Strikethrough">
                      <s>S</s>
                    </button>
                  </div>

                  <div className="toolbar-group">
                    <button type="button" className="toolbar-icon-btn" onClick={() => runFormat("justifyLeft")} title="Align Left">
                      ⟸
                    </button>
                    <button type="button" className="toolbar-icon-btn" onClick={() => runFormat("justifyCenter")} title="Align Center">
                      ≡
                    </button>
                    <button type="button" className="toolbar-icon-btn" onClick={() => runFormat("justifyRight")} title="Align Right">
                      ⟹
                    </button>
                  </div>

                  <div className="toolbar-group">
                    <label className="color-control" title="Text Color">
                      Text
                      <input
                        type="color"
                        value={textColor}
                        onChange={(event) => {
                          const next = event.target.value;
                          setTextColor(next);
                          runFormat("foreColor", next);
                        }}
                      />
                    </label>
                    <label className="color-control" title="Highlight Color">
                      Highlight
                      <input
                        type="color"
                        value={highlightColor}
                        onChange={(event) => {
                          const next = event.target.value;
                          setHighlightColor(next);
                          runFormat("hiliteColor", next);
                        }}
                      />
                    </label>
                  </div>
                </div>
              </header>

              <div className="document-surface-full">
                <div
                  ref={editorRef}
                  className="document-editor"
                  contentEditable
                  suppressContentEditableWarning
                  onClick={handleEditorClick}
                  onKeyDown={handleEditorKeyDown}
                  onInput={(event) => {
                    disableChecksOnCodeBlocks(event.currentTarget);
                    setEditorHtml(event.currentTarget.innerHTML);
                  }}
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
      {classMenu.isOpen ? (
        <div
          ref={classMenuRef}
          className="class-menu"
          style={{ top: classMenu.y, left: classMenu.x }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => handleRenameClass(classMenu.classId)}>
            Rename
          </button>
          <button type="button" className="danger" onClick={() => handleDeleteClass(classMenu.classId)}>
            Delete
          </button>
          <div className="menu-divider"></div>
          <p>Change Color</p>
          <div className="menu-color-grid">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color}
                type="button"
                className={`menu-color-chip ${color}`}
                onClick={() => handleChangeClassColor(classMenu.classId, color)}
                title={color[0].toUpperCase() + color.slice(1)}
              >
                <span className="visually-hidden">{color}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}
