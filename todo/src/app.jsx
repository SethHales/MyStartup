import React from "react";
import "./app.css";

const STORAGE_KEY = "todo_app_v3";

const FILTERS = {
  ALL: "all",
  ACTIVE: "active",
  COMPLETED: "completed",
};

const MODES = ["light", "dark"];
const ACCENTS = ["neutral", "red", "green", "blue"];
const SORT_MODES = ["manual", "newest", "oldest", "priority"];
const PRIORITY_OPTIONS = ["high", "medium", "low"];

const INITIAL_GROUP = { id: "inbox", name: "Inbox", archived: false };

function loadPersistedState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const groups = Array.isArray(parsed.groups)
      ? parsed.groups
          .filter((group) => group && typeof group.id === "string" && typeof group.name === "string")
          .map((group) => ({
            id: group.id,
            name: group.name,
            archived: Boolean(group.archived),
          }))
      : [];

    const safeGroups = groups.length > 0 ? groups : [INITIAL_GROUP];

    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks
          .filter((task) => task && typeof task.id === "string" && typeof task.text === "string")
          .map((task) => ({
            id: task.id,
            text: task.text,
            completed: Boolean(task.completed),
            createdAt: typeof task.createdAt === "string" ? task.createdAt : new Date().toISOString(),
            groupId:
              typeof task.groupId === "string" && safeGroups.some((group) => group.id === task.groupId)
                ? task.groupId
                : safeGroups[0].id,
            priority: PRIORITY_OPTIONS.includes(task.priority) ? task.priority : "medium",
          }))
      : [];

    const activeGroupId =
      typeof parsed.activeGroupId === "string" && safeGroups.some((group) => group.id === parsed.activeGroupId)
        ? parsed.activeGroupId
        : safeGroups[0].id;

    let mode = "light";
    let accent = "neutral";
    if (MODES.includes(parsed.mode)) {
      mode = parsed.mode;
    }
    if (ACCENTS.includes(parsed.accent)) {
      accent = parsed.accent;
    }

    // Backward compatibility for older `theme` field.
    if ((!parsed.mode || !parsed.accent) && typeof parsed.theme === "string") {
      if (parsed.theme === "dark") {
        mode = "dark";
        accent = "neutral";
      } else if (parsed.theme === "red" || parsed.theme === "green" || parsed.theme === "blue") {
        mode = "light";
        accent = parsed.theme;
      } else {
        mode = "light";
        accent = "neutral";
      }
    }

    return {
      groups: safeGroups,
      tasks,
      activeGroupId,
      mode,
      accent,
      filter: Object.values(FILTERS).includes(parsed.filter) ? parsed.filter : FILTERS.ACTIVE,
      sortMode: SORT_MODES.includes(parsed.sortMode) ? parsed.sortMode : "manual",
      showArchived: Boolean(parsed.showArchived),
    };
  } catch {
    return null;
  }
}

function makeUniqueGroupName(baseName, groups) {
  const existing = new Set(groups.map((group) => group.name.toLowerCase()));
  if (!existing.has(baseName.toLowerCase())) {
    return baseName;
  }

  let index = 2;
  while (existing.has(`${baseName} ${index}`.toLowerCase())) {
    index += 1;
  }

  return `${baseName} ${index}`;
}

export default function App() {
  const persisted = React.useMemo(() => loadPersistedState(), []);

  const [groups, setGroups] = React.useState(persisted?.groups ?? [INITIAL_GROUP]);
  const [activeGroupId, setActiveGroupId] = React.useState(persisted?.activeGroupId ?? INITIAL_GROUP.id);
  const [newGroupName, setNewGroupName] = React.useState("");

  const [tasks, setTasks] = React.useState(persisted?.tasks ?? []);
  const [newTaskText, setNewTaskText] = React.useState("");
  const [newTaskPriority, setNewTaskPriority] = React.useState("medium");
  const [isTaskModalOpen, setIsTaskModalOpen] = React.useState(false);

  const [filter, setFilter] = React.useState(persisted?.filter ?? FILTERS.ACTIVE);
  const [sortMode, setSortMode] = React.useState(persisted?.sortMode ?? "manual");
  const [mode, setMode] = React.useState(persisted?.mode ?? "light");
  const [accent, setAccent] = React.useState(persisted?.accent ?? "neutral");
  const [showArchived, setShowArchived] = React.useState(persisted?.showArchived ?? false);

  const [groupMenu, setGroupMenu] = React.useState({ isOpen: false, x: 0, y: 0, groupId: null });
  const [menuPosition, setMenuPosition] = React.useState({ x: 0, y: 0 });
  const groupMenuRef = React.useRef(null);

  const [renameModal, setRenameModal] = React.useState({ isOpen: false, groupId: null, value: "" });
  const [toast, setToast] = React.useState(null);
  const toastTimerRef = React.useRef(null);

  const [dragTaskId, setDragTaskId] = React.useState(null);
  const [dragOverTaskId, setDragOverTaskId] = React.useState(null);
  const [dragGroupId, setDragGroupId] = React.useState(null);
  const [dragOverGroupId, setDragOverGroupId] = React.useState(null);
  const [exitingTaskIds, setExitingTaskIds] = React.useState({});
  const exitingTimersRef = React.useRef(new Map());

  const visibleGroups = React.useMemo(
    () => (showArchived ? groups : groups.filter((group) => !group.archived)),
    [groups, showArchived]
  );

  const activeGroup = React.useMemo(
    () => groups.find((group) => group.id === activeGroupId) ?? groups[0],
    [groups, activeGroupId]
  );

  React.useEffect(() => {
    if (!activeGroup) {
      return;
    }

    if (activeGroup.archived && !showArchived) {
      const fallback = groups.find((group) => !group.archived) ?? groups[0];
      if (fallback) {
        setActiveGroupId(fallback.id);
      }
    }
  }, [activeGroup, groups, showArchived]);

  React.useEffect(() => {
    if (groups.some((group) => group.id === activeGroupId)) {
      return;
    }

    if (groups[0]) {
      setActiveGroupId(groups[0].id);
    }
  }, [groups, activeGroupId]);

  React.useEffect(() => {
    const payload = {
      groups,
      tasks,
      activeGroupId,
      mode,
      accent,
      filter,
      sortMode,
      showArchived,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [groups, tasks, activeGroupId, mode, accent, filter, sortMode, showArchived]);

  React.useEffect(() => {
    if (!groupMenu.isOpen) {
      return undefined;
    }

    const handleClose = () => {
      setGroupMenu((prev) => ({ ...prev, isOpen: false }));
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("click", handleClose);
    window.addEventListener("resize", handleClose);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("resize", handleClose);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [groupMenu.isOpen]);

  React.useLayoutEffect(() => {
    if (!groupMenu.isOpen || !groupMenuRef.current) {
      return;
    }

    const padding = 8;
    const menuRect = groupMenuRef.current.getBoundingClientRect();
    const maxX = window.innerWidth - menuRect.width - padding;
    const maxY = window.innerHeight - menuRect.height - padding;

    setMenuPosition({
      x: Math.max(padding, Math.min(groupMenu.x, maxX)),
      y: Math.max(padding, Math.min(groupMenu.y, maxY)),
    });
  }, [groupMenu]);

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      exitingTimersRef.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      exitingTimersRef.current.clear();
    };
  }, []);

  React.useEffect(() => {
    const handleGlobalEnter = (event) => {
      if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }

      if (isTaskModalOpen || renameModal.isOpen) {
        return;
      }

      event.preventDefault();
      setIsTaskModalOpen(true);
    };

    window.addEventListener("keydown", handleGlobalEnter);
    return () => window.removeEventListener("keydown", handleGlobalEnter);
  }, [isTaskModalOpen, renameModal.isOpen]);

  const queueToast = (message, undoPayload = null) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToast({ message, undoPayload });

    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  const handleUndo = () => {
    if (!toast?.undoPayload) {
      return;
    }

    const payload = toast.undoPayload;

    if (payload.type === "restore-task") {
      setTasks((prevTasks) => [payload.task, ...prevTasks]);
    }

    if (payload.type === "restore-group-tasks") {
      setTasks((prevTasks) => [...payload.tasks, ...prevTasks]);
    }

    if (payload.type === "restore-snapshot") {
      setGroups(payload.snapshot.groups);
      setTasks(payload.snapshot.tasks);
      setActiveGroupId(payload.snapshot.activeGroupId);
    }

    setToast(null);
  };

  const handleAddGroup = (event) => {
    event.preventDefault();

    const trimmed = newGroupName.trim();
    if (!trimmed) {
      return;
    }

    const duplicate = groups.some((group) => group.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      return;
    }

    const nextGroup = {
      id: crypto.randomUUID(),
      name: trimmed,
      archived: false,
    };

    setGroups((prevGroups) => [...prevGroups, nextGroup]);
    setActiveGroupId(nextGroup.id);
    setNewGroupName("");
  };

  const handleGroupContextMenu = (event, groupId) => {
    event.preventDefault();
    setGroupMenu({
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      groupId,
    });
  };

  const openRenameModal = () => {
    const targetGroup = groups.find((group) => group.id === groupMenu.groupId);
    if (!targetGroup) {
      return;
    }

    setRenameModal({
      isOpen: true,
      groupId: targetGroup.id,
      value: targetGroup.name,
    });

    setGroupMenu((prev) => ({ ...prev, isOpen: false }));
  };

  const handleRenameSubmit = (event) => {
    event.preventDefault();

    const targetGroup = groups.find((group) => group.id === renameModal.groupId);
    if (!targetGroup) {
      setRenameModal({ isOpen: false, groupId: null, value: "" });
      return;
    }

    const trimmed = renameModal.value.trim();
    if (!trimmed) {
      return;
    }

    const duplicate = groups.some(
      (group) => group.id !== targetGroup.id && group.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      return;
    }

    setGroups((prevGroups) =>
      prevGroups.map((group) => (group.id === targetGroup.id ? { ...group, name: trimmed } : group))
    );
    setRenameModal({ isOpen: false, groupId: null, value: "" });
  };

  const handleDuplicateGroup = () => {
    const sourceGroup = groups.find((group) => group.id === groupMenu.groupId);
    if (!sourceGroup) {
      return;
    }

    const duplicateName = makeUniqueGroupName(`${sourceGroup.name} Copy`, groups);
    const nextGroupId = crypto.randomUUID();

    const copiedTasks = tasks
      .filter((task) => task.groupId === sourceGroup.id)
      .map((task) => ({
        ...task,
        id: crypto.randomUUID(),
        groupId: nextGroupId,
        createdAt: new Date().toISOString(),
      }));

    setGroups((prevGroups) => [...prevGroups, { id: nextGroupId, name: duplicateName, archived: false }]);
    setTasks((prevTasks) => [...copiedTasks, ...prevTasks]);
    setActiveGroupId(nextGroupId);
    setGroupMenu((prev) => ({ ...prev, isOpen: false }));
  };

  const handleToggleArchiveGroup = () => {
    const targetGroup = groups.find((group) => group.id === groupMenu.groupId);
    if (!targetGroup) {
      return;
    }

    const shouldArchive = !targetGroup.archived;

    setGroups((prevGroups) =>
      prevGroups.map((group) =>
        group.id === targetGroup.id
          ? {
              ...group,
              archived: shouldArchive,
            }
          : group
      )
    );

    if (shouldArchive && activeGroupId === targetGroup.id && !showArchived) {
      const fallback = groups.find((group) => group.id !== targetGroup.id && !group.archived) ?? groups[0];
      if (fallback) {
        setActiveGroupId(fallback.id);
      }
    }

    setGroupMenu((prev) => ({ ...prev, isOpen: false }));
  };

  const handleEmptyGroup = () => {
    const targetGroup = groups.find((group) => group.id === groupMenu.groupId);
    if (!targetGroup) {
      return;
    }

    const removed = tasks.filter((task) => task.groupId === targetGroup.id);
    if (removed.length === 0) {
      setGroupMenu((prev) => ({ ...prev, isOpen: false }));
      return;
    }

    setTasks((prevTasks) => prevTasks.filter((task) => task.groupId !== targetGroup.id));
    setGroupMenu((prev) => ({ ...prev, isOpen: false }));

    queueToast(`Emptied ${targetGroup.name}`, {
      type: "restore-group-tasks",
      tasks: removed,
    });
  };

  const handleDeleteGroup = () => {
    const targetGroupId = groupMenu.groupId;
    if (!targetGroupId) {
      return;
    }

    const snapshot = {
      groups,
      tasks,
      activeGroupId,
    };

    const remainingGroups = groups.filter((group) => group.id !== targetGroupId);

    let nextGroups = remainingGroups;
    let fallbackGroupId = remainingGroups[0]?.id;

    if (!fallbackGroupId) {
      const replacement = { id: crypto.randomUUID(), name: "New Group", archived: false };
      nextGroups = [replacement];
      fallbackGroupId = replacement.id;
    }

    setGroups(nextGroups);
    setTasks((prevTasks) =>
      prevTasks.map((task) => (task.groupId === targetGroupId ? { ...task, groupId: fallbackGroupId } : task))
    );

    if (activeGroupId === targetGroupId) {
      setActiveGroupId(fallbackGroupId);
    }

    setGroupMenu((prev) => ({ ...prev, isOpen: false }));

    queueToast("Group deleted", {
      type: "restore-snapshot",
      snapshot,
    });
  };

  const handleAddTask = (event) => {
    event.preventDefault();

    const trimmed = newTaskText.trim();
    if (!trimmed || !activeGroup) {
      return;
    }

    const task = {
      id: crypto.randomUUID(),
      text: trimmed,
      completed: false,
      createdAt: new Date().toISOString(),
      groupId: activeGroup.id,
      priority: newTaskPriority,
    };

    setTasks((prevTasks) => [task, ...prevTasks]);
    setNewTaskText("");
    setNewTaskPriority("medium");
    setIsTaskModalOpen(false);
  };

  const handleToggleTask = (taskId) => {
    const targetTask = tasks.find((task) => task.id === taskId);
    if (!targetTask) {
      return;
    }

    if (filter === FILTERS.ACTIVE && !targetTask.completed) {
      const existingTimer = exitingTimersRef.current.get(taskId);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      setExitingTaskIds((prev) => ({ ...prev, [taskId]: true }));
      const timerId = window.setTimeout(() => {
        setTasks((prevTasks) =>
          prevTasks.map((task) => (task.id === taskId ? { ...task, completed: true } : task))
        );
        setExitingTaskIds((prev) => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
        exitingTimersRef.current.delete(taskId);
      }, 260);

      exitingTimersRef.current.set(taskId, timerId);
      return;
    }

    setTasks((prevTasks) =>
      prevTasks.map((task) => (task.id === taskId ? { ...task, completed: !task.completed } : task))
    );
  };

  const handleDeleteTask = (taskId) => {
    const targetTask = tasks.find((task) => task.id === taskId);
    if (!targetTask) {
      return;
    }

    setTasks((prevTasks) => prevTasks.filter((task) => task.id !== taskId));

    queueToast("Task deleted", {
      type: "restore-task",
      task: targetTask,
    });
  };

  const handleClearCompleted = () => {
    if (!activeGroup) {
      return;
    }

    const removed = tasks.filter((task) => task.groupId === activeGroup.id && task.completed);
    if (removed.length === 0) {
      return;
    }

    setTasks((prevTasks) => prevTasks.filter((task) => !(task.groupId === activeGroup.id && task.completed)));

    queueToast("Completed tasks cleared", {
      type: "restore-group-tasks",
      tasks: removed,
    });
  };

  const handleResetGroup = () => {
    if (!activeGroup) {
      return;
    }

    const hasCompleted = tasks.some((task) => task.groupId === activeGroup.id && task.completed);
    if (!hasCompleted) {
      return;
    }

    const snapshot = {
      groups,
      tasks,
      activeGroupId,
    };

    setTasks((prevTasks) =>
      prevTasks.map((task) => (task.groupId === activeGroup.id ? { ...task, completed: false } : task))
    );

    queueToast(`${activeGroup.name} reset`, {
      type: "restore-snapshot",
      snapshot,
    });
  };

  const groupTasks = React.useMemo(
    () => tasks.filter((task) => task.groupId === activeGroup?.id),
    [tasks, activeGroup]
  );

  const totalCount = groupTasks.length;
  const completedCount = groupTasks.filter((task) => task.completed).length;
  const remainingCount = totalCount - completedCount;
  const completionPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const filteredTasks = React.useMemo(() => {
    return groupTasks.filter((task) => {
      if (filter === FILTERS.ACTIVE) {
        return !task.completed;
      }

      if (filter === FILTERS.COMPLETED) {
        return task.completed;
      }

      return true;
    });
  }, [groupTasks, filter]);

  const visibleTasks = React.useMemo(() => {
    const next = [...filteredTasks];

    if (sortMode === "newest") {
      next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    if (sortMode === "oldest") {
      next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    if (sortMode === "priority") {
      const rank = { high: 3, medium: 2, low: 1 };
      next.sort((a, b) => {
        const priorityDelta = (rank[b.priority] ?? 0) - (rank[a.priority] ?? 0);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    return next;
  }, [filteredTasks, sortMode]);

  const isManualSort = sortMode === "manual";

  const handleTaskDragStart = (event, taskId) => {
    if (!isManualSort) {
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
    setDragTaskId(taskId);
    setDragGroupId(null);
  };

  const handleTaskDrop = (event, targetTaskId) => {
    event.preventDefault();

    if (!isManualSort) {
      return;
    }

    const sourceTaskId = dragTaskId ?? event.dataTransfer.getData("text/plain");
    if (!sourceTaskId || sourceTaskId === targetTaskId) {
      setDragOverTaskId(null);
      return;
    }

    setTasks((prevTasks) => {
      const sourceIndex = prevTasks.findIndex((task) => task.id === sourceTaskId);
      const targetIndex = prevTasks.findIndex((task) => task.id === targetTaskId);

      if (sourceIndex < 0 || targetIndex < 0) {
        return prevTasks;
      }

      const sourceTask = prevTasks[sourceIndex];
      const targetTask = prevTasks[targetIndex];

      if (sourceTask.groupId !== targetTask.groupId) {
        return prevTasks;
      }

      const nextTasks = [...prevTasks];
      const [moved] = nextTasks.splice(sourceIndex, 1);
      const insertionIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      nextTasks.splice(insertionIndex, 0, moved);

      return nextTasks;
    });

    setDragOverTaskId(null);
    setDragTaskId(null);
  };

  const handleGroupDragStart = (event, groupId) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-group-id", groupId);
    setDragGroupId(groupId);
    setDragTaskId(null);
  };

  const handleDropOnGroup = (event, targetGroupId) => {
    event.preventDefault();

    const sourceGroupId = dragGroupId ?? event.dataTransfer.getData("application/x-group-id");
    if (sourceGroupId) {
      if (sourceGroupId === targetGroupId) {
        setDragGroupId(null);
        setDragOverGroupId(null);
        return;
      }

      setGroups((prevGroups) => {
        const sourceIndex = prevGroups.findIndex((group) => group.id === sourceGroupId);
        const targetIndex = prevGroups.findIndex((group) => group.id === targetGroupId);
        if (sourceIndex < 0 || targetIndex < 0) {
          return prevGroups;
        }

        const nextGroups = [...prevGroups];
        const [moved] = nextGroups.splice(sourceIndex, 1);
        const insertionIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        nextGroups.splice(insertionIndex, 0, moved);
        return nextGroups;
      });

      setDragGroupId(null);
      setDragOverGroupId(null);
      return;
    }

    const sourceTaskId = dragTaskId ?? event.dataTransfer.getData("text/plain");
    if (!sourceTaskId) {
      return;
    }

    setTasks((prevTasks) => {
      const sourceIndex = prevTasks.findIndex((task) => task.id === sourceTaskId);
      if (sourceIndex < 0) {
        return prevTasks;
      }

      const sourceTask = prevTasks[sourceIndex];
      if (sourceTask.groupId === targetGroupId) {
        return prevTasks;
      }

      const nextTasks = [...prevTasks];
      nextTasks.splice(sourceIndex, 1);
      nextTasks.unshift({ ...sourceTask, groupId: targetGroupId });

      return nextTasks;
    });

    setDragTaskId(null);
    setDragOverTaskId(null);
    setDragOverGroupId(null);
  };

  const menuGroup = groups.find((group) => group.id === groupMenu.groupId);

  return (
    <main className="todo-shell" data-mode={mode} data-accent={accent}>
      <div className="bg-orb orb-one" aria-hidden="true"></div>
      <div className="bg-orb orb-two" aria-hidden="true"></div>

      <section className="todo-app" aria-label="Todo app">
        <aside className="group-sidebar reveal">
          <header className="sidebar-header">
            <p className="kicker">Task Groups</p>
            <h2>Projects</h2>
          </header>

          <section className="theme-switcher" aria-label="Theme controls">
            <div className="theme-group">
              <p>Mode</p>
              {MODES.map((modeOption) => (
                <button
                  key={modeOption}
                  type="button"
                  className={mode === modeOption ? "theme-chip active" : "theme-chip"}
                  onClick={() => setMode(modeOption)}
                >
                  {modeOption[0].toUpperCase() + modeOption.slice(1)}
                </button>
              ))}
            </div>

            <div className="theme-group">
              <p>Color</p>
              {ACCENTS.map((accentOption) => (
                <button
                  key={accentOption}
                  type="button"
                  className={accent === accentOption ? "theme-chip active" : "theme-chip"}
                  onClick={() => setAccent(accentOption)}
                >
                  {accentOption[0].toUpperCase() + accentOption.slice(1)}
                </button>
              ))}
            </div>
          </section>

          <form className="group-form" onSubmit={handleAddGroup}>
            <label htmlFor="new-group" className="visually-hidden">
              New group name
            </label>
            <input
              id="new-group"
              type="text"
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="Create a group"
              maxLength={40}
            />
            <button type="submit">Add</button>
          </form>

          <label className="archive-toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show archived groups
          </label>

          <div className="group-list" role="tablist" aria-label="Task groups">
            {visibleGroups.map((group) => {
              const groupCount = tasks.filter((task) => task.groupId === group.id && !task.completed).length;

              return (
                <button
                  key={group.id}
                  type="button"
                  role="tab"
                  aria-selected={activeGroup?.id === group.id}
                  className={[
                    "group-tab",
                    activeGroup?.id === group.id ? "active" : "",
                    dragOverGroupId === group.id ? "drag-over" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setActiveGroupId(group.id)}
                  onContextMenu={(event) => handleGroupContextMenu(event, group.id)}
                  draggable
                  onDragStart={(event) => handleGroupDragStart(event, group.id)}
                  onDragEnd={() => {
                    setDragGroupId(null);
                    setDragOverGroupId(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    const isGroupDrag =
                      Boolean(dragGroupId) || event.dataTransfer.types.includes("application/x-group-id");
                    if (isGroupDrag) {
                      setDragOverGroupId(group.id);
                    }
                  }}
                  onDrop={(event) => handleDropOnGroup(event, group.id)}
                  title="Right click for options"
                >
                  <span>
                    {group.name}
                    {group.archived ? <em className="group-archived">Archived</em> : null}
                  </span>
                  <strong>{groupCount}</strong>
                </button>
              );
            })}
          </div>

          <p className="sidebar-hint">Right-click a group for rename, duplicate, archive, empty, or delete.</p>
        </aside>

        <section className="task-pane">
          <header className="todo-header reveal">
            <p className="kicker">Daily Flow</p>
            <div className="header-row">
              <h1>{activeGroup ? activeGroup.name : "Tasks"}</h1>
              <div className="header-actions">
                <div className="filter-wrap header-sort">
                  <label htmlFor="task-filter">Show</label>
                  <select id="task-filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
                    <option value={FILTERS.ACTIVE}>Active</option>
                    <option value={FILTERS.COMPLETED}>Completed</option>
                    <option value={FILTERS.ALL}>All</option>
                  </select>
                </div>

                <button type="button" className="create-task-button" onClick={() => setIsTaskModalOpen(true)}>
                  +
                </button>
              </div>
            </div>
            <p className="subtitle">Add tasks, sort them, and check off progress.</p>
          </header>

          <section className="composer reveal">
            <div className="toolbar">
              <div className="sort-wrap">
                <label htmlFor="sort-mode">Sort</label>
                <select id="sort-mode" value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                  <option value="manual">Manual</option>
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="priority">Priority</option>
                </select>
              </div>

              <button type="button" className="clear-btn" onClick={handleClearCompleted} disabled={completedCount === 0}>
                Clear completed
              </button>
            </div>

            <section className="progress-wrap" aria-label="Completion progress">
              <div className="progress-labels">
                <span>{activeGroup?.name ?? "Group"} progress</span>
                <span>{completionPercent}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${completionPercent}%` }}></div>
              </div>
              {!isManualSort ? <p className="drag-hint">Switch to Manual sort to drag and reorder tasks.</p> : null}
            </section>
          </section>

          <ul className="todo-list" aria-live="polite">
            {visibleTasks.length === 0 ? (
              <li className="empty-state reveal">
                {totalCount === 0 ? `No tasks in ${activeGroup?.name ?? "this group"} yet.` : "No tasks in this filter."}
              </li>
            ) : (
              visibleTasks.map((task, index) => (
                <li
                  key={task.id}
                  className={[
                    "todo-item",
                    dragOverTaskId === task.id ? "drag-over" : "",
                    exitingTaskIds[task.id] ? "exiting" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ animationDelay: `${index * 55}ms` }}
                  draggable={isManualSort && !exitingTaskIds[task.id]}
                  onDragStart={(event) => handleTaskDragStart(event, task.id)}
                  onDragEnd={() => {
                    setDragTaskId(null);
                    setDragOverTaskId(null);
                  }}
                  onDragOver={(event) => {
                    if (isManualSort) {
                      event.preventDefault();
                      setDragOverTaskId(task.id);
                    }
                  }}
                  onDrop={(event) => handleTaskDrop(event, task.id)}
                >
                  <label className="task-main">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => handleToggleTask(task.id)}
                    />
                    <span className="checkmark" aria-hidden="true"></span>
                    <span className={task.completed ? "task-text done" : "task-text"}>{task.text}</span>
                  </label>

                  <div className="task-meta">
                    <span className={`priority-badge ${task.priority}`}>{task.priority}</span>
                  </div>

                  <button type="button" className="delete-btn" onClick={() => handleDeleteTask(task.id)}>
                    Delete
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        {groupMenu.isOpen ? (
          <div
            className="group-menu"
            style={{ top: menuPosition.y, left: menuPosition.x }}
            role="menu"
            ref={groupMenuRef}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" role="menuitem" onClick={openRenameModal}>
              Rename
            </button>
            <button type="button" role="menuitem" onClick={handleDuplicateGroup}>
              Duplicate
            </button>
            <button type="button" role="menuitem" onClick={handleToggleArchiveGroup}>
              {menuGroup?.archived ? "Unarchive" : "Archive"}
            </button>
            <button type="button" role="menuitem" onClick={handleEmptyGroup}>
              Empty Group
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                handleResetGroup();
                setGroupMenu((prev) => ({ ...prev, isOpen: false }));
              }}
            >
              Reset Group
            </button>
            <button type="button" role="menuitem" onClick={handleDeleteGroup} className="danger-option">
              Delete
            </button>
          </div>
        ) : null}

        {renameModal.isOpen ? (
          <div className="modal-backdrop" onClick={() => setRenameModal({ isOpen: false, groupId: null, value: "" })}>
            <div className="rename-modal" onClick={(event) => event.stopPropagation()}>
              <h3>Rename Group</h3>
              <form onSubmit={handleRenameSubmit}>
                <input
                  autoFocus
                  value={renameModal.value}
                  onChange={(event) => setRenameModal((prev) => ({ ...prev, value: event.target.value }))}
                  maxLength={40}
                />
                <div className="modal-actions">
                  <button type="button" onClick={() => setRenameModal({ isOpen: false, groupId: null, value: "" })}>
                    Cancel
                  </button>
                  <button type="submit">Save</button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {isTaskModalOpen ? (
          <div className="modal-backdrop" onClick={() => setIsTaskModalOpen(false)}>
            <div className="rename-modal task-modal" onClick={(event) => event.stopPropagation()}>
              <h3>Create Task</h3>
              <form onSubmit={handleAddTask} className="task-modal-form">
                <input
                  autoFocus
                  type="text"
                  value={newTaskText}
                  onChange={(event) => setNewTaskText(event.target.value)}
                  placeholder={`Task for ${activeGroup?.name ?? "this group"}`}
                  maxLength={120}
                />

                <select value={newTaskPriority} onChange={(event) => setNewTaskPriority(event.target.value)}>
                  <option value="high">High priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="low">Low priority</option>
                </select>

                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setIsTaskModalOpen(false);
                      setNewTaskText("");
                      setNewTaskPriority("medium");
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit">Create Task</button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

      </section>

      {toast ? (
        <div className="toast">
          <span>{toast.message}</span>
          {toast.undoPayload ? (
            <button type="button" onClick={handleUndo}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
