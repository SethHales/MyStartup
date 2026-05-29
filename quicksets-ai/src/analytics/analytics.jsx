import React from 'react';
import { createPortal } from 'react-dom';
import "./analytics.css";
import { Dropdown } from "../components/dropdown";
import { ExplorerPreferenceCard } from "../components/explorerPreferenceCard";
import { WorkoutHistoryPreview } from "../components/workoutHistoryPreview";
import {
  formatMeasurementLabel,
  getSetDisplayLabel,
  normalizeSetType,
  parseDurationToSeconds,
  parseLocalDate,
} from "../utils/workoutDomain";
import {
  findWorkoutColorSlot,
  getWorkoutColor,
  getWorkoutColorPreferenceLabel,
  resolveWorkoutColorPreferences,
} from "../utils/workoutColors";

const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];
const setFieldColumns = [
  { key: "reps", label: "Reps", inputType: "number", placeholder: "10" },
  { key: "weight", label: "Weight", inputType: "number", placeholder: "135" },
  { key: "duration", label: "Time", inputType: "text", placeholder: "00:30" },
  { key: "distance", label: "Distance", inputType: "number", placeholder: "1.5" },
];
const setTypeOptions = [
  { value: "regular", label: "Regular" },
  { value: "warmup", label: "Warmup" },
  { value: "max", label: "Max" },
];
const defaultExplorerPreferences = {
  statCards: {
    lastPerformed: true,
    bestWeight: true,
    highestReps: true,
    farthestDistance: true,
    longestDuration: true,
    shortestDuration: true,
    bestPace: true,
    estimatedOneRepMax: true,
  },
  averages: {
    averageSetsPerSession: true,
    averageRepsPerSet: true,
    averageWeightPerSet: true,
    averageTimePerSet: true,
    averagePace: true,
  },
  charts: {
    performanceTrend: true,
    estimatedOneRepMaxTrend: true,
    setVolumeTrend: true,
    monthlyFrequency: true,
  },
  statCardOrder: [],
  averageOrder: [],
  chartOrder: [],
};

export function Analytics({ currentUser }) {
  const [workouts, setWorkouts] = React.useState([]);
  const [templates, setTemplates] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedWorkoutName, setSelectedWorkoutName] = React.useState("");
  const [workoutPageSize, setWorkoutPageSize] = React.useState("5");
  const [workoutPage, setWorkoutPage] = React.useState(1);
  const [sessionFocusRequest, setSessionFocusRequest] = React.useState(null);
  const [showExplorerEditModal, setShowExplorerEditModal] = React.useState(false);
  const [showMobileWorkoutPicker, setShowMobileWorkoutPicker] = React.useState(false);
  const [openSessionMenuId, setOpenSessionMenuId] = React.useState(null);
  const [editingSession, setEditingSession] = React.useState(null);
  const [draftSession, setDraftSession] = React.useState(null);
  const [explorerPreferencesDraft, setExplorerPreferencesDraft] = React.useState(defaultExplorerPreferences);
  const [isSavingExplorerPreferences, setIsSavingExplorerPreferences] = React.useState(false);
  const [dragState, setDragState] = React.useState(null);
  const dragStateRef = React.useRef(null);
  const explorerCardRefs = React.useRef(new Map());
  const explorerModalRef = React.useRef(null);
  const mobileWorkoutPickerRefs = React.useRef(new Map());
  const previousExplorerCardPositions = React.useRef(new Map());
  const workoutColorPreferences = React.useMemo(
    () => resolveWorkoutColorPreferences(currentUser?.workoutColorPreferences, currentUser?.workoutColorLabels),
    [currentUser?.workoutColorPreferences, currentUser?.workoutColorLabels]
  );

  React.useEffect(() => {
    Promise.all([
      fetch('/api/workouts', {
        method: 'GET',
        credentials: 'include',
      }),
      fetch('/api/workout-templates', {
        method: 'GET',
        credentials: 'include',
      }),
    ])
      .then(async ([workoutsResponse, templatesResponse]) => {
        const workoutPayload = workoutsResponse.ok
          ? await workoutsResponse.json()
          : (workoutsResponse.status === 401 ? [] : Promise.reject(new Error('Failed to fetch workouts')));
        const templatePayload = templatesResponse.ok
          ? await templatesResponse.json()
          : (templatesResponse.status === 401 ? [] : Promise.reject(new Error('Failed to fetch workout templates')));

        return { workoutPayload, templatePayload };
      })
      .then(({ workoutPayload, templatePayload }) => {
        const sortedWorkouts = sortWorkoutsAscending(workoutPayload);
        setWorkouts(sortedWorkouts);
        setTemplates(templatePayload);
        const expandedWorkouts = expandAnalyticsWorkouts(sortedWorkouts);
        const mostUsedWorkoutName = getMostUsedWorkoutName(expandedWorkouts);
        if (mostUsedWorkoutName && mostUsedWorkoutName !== "None yet") {
          setSelectedWorkoutName((currentName) => currentName || mostUsedWorkoutName);
        }
      })
      .catch((err) => {
        console.error('Error loading analytics data:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  React.useEffect(() => {
    if (!openSessionMenuId) {
      return undefined;
    }

    const closeOpenSessionMenu = () => setOpenSessionMenuId(null);
    window.addEventListener("scroll", closeOpenSessionMenu, true);
    window.addEventListener("resize", closeOpenSessionMenu);

    return () => {
      window.removeEventListener("scroll", closeOpenSessionMenu, true);
      window.removeEventListener("resize", closeOpenSessionMenu);
    };
  }, [openSessionMenuId]);

  const analyticsWorkouts = React.useMemo(() => expandAnalyticsWorkouts(workouts), [workouts]);
  const workoutNames = React.useMemo(() => getWorkoutNames(analyticsWorkouts), [analyticsWorkouts]);
  const uniqueWorkoutDays = React.useMemo(() => getUniqueWorkoutDays(analyticsWorkouts), [analyticsWorkouts]);
  const dayCountMap = React.useMemo(() => getWorkoutDayCountMap(analyticsWorkouts), [analyticsWorkouts]);

  const profileIdentity = React.useMemo(
    () => buildProfileIdentity(analyticsWorkouts, currentUser),
    [analyticsWorkouts, currentUser]
  );

  const weeklySnapshot = React.useMemo(
    () => buildWeeklySnapshot(analyticsWorkouts, uniqueWorkoutDays),
    [analyticsWorkouts, uniqueWorkoutDays]
  );

  const consistencyStats = React.useMemo(
    () => buildConsistencyStats(analyticsWorkouts, uniqueWorkoutDays, dayCountMap),
    [analyticsWorkouts, uniqueWorkoutDays, dayCountMap]
  );

  const selectedWorkoutStats = React.useMemo(
    () => buildSelectedWorkoutStats(analyticsWorkouts, selectedWorkoutName),
    [analyticsWorkouts, selectedWorkoutName]
  );
  const selectedWorkoutSessions = React.useMemo(
    () => selectedWorkoutName
      ? analyticsWorkouts.filter((workout) => (workout.templateName || workout.exercise) === selectedWorkoutName)
      : [],
    [analyticsWorkouts, selectedWorkoutName]
  );
  const workoutExplorerItems = React.useMemo(
    () => buildWorkoutExplorerItems(analyticsWorkouts),
    [analyticsWorkouts]
  );
  const selectedWorkoutColor = React.useMemo(
    () => selectedWorkoutName
      ? getWorkoutColorByName(analyticsWorkouts, selectedWorkoutName)
      : getWorkoutColor("QuickSets"),
    [analyticsWorkouts, selectedWorkoutName]
  );
  const selectedWorkoutExplorerItem = React.useMemo(
    () => workoutExplorerItems.find((workout) => workout.name === selectedWorkoutName) || null,
    [selectedWorkoutName, workoutExplorerItems]
  );
  const selectedWorkoutGroupLabel = React.useMemo(
    () => getWorkoutColorPreferenceLabel(selectedWorkoutColor, workoutColorPreferences) || "",
    [selectedWorkoutColor, workoutColorPreferences]
  );
  const selectedWorkoutTemplate = React.useMemo(
    () => {
      if (!selectedWorkoutStats) {
        return null;
      }

      return templates.find((template) =>
        template.id === selectedWorkoutStats.templateId
        || template.name === selectedWorkoutName
      ) || null;
    },
    [selectedWorkoutName, selectedWorkoutStats, templates]
  );
  const workoutTemplateOptions = React.useMemo(
    () => buildWorkoutTemplateOptions(templates, workoutColorPreferences),
    [templates, workoutColorPreferences]
  );
  const selectedExplorerPreferences = React.useMemo(
    () => normalizeExplorerPreferences(selectedWorkoutTemplate?.explorerPreferences, selectedWorkoutStats),
    [selectedWorkoutTemplate?.explorerPreferences, selectedWorkoutStats]
  );
  const visibleStatCards = React.useMemo(
    () => buildSelectedWorkoutStatCards(
      selectedWorkoutStats,
      selectedExplorerPreferences,
      (workoutId) => setSessionFocusRequest({ workoutId, token: Date.now() })
    ),
    [selectedWorkoutStats, selectedExplorerPreferences]
  );
  const visibleAverageMetrics = React.useMemo(
    () => buildVisibleAverageMetrics(selectedWorkoutStats?.averageMetrics, selectedExplorerPreferences),
    [selectedWorkoutStats?.averageMetrics, selectedExplorerPreferences]
  );
  const visibleCharts = React.useMemo(
    () => buildSelectedWorkoutCharts(selectedWorkoutStats, selectedExplorerPreferences),
    [selectedWorkoutStats, selectedExplorerPreferences]
  );
  const explorerEditSections = React.useMemo(
    () => buildExplorerEditSections(selectedWorkoutStats),
    [selectedWorkoutStats]
  );
  const pageSize = Number(workoutPageSize) || 5;
  const totalWorkoutPages = Math.max(1, Math.ceil(workoutExplorerItems.length / pageSize));
  const activeWorkoutPage = Math.min(workoutPage, totalWorkoutPages);
  const visibleWorkoutItems = React.useMemo(() => {
    const startIndex = (activeWorkoutPage - 1) * pageSize;
    return workoutExplorerItems.slice(startIndex, startIndex + pageSize);
  }, [activeWorkoutPage, pageSize, workoutExplorerItems]);

  React.useEffect(() => {
    setWorkoutPage((currentPage) => Math.min(currentPage, totalWorkoutPages));
  }, [totalWorkoutPages]);

  React.useEffect(() => {
    const selectedIndex = workoutExplorerItems.findIndex((workout) => workout.name === selectedWorkoutName);
    if (selectedIndex < 0) {
      return;
    }

    const nextPage = Math.floor(selectedIndex / pageSize) + 1;
    setWorkoutPage((currentPage) => currentPage === nextPage ? currentPage : nextPage);
  }, [pageSize, selectedWorkoutName, workoutExplorerItems]);

  const openExplorerEditModal = React.useCallback(() => {
    setExplorerPreferencesDraft(selectedExplorerPreferences);
    setDragState(null);
    dragStateRef.current = null;
    previousExplorerCardPositions.current = new Map();
    setShowExplorerEditModal(true);
  }, [selectedExplorerPreferences]);

  const selectExplorerWorkout = React.useCallback((workoutName) => {
    setSelectedWorkoutName(workoutName);
    setShowMobileWorkoutPicker(false);
  }, []);

  const toggleSessionMenu = React.useCallback((sessionId) => {
    setOpenSessionMenuId((currentId) => currentId === sessionId ? null : sessionId);
  }, []);

  const closeSessionEditModal = React.useCallback(() => {
    setEditingSession(null);
    setDraftSession(null);
  }, []);

  const openSessionEditModal = React.useCallback((session) => {
    const storedSession = resolveStoredSession(session, workouts);
    setOpenSessionMenuId(null);
    setEditingSession(storedSession);
    setDraftSession(cloneAnalyticsSessionForEdit(storedSession));
  }, [workouts]);

  const handleDraftSessionFieldChange = React.useCallback((field, value) => {
    setDraftSession((currentSession) => ({
      ...currentSession,
      [field]: value,
    }));
  }, []);

  const handleDraftSessionSetChange = React.useCallback((setId, field, value) => {
    setDraftSession((currentSession) => {
      if (!currentSession) {
        return currentSession;
      }

      if (field === "templateId" && currentSession.isMixed) {
        const nextTemplate = templates.find((template) => template.id === value);

        return {
          ...currentSession,
          sets: currentSession.sets.map((set) =>
            set.id === setId
              ? {
                id: set.id,
                setType: normalizeSetType(set.setType),
                templateId: nextTemplate?.id || value,
                templateName: nextTemplate?.name || set.templateName || "",
                color: nextTemplate ? getWorkoutColor(nextTemplate) : set.color,
                fields: nextTemplate?.fields || set.fields || {},
                measurements: nextTemplate?.measurements || set.measurements || {},
                ...copyAnalyticsSetFields(set, nextTemplate?.fields || set.fields || {}),
              }
              : set
          ),
        };
      }

      return {
        ...currentSession,
        sets: currentSession.sets.map((set) =>
          set.id === setId
            ? { ...set, [field]: value }
            : set
        ),
      };
    });
  }, [templates]);

  const handleDraftSessionAddSet = React.useCallback(() => {
    setDraftSession((currentSession) => {
      if (!currentSession) {
        return currentSession;
      }

      const nextSetId = currentSession.sets.length + 1;
      return {
        ...currentSession,
        sets: [
          ...currentSession.sets,
          buildAnalyticsDraftSet(currentSession, templates, nextSetId),
        ],
      };
    });
  }, [templates]);

  const handleDraftSessionDeleteSet = React.useCallback((setId) => {
    setDraftSession((currentSession) => {
      if (!currentSession) {
        return currentSession;
      }

      return {
        ...currentSession,
        sets: currentSession.sets
          .filter((set) => set.id !== setId)
          .map((set, index) => ({ ...set, id: index + 1 })),
      };
    });
  }, []);

  const handleSaveSession = React.useCallback(async (event) => {
    event.preventDefault();

    if (!editingSession || !draftSession) {
      return;
    }

    try {
      const response = await fetch(`/api/workouts/${editingSession.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          date: draftSession.date,
          notes: draftSession.notes,
          starred: Boolean(draftSession.starred),
          sets: draftSession.sets,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        alert(body.msg || "Failed to update session");
        return;
      }

      setWorkouts((currentWorkouts) =>
        sortWorkoutsAscending(
          currentWorkouts.map((workout) => workout.id === body.id ? body : workout)
        )
      );
      closeSessionEditModal();
    } catch (err) {
      console.error("Error updating analytics session:", err);
      alert("Failed to update session");
    }
  }, [closeSessionEditModal, draftSession, editingSession]);

  const handleDeleteSession = React.useCallback(async (session) => {
    const storedSession = resolveStoredSession(session, workouts);
    setOpenSessionMenuId(null);

    try {
      const response = await fetch(`/api/workouts/${storedSession.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        alert(body.msg || "Failed to delete session");
        return;
      }

      setWorkouts((currentWorkouts) =>
        currentWorkouts.filter((workout) => workout.id !== storedSession.id)
      );
    } catch (err) {
      console.error("Error deleting analytics session:", err);
      alert("Failed to delete session");
    }
  }, [workouts]);

  const handleSeparateSession = React.useCallback(async (session) => {
    const storedSession = resolveStoredSession(session, workouts);
    setOpenSessionMenuId(null);

    if (!storedSession?.isMixed) {
      alert("Only full workouts can be separated.");
      return;
    }

    const confirmed = window.confirm(
      `Separate ${storedSession.templateName || storedSession.exercise || "Full Workout"}? This will split the full workout into its individual exercise sessions.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/workouts/${storedSession.id}/separate`, {
        method: "POST",
        credentials: "include",
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        alert(body?.msg || "Failed to separate session");
        return;
      }

      setWorkouts((currentWorkouts) =>
        sortWorkoutsAscending([
          ...currentWorkouts.filter((workout) => workout.id !== storedSession.id),
          ...body,
        ])
      );
    } catch (err) {
      console.error("Error separating analytics session:", err);
      alert("Failed to separate session");
    }
  }, [workouts]);

  React.useEffect(() => {
    if (!showMobileWorkoutPicker || !selectedWorkoutName) {
      return;
    }

    const scrollTimer = window.setTimeout(() => {
      const selectedRow = mobileWorkoutPickerRefs.current.get(selectedWorkoutName);
      selectedRow?.scrollIntoView({ block: "center" });
    }, 0);

    return () => window.clearTimeout(scrollTimer);
  }, [showMobileWorkoutPicker, selectedWorkoutName]);

  const handleExplorerPreferenceToggle = React.useCallback((sectionKey, optionKey) => {
    setExplorerPreferencesDraft((currentPreferences) => ({
      ...currentPreferences,
      [sectionKey]: {
        ...currentPreferences[sectionKey],
        [optionKey]: !currentPreferences[sectionKey][optionKey],
      },
    }));
  }, []);

  const handleSaveExplorerPreferences = React.useCallback(async () => {
    if (!selectedWorkoutTemplate) {
      return;
    }

    setIsSavingExplorerPreferences(true);

    try {
      const response = await fetch(`/api/workout-templates/${selectedWorkoutTemplate.id}/explorer-preferences`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(explorerPreferencesDraft),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        alert(body?.msg || 'Failed to save exercise explorer settings');
        return;
      }

      setTemplates((currentTemplates) =>
        currentTemplates.map((template) =>
          template.id === body.id ? body : template
        )
      );
      setShowExplorerEditModal(false);
    } catch (err) {
      console.error('Error saving exercise explorer settings:', err);
      alert('Failed to save exercise explorer settings');
    } finally {
      setIsSavingExplorerPreferences(false);
    }
  }, [explorerPreferencesDraft, selectedWorkoutTemplate]);

  const commitExplorerDragOrder = React.useCallback((sectionKey, draggedKey, targetIndex, sourceOrderKeys = []) => {
    if (!draggedKey || !Number.isFinite(targetIndex)) {
      return;
    }

    setExplorerPreferencesDraft((currentPreferences) => {
      const orderKey = getExplorerOrderKey(sectionKey);
      const sectionOptionKeys = getExplorerSectionOptionKeys(sectionKey, selectedWorkoutStats);
      const fallbackOrder = applyExplorerKeyOrder(sectionOptionKeys, currentPreferences[orderKey]);
      const sourceOrder = Array.isArray(sourceOrderKeys) && sourceOrderKeys.length > 0
        ? sourceOrderKeys.filter((key) => sectionOptionKeys.includes(key))
        : [];
      const currentOrder = sourceOrder.length > 0
        ? [
            ...sourceOrder,
            ...fallbackOrder.filter((key) => !sourceOrder.includes(key)),
          ]
        : fallbackOrder;
      const nextOrder = moveExplorerKeyToIndex(currentOrder, draggedKey, targetIndex);

      if (nextOrder === currentOrder || arraysEqual(nextOrder, fallbackOrder)) {
        return currentPreferences;
      }

      return {
        ...currentPreferences,
        [orderKey]: nextOrder,
      };
    });
  }, [selectedWorkoutStats]);

  const setExplorerCardRef = React.useCallback((sectionKey, optionKey, element) => {
    const mapKey = `${sectionKey}:${optionKey}`;

    if (element) {
      explorerCardRefs.current.set(mapKey, element);
    } else {
      explorerCardRefs.current.delete(mapKey);
    }
  }, []);

  const getExplorerOrderedOptions = React.useCallback((sectionKey) => {
    const section = explorerEditSections.find((item) => item.key === sectionKey);
    if (!section) {
      return [];
    }

    return applyExplorerOrder(section.options, explorerPreferencesDraft[getExplorerOrderKey(sectionKey)]);
  }, [explorerEditSections, explorerPreferencesDraft]);

  const beginExplorerDrag = React.useCallback((event, sectionKey, option) => {
    event.preventDefault();
    event.stopPropagation();

    event.currentTarget.setPointerCapture?.(event.pointerId);

    const cardElement = explorerCardRefs.current.get(`${sectionKey}:${option.key}`);
    if (!cardElement) {
      return;
    }

    const rect = cardElement.getBoundingClientRect();
    const orderedOptions = getExplorerOrderedOptions(sectionKey);
    const sourceIndex = orderedOptions.findIndex((item) => item.key === option.key);
    const slotRects = orderedOptions.map((orderedOption, index) => {
      const element = explorerCardRefs.current.get(`${sectionKey}:${orderedOption.key}`);
      const optionRect = element?.getBoundingClientRect();

      return optionRect
        ? {
            index,
            key: orderedOption.key,
            left: optionRect.left,
            right: optionRect.right,
            top: optionRect.top,
            bottom: optionRect.bottom,
            centerX: optionRect.left + optionRect.width / 2,
            centerY: optionRect.top + optionRect.height / 2,
          }
        : null;
    }).filter(Boolean);

    const nextDragState = {
      sectionKey,
      key: option.key,
      label: option.label,
      option,
      width: rect.width,
      height: rect.height,
      sourceOrderKeys: orderedOptions.map((orderedOption) => orderedOption.key),
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      clientX: event.clientX,
      clientY: event.clientY,
      sourceIndex,
      targetIndex: sourceIndex,
      slotRects,
    };

    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  }, [getExplorerOrderedOptions]);

  React.useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  React.useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const currentDragState = dragStateRef.current;
      if (!currentDragState) {
        return;
      }

      event.preventDefault();

      const nextClientX = event.clientX;
      const nextClientY = event.clientY;
      const nextTargetIndex = getExplorerDragTargetIndex(
        currentDragState.slotRects,
        nextClientX,
        nextClientY
      );

      const nextDragState = {
        ...currentDragState,
        clientX: nextClientX,
        clientY: nextClientY,
        targetIndex: nextTargetIndex,
      };

      dragStateRef.current = nextDragState;
      setDragState(nextDragState);
    };

    const handlePointerUp = (event) => {
      const currentDragState = dragStateRef.current;
      if (currentDragState) {
        const finalTargetIndex = Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)
          ? getExplorerDragTargetIndex(
              currentDragState.slotRects,
              event.clientX,
              event.clientY
            )
          : currentDragState.targetIndex;

        commitExplorerDragOrder(
          currentDragState.sectionKey,
          currentDragState.key,
          finalTargetIndex,
          currentDragState.sourceOrderKeys
        );
      }

      setDragState(null);
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [!!dragState, commitExplorerDragOrder]);

  React.useLayoutEffect(() => {
    if (!showExplorerEditModal || dragState) {
      previousExplorerCardPositions.current = new Map();
      return;
    }

    const nextPositions = new Map();

    explorerCardRefs.current.forEach((element, key) => {
      if (!element?.isConnected) {
        return;
      }

      const rect = element.getBoundingClientRect();
      nextPositions.set(key, rect);

      const previousRect = previousExplorerCardPositions.current.get(key);
      if (!previousRect) {
        return;
      }

      if (dragState && key === `${dragState.sectionKey}:${dragState.key}`) {
        return;
      }

      const deltaX = previousRect.left - rect.left;
      const deltaY = previousRect.top - rect.top;

      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        return;
      }

      element.getAnimations?.().forEach((animation) => animation.cancel());
      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0px, 0px)" },
        ],
        {
          duration: 180,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        }
      );
    });

    previousExplorerCardPositions.current = nextPositions;
  }, [explorerPreferencesDraft, showExplorerEditModal, dragState]);

  React.useEffect(() => {
    if (!showExplorerEditModal) {
      return undefined;
    }

    const modalElement = explorerModalRef.current;
    if (!modalElement) {
      return undefined;
    }

    const resetExplorerPositionCache = () => {
      previousExplorerCardPositions.current = new Map();
    };

    modalElement.addEventListener("scroll", resetExplorerPositionCache, { passive: true });
    window.addEventListener("scroll", resetExplorerPositionCache, { passive: true, capture: true });

    return () => {
      modalElement.removeEventListener("scroll", resetExplorerPositionCache);
      window.removeEventListener("scroll", resetExplorerPositionCache, { capture: true });
    };
  }, [showExplorerEditModal]);

  return (
    <main>
      <div className="main-formatting profile-layout">
        {isLoading ? (
          <section className="profile-loading-state" aria-live="polite">
            <div className="profile-loading-hero">
              <p className="profile-kicker">Analytics</p>
              <h2>Loading your dashboard...</h2>
              <p className="panel-muted">Crunching your session trends.</p>
            </div>
            <div className="profile-loading-grid">
              <div className="profile-loading-card profile-loading-card-wide" />
              <div className="profile-loading-card" />
              <div className="profile-loading-card" />
              <div className="profile-loading-card" />
            </div>
          </section>
        ) : (
          <>
        <section className="profile-hero">
          <div>
            <p className="profile-kicker">Analytics</p>
            <h2>{profileIdentity.displayName}</h2>
          </div>
          <div className="profile-meta-grid">
            <div className="profile-meta-card">
              <span>Member Since</span>
              <strong>{profileIdentity.memberSince}</strong>
            </div>
            <div className="profile-meta-card">
               <span>Last Session</span>
              <strong>{profileIdentity.lastWorkout}</strong>
            </div>
            <div className="profile-meta-card">
               <span>Favorite Exercise</span>
              <strong>{profileIdentity.favoriteWorkout}</strong>
            </div>
          </div>
        </section>

        <section className="profile-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Weekly Snapshot</p>
              <h3>This Week</h3>
            </div>
            <p className="panel-muted">{weeklySnapshot.shortWeekRange}</p>
          </div>
          <div className="metric-grid">
            <MetricCard label="Sessions This Week" value={weeklySnapshot.workoutsThisWeek} />
            <MetricCard label="Sets This Week" value={weeklySnapshot.setsThisWeek} />
            <MetricCard label="Active Days" value={weeklySnapshot.activeDaysThisWeek} />
            <MetricCard label="Favorite Exercise" value={profileIdentity.favoriteWorkout} accent />
          </div>
        </section>

        <section className="profile-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Consistency</p>
              <h3>Consistency</h3>
            </div>
            <p className="panel-muted">26 weeks</p>
          </div>

          <div className="metric-grid">
            <MetricCard label="Current Streak" value={`${consistencyStats.currentStreak} week${consistencyStats.currentStreak === 1 ? "" : "s"}`} />
            <MetricCard label="Longest Streak" value={`${consistencyStats.longestStreak} week${consistencyStats.longestStreak === 1 ? "" : "s"}`} />
            <MetricCard label="Training Days" value={consistencyStats.totalWorkoutDays} />
            <MetricCard label="Average / Week" value={consistencyStats.averageWorkoutDaysPerWeek} accent />
          </div>

          <div className="consistency-layout">
            <TrendCard title="Heatmap" subtitle="Daily training">
              <CalendarHeatmap weeks={consistencyStats.heatmapWeeks} />
            </TrendCard>
            <TrendCard title="Weekly Frequency" subtitle="Last 12 weeks">
              <BarTrendChart points={consistencyStats.weeklyFrequency} scrollable defaultToEnd />
            </TrendCard>
          </div>
        </section>

        <section
          className="profile-panel workout-focus-panel"
          style={{ "--selected-workout-color": selectedWorkoutColor }}
        >
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Exercise Explorer</p>
              <h3>One Exercise At A Time</h3>
            </div>
          </div>

          <div className="workout-focus-layout">
            <div className="workout-focus-card workout-focus-list-card">
              <div className="workout-focus-toolbar">
                <div className="trend-card-header">
                  <h4>Exercises</h4>
                  <p>{workoutExplorerItems.length} tracked</p>
                </div>
                <label className="workout-page-size">
                  Per page
                  <Dropdown
                    value={workoutPageSize}
                    onChange={setWorkoutPageSize}
                    options={[
                      { value: "5", label: "5" },
                      { value: "10", label: "10" },
                      { value: "20", label: "20" },
                    ]}
                     ariaLabel="Exercises per page"
                  />
                </label>
              </div>

              {visibleWorkoutItems.length > 0 ? (
                <div className="breakdown-workout-list">
                  {visibleWorkoutItems.map((workout) => (
                    <WorkoutExplorerPickerRow
                      key={workout.name}
                      workout={workout}
                      active={workout.name === selectedWorkoutName}
                      onSelect={() => setSelectedWorkoutName(workout.name)}
                    />
                  ))}
                </div>
              ) : (
                <p className="panel-empty">No sessions logged yet.</p>
              )}

              <div className="workout-pagination">
                <button
                  type="button"
                  className="workout-pagination-button"
                  onClick={() => setWorkoutPage((currentPage) => Math.max(1, currentPage - 1))}
                  disabled={activeWorkoutPage <= 1}
                >
                  Previous
                </button>
                <span className="workout-pagination-status">
                  Page {activeWorkoutPage} of {totalWorkoutPages}
                </span>
                <button
                  type="button"
                  className="workout-pagination-button"
                  onClick={() => setWorkoutPage((currentPage) => Math.min(totalWorkoutPages, currentPage + 1))}
                  disabled={activeWorkoutPage >= totalWorkoutPages}
                >
                  Next
                </button>
              </div>
            </div>

            <div className="workout-focus-details">
              <div className="workout-focus-card workout-focus-detail-card">
                <div className="panel-header workout-focus-detail-header">
                  <div>
                    <p className="panel-kicker">Selected Exercise</p>
                    <h3>{selectedWorkoutName || "Choose an exercise"}</h3>
                    {selectedWorkoutExplorerItem ? (
                      <div className="mobile-workout-picker-trigger">
                        <WorkoutExplorerPickerRow
                          workout={selectedWorkoutExplorerItem}
                          active
                          onSelect={() => setShowMobileWorkoutPicker(true)}
                          hideRank
                          rightLabel={selectedWorkoutGroupLabel}
                          rightLabelColor={selectedWorkoutColor}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="mobile-workout-picker-trigger mobile-workout-picker-empty-trigger"
                        onClick={() => setShowMobileWorkoutPicker(true)}
                      >
                        Choose an exercise
                      </button>
                    )}
                  </div>
                  <label className="workout-select">
                    Exercise
                    <Dropdown
                      value={selectedWorkoutName}
                      onChange={setSelectedWorkoutName}
                      searchable
                      searchPlaceholder="Search exercises"
                      options={workoutNames.map((name) => ({
                        value: name,
                        label: name,
                        color: getWorkoutColorByName(analyticsWorkouts, name),
                        ...buildWorkoutGroupBadge(getWorkoutColorByName(analyticsWorkouts, name), workoutColorPreferences),
                      }))}
                      ariaLabel="Analytics exercise selector"
                    />
                  </label>
                </div>

                {selectedWorkoutStats ? (
                  <>
                    <div className="metric-grid">
                      {visibleStatCards.map((card) => (
                        <MetricCard
                          key={card.key}
                          label={card.label}
                          value={card.value}
                          accent={card.accent}
                          onClick={card.onClick}
                        />
                      ))}
                    </div>

                    <WorkoutAveragesTable
                      workoutName={selectedWorkoutName}
                      metrics={visibleAverageMetrics}
                    />

                    <div className="trend-grid">
                      {visibleCharts.map((chart) => (
                        <TrendCard
                          key={chart.key}
                          title={chart.title}
                          subtitle={chart.subtitle}
                        >
                          {chart.type === "line" ? (
                            <LineTrendChart
                              points={chart.points}
                              yTickFormatter={chart.yTickFormatter}
                              tickMode={chart.tickMode}
                              startAtZero={chart.startAtZero}
                              onPointClick={(workoutId) => setSessionFocusRequest({
                                workoutId,
                                token: Date.now(),
                              })}
                            />
                          ) : (
                            <BarTrendChart points={chart.points} />
                          )}
                        </TrendCard>
                      ))}
                    </div>
                    {selectedWorkoutTemplate ? (
                      <div className="workout-explorer-actions">
                        <button
                          type="button"
                          className="workout-explorer-edit-button"
                          onClick={openExplorerEditModal}
                        >
                          <span aria-hidden="true">✎</span>
                          Customize {selectedWorkoutTemplate.name}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="panel-empty">Select an exercise to see trends and stats.</p>
                )}
              </div>
            </div>
          </div>
          <div className="workout-focus-history-row">
            <div className="workout-focus-card workout-focus-history-card">
              <div className="panel-header workout-focus-history-header">
                <div>
                  <p className="panel-kicker">Sessions</p>
                  <h3>{selectedWorkoutName || "Exercise Sessions"}</h3>
                </div>
                <p className="panel-muted">
                  {selectedWorkoutSessions.length} session{selectedWorkoutSessions.length === 1 ? "" : "s"}
                </p>
              </div>
              {selectedWorkoutName ? (
                <WorkoutHistoryPreview
                  workouts={selectedWorkoutSessions}
                  emptyMessage="No sessions logged for this exercise yet."
                  focusRequest={sessionFocusRequest}
                  openMenuId={openSessionMenuId}
                  onToggleWorkoutMenu={toggleSessionMenu}
                  onOpenEditModal={openSessionEditModal}
                  onSeparateWorkout={handleSeparateSession}
                  onDeleteWorkout={handleDeleteSession}
                />
              ) : (
                <p className="panel-empty">Select an exercise to see its sessions.</p>
              )}
            </div>
          </div>
        </section>

          {editingSession && draftSession && (
            <div className="history-modal-backdrop" role="presentation">
              <div className="history-modal" role="dialog" aria-modal="true" aria-labelledby="analytics-edit-session-title">
                <button type="button" className="history-close-button is-icon" onClick={closeSessionEditModal} aria-label="Close session editor">
                  &times;
                </button>
                <div className="history-modal-header">
                  <div>
                    <p className="history-modal-eyebrow">Edit Session</p>
                    <h2 id="analytics-edit-session-title">
                      {draftSession.isMixed ? "Full Workout" : (draftSession.templateName || draftSession.exercise)}
                    </h2>
                  </div>
                  <div className="modal-header-actions">
                    <button type="submit" form="analytics-session-form" className="btn btn-primary">
                      Save
                    </button>
                  </div>
                </div>

                <form id="analytics-session-form" className="history-modal-form" onSubmit={handleSaveSession}>
                  <label>
                    Date
                    <input
                      type="date"
                      value={draftSession.date}
                      onChange={(event) => handleDraftSessionFieldChange("date", event.target.value)}
                      required
                    />
                  </label>

                  <label>
                    Notes
                    <textarea
                      rows="3"
                      value={draftSession.notes}
                      onChange={(event) => handleDraftSessionFieldChange("notes", event.target.value)}
                    />
                  </label>

                  <label className="history-starred-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(draftSession.starred)}
                      onChange={(event) => handleDraftSessionFieldChange("starred", event.target.checked)}
                    />
                    <span>Star this session</span>
                  </label>

                  <section className="history-modal-panel">
                    <div className="history-modal-panel-header">
                      <h3>Sets</h3>
                      <button type="button" className="btn btn-outline-light btn-sm" onClick={handleDraftSessionAddSet}>
                        + Add Set
                      </button>
                    </div>

                    {draftSession.sets.length > 0 ? (
                      <div className="history-edit-sets">
                        {draftSession.sets.map((set) => (
                          <div key={set.id} className="history-edit-set-card">
                            <div className="history-edit-set-header">
                              <span>{getSetDisplayLabel(set, draftSession.sets, draftSession.sets.findIndex((currentSet) => currentSet.id === set.id))}</span>
                              <button
                                type="button"
                                className="history-delete-set-button"
                                onClick={() => handleDraftSessionDeleteSet(set.id)}
                              >
                                Delete
                              </button>
                            </div>
                            <div className="history-edit-set-grid">
                              {draftSession.isMixed && (
                                <label>
                                  Exercise
                                  <Dropdown
                                    value={set.templateId || ""}
                                    onChange={(nextValue) => handleDraftSessionSetChange(set.id, "templateId", nextValue)}
                                    searchable
                                    searchPlaceholder="Search exercises"
                                    options={workoutTemplateOptions}
                                    ariaLabel={`Set ${set.id} exercise`}
                                  />
                                </label>
                              )}
                              <label>
                                Set type
                                <Dropdown
                                  value={set.setType || "regular"}
                                  onChange={(nextValue) => handleDraftSessionSetChange(set.id, "setType", nextValue)}
                                  options={setTypeOptions}
                                  ariaLabel={`Set ${set.id} type`}
                                />
                              </label>
                              {getAnalyticsVisibleFields(draftSession, set).map((field) => (
                                <label key={field.key}>
                                  {getAnalyticsFieldLabel(field, getAnalyticsWorkoutMeasurements(draftSession, set))}
                                  <div className="input-with-unit">
                                    <input
                                      type={field.inputType || "text"}
                                      value={set[field.key] ?? ""}
                                      placeholder={field.placeholder || ""}
                                      onChange={(event) => handleDraftSessionSetChange(set.id, field.key, event.target.value)}
                                    />
                                    {getAnalyticsFieldUnitSuffix(field, getAnalyticsWorkoutMeasurements(draftSession, set)) && (
                                      <span className="input-unit">
                                        {getAnalyticsFieldUnitSuffix(field, getAnalyticsWorkoutMeasurements(draftSession, set))}
                                      </span>
                                    )}
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="history-empty-edit-message">
                        No sets yet.
                      </p>
                    )}
                  </section>

                  <div className="history-modal-actions">
                    <button type="button" className="history-close-button" onClick={closeSessionEditModal} aria-label="Close session editor">
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

          {showExplorerEditModal && selectedWorkoutTemplate && typeof document !== "undefined"
            ? createPortal(
            <div className="explorer-modal-backdrop" onClick={() => setShowExplorerEditModal(false)}>
              <div
                className="explorer-modal"
                ref={explorerModalRef}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="explorer-modal-header">
                  <div>
                    <p className="panel-kicker">Exercise Explorer</p>
                    <h3>Customize {selectedWorkoutTemplate.name}</h3>
                  </div>
                  <button
                    type="button"
                    className="explorer-modal-close"
                    onClick={() => setShowExplorerEditModal(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="explorer-modal-sections">
                  {explorerEditSections.map((section) => (
                    <section key={section.key} className="explorer-modal-section">
                      <div className="trend-card-header">
                        <h4>{section.title}</h4>
                        <p>{section.subtitle}</p>
                      </div>
                      <div className="explorer-toggle-grid">
                        {getExplorerDisplayOptions(
                          applyExplorerOrder(section.options, explorerPreferencesDraft[getExplorerOrderKey(section.key)]),
                          dragState,
                          section.key
                        ).map((option) => (
                          <ExplorerPreferenceCard
                            key={option.key}
                            cardRef={(element) => setExplorerCardRef(section.key, option.key, element)}
                            label={option.label}
                            active={explorerPreferencesDraft[section.key][option.key]}
                            onClick={() => handleExplorerPreferenceToggle(section.key, option.key)}
                            onHandlePointerDown={(event) => beginExplorerDrag(event, section.key, option)}
                            isDragging={dragState?.sectionKey === section.key && dragState?.key === option.key}
                          >
                            {renderExplorerOptionPreview(option)}
                          </ExplorerPreferenceCard>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

                <div className="explorer-modal-actions">
                  <button
                    type="button"
                    className="btn btn-outline-light"
                    onClick={() => setShowExplorerEditModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveExplorerPreferences}
                    disabled={isSavingExplorerPreferences}
                  >
                    {isSavingExplorerPreferences ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
          : null}

          {showMobileWorkoutPicker && typeof document !== "undefined"
            ? createPortal(
              <div
                className="mobile-workout-picker-backdrop"
                style={{ "--selected-workout-color": selectedWorkoutColor }}
                onClick={() => setShowMobileWorkoutPicker(false)}
              >
                <div className="mobile-workout-picker-modal" onClick={(event) => event.stopPropagation()}>
                  <div className="mobile-workout-picker-header">
                    <div>
                      <p className="panel-kicker">Exercise Explorer</p>
                      <h3>Choose Exercise</h3>
                    </div>
                    <button
                      type="button"
                      className="explorer-modal-close"
                      onClick={() => setShowMobileWorkoutPicker(false)}
                      aria-label="Close exercise picker"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mobile-workout-picker-list">
                    {workoutExplorerItems.length > 0 ? (
                      workoutExplorerItems.map((workout) => (
                        <WorkoutExplorerPickerRow
                          key={workout.name}
                          workout={workout}
                          active={workout.name === selectedWorkoutName}
                          onSelect={() => selectExplorerWorkout(workout.name)}
                          rowRef={(element) => {
                            if (element) {
                              mobileWorkoutPickerRefs.current.set(workout.name, element);
                            } else {
                              mobileWorkoutPickerRefs.current.delete(workout.name);
                            }
                          }}
                        />
                      ))
                    ) : (
                      <p className="panel-empty">No sessions logged yet.</p>
                    )}
                  </div>
                </div>
              </div>,
              document.body
            )
            : null}

          {showExplorerEditModal && dragState
            ? createPortal(
              <div
                className="explorer-drag-preview"
                style={{
                  width: `${dragState.width}px`,
                  left: `${dragState.clientX - dragState.offsetX}px`,
                  top: `${dragState.clientY - dragState.offsetY}px`,
                }}
              >
                <ExplorerPreferenceCard
                  label={dragState.option.label}
                  active={explorerPreferencesDraft[dragState.sectionKey][dragState.option.key]}
                  isDragging
                  isGhost
                >
                  {renderExplorerOptionPreview(dragState.option)}
                </ExplorerPreferenceCard>
              </div>,
              document.body
            )
            : null}

          </>
        )}
      </div>
    </main>
  );
}

function MetricCard({ label, value, accent = false, onClick = undefined }) {
  const className = [
    accent ? "metric-card metric-card-accent" : "metric-card",
    onClick ? "is-clickable" : "",
  ].filter(Boolean).join(" ");

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        <span>{label}</span>
        <strong>{value}</strong>
      </button>
    );
  }

  return (
    <div className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TrendCard({ title, subtitle, children }) {
  return (
    <div className="trend-card">
      <div className="trend-card-header">
        <h4>{title}</h4>
        <p>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function WorkoutAveragesTable({ workoutName, metrics }) {
  if (!metrics || metrics.length === 0) {
    return null;
  }

  return (
    <div className="workout-averages-card">
      <div className="trend-card-header">
        <h4>Averages</h4>
        <p>Session and set-level benchmarks for {workoutName}.</p>
      </div>
        <div className="workout-averages-table" role="table" aria-label="Exercise averages">
          {metrics.map((metric) => (
          <div key={metric.key || metric.label} className="workout-averages-row" role="row">
            <span className="workout-averages-label" role="cell">{metric.label}</span>
            <strong className="workout-averages-value" role="cell">{metric.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkoutExplorerPickerRow({
  workout,
  active,
  onSelect,
  rowRef = undefined,
  hideRank = false,
  rightLabel = undefined,
  rightLabelColor = undefined,
}) {
  const hasRightLabel = rightLabel !== undefined && rightLabel !== "";

  return (
    <button
      ref={rowRef}
      type="button"
      className={[
        active ? "breakdown-workout-row active" : "breakdown-workout-row",
        hideRank ? "without-rank" : "",
      ].filter(Boolean).join(" ")}
      onClick={onSelect}
    >
      {hideRank ? null : <span className="breakdown-workout-rank">{workout.rank}</span>}
      <span className="breakdown-workout-copy">
        <strong>
          <span
            className="breakdown-workout-dot"
            style={{ backgroundColor: workout.color || getWorkoutColor(workout.name) }}
            aria-hidden="true"
          />
          {workout.name}
        </strong>
        <span>{workout.count} sessions</span>
      </span>
      {rightLabel !== undefined ? (
        hasRightLabel ? (
          <span
            className="qs-dropdown-badge workout-picker-group-badge"
            style={rightLabelColor ? { "--qs-badge-color": rightLabelColor } : undefined}
          >
            {rightLabel}
          </span>
        ) : null
      ) : (
        <span className="breakdown-workout-share">{workout.share}%</span>
      )}
    </button>
  );
}

function ExplorerMetricPreview({ label, value, accent = false }) {
  return (
    <div className={accent ? "explorer-metric-preview explorer-metric-preview-accent" : "explorer-metric-preview"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ExplorerAveragePreview({ value }) {
  return (
    <div className="explorer-average-preview">
      <strong>{value}</strong>
    </div>
  );
}

function normalizeExplorerPreferences(preferences, stats = null) {
  const defaultPreferences = buildDefaultExplorerPreferences(stats);
  return {
    statCards: {
      ...defaultPreferences.statCards,
      ...(preferences?.statCards || {}),
    },
    averages: {
      ...defaultPreferences.averages,
      ...(preferences?.averages || {}),
    },
    charts: {
      ...defaultPreferences.charts,
      ...(preferences?.charts || {}),
    },
    statCardOrder: normalizeExplorerOrder(preferences?.statCardOrder),
    averageOrder: normalizeExplorerOrder(preferences?.averageOrder),
    chartOrder: normalizeExplorerOrder(preferences?.chartOrder),
  };
}

function normalizeExplorerOrder(order) {
  if (!Array.isArray(order)) {
    return [];
  }

  const seen = new Set();
  return order.filter((key) => {
    if (typeof key !== "string" || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildDefaultExplorerPreferences(stats) {
  const defaults = {
    statCards: {
      ...defaultExplorerPreferences.statCards,
      bestWeight: false,
      highestReps: false,
      farthestDistance: false,
      longestDuration: false,
      shortestDuration: false,
      bestPace: false,
      estimatedOneRepMax: false,
    },
    averages: {
      ...defaultExplorerPreferences.averages,
    },
    charts: {
      ...defaultExplorerPreferences.charts,
      estimatedOneRepMaxTrend: false,
    },
  };

  if (!stats) {
    return defaults;
  }

  const fields = stats.fields || {};

  if (fields.weight) {
    defaults.statCards.bestWeight = true;
  }

  if (fields.reps) {
    defaults.statCards.highestReps = true;
  }

  if (fields.weight && fields.reps) {
    defaults.statCards.estimatedOneRepMax = true;
    defaults.charts.estimatedOneRepMaxTrend = true;
  }

  if (fields.distance) {
    defaults.statCards.farthestDistance = true;
  }

  if (fields.duration && !fields.weight && !fields.distance) {
    defaults.statCards.shortestDuration = true;
  }

  if (fields.distance && fields.duration) {
    defaults.statCards.bestPace = true;
  }

  return defaults;
}

function buildSelectedWorkoutStatCards(stats, preferences, onFocusWorkout) {
  if (!stats) {
    return [];
  }

  return applyExplorerOrder((stats.availableStatCards || []), preferences.statCardOrder)
    .filter((card) => preferences.statCards[card.key] !== false)
    .map((card) => ({
      ...card,
      onClick: card.workoutId ? () => onFocusWorkout(card.workoutId) : undefined,
    }));
}

function buildVisibleAverageMetrics(metrics, preferences) {
  if (!metrics || metrics.length === 0) {
    return [];
  }

  return applyExplorerOrder(metrics, preferences.averageOrder)
    .filter((metric) => preferences.averages[metric.key] !== false);
}

function buildSelectedWorkoutCharts(stats, preferences) {
  if (!stats) {
    return [];
  }

  if ((stats.sessionsLogged || 0) < 2) {
    return [];
  }

  const charts = [];

  if (preferences.charts.performanceTrend) {
    charts.push({
      key: "performanceTrend",
      type: "line",
      title: stats.performanceTrend.title,
      subtitle: stats.performanceTrend.shortSubtitle || stats.performanceTrend.subtitle,
      points: stats.performanceTrend.points,
      yTickFormatter: stats.performanceTrend.yTickFormatter,
      tickMode: stats.performanceTrend.tickMode,
      startAtZero: stats.performanceTrend.startAtZero,
    });
  }

  if (preferences.charts.estimatedOneRepMaxTrend && stats.estimatedOneRepMaxTrend?.points?.length) {
    charts.push({
      key: "estimatedOneRepMaxTrend",
      type: "line",
      title: stats.estimatedOneRepMaxTrend.title,
      subtitle: stats.estimatedOneRepMaxTrend.shortSubtitle || stats.estimatedOneRepMaxTrend.subtitle,
      points: stats.estimatedOneRepMaxTrend.points,
      yTickFormatter: stats.estimatedOneRepMaxTrend.yTickFormatter,
      tickMode: stats.estimatedOneRepMaxTrend.tickMode,
      startAtZero: stats.estimatedOneRepMaxTrend.startAtZero,
    });
  }

  if (preferences.charts.setVolumeTrend) {
    charts.push({
      key: "setVolumeTrend",
      type: "bar",
      title: "Set Volume Trend",
      subtitle: "Last 12 sessions",
      points: stats.setVolumeTrend,
    });
  }

  if (preferences.charts.monthlyFrequency) {
    charts.push({
      key: "monthlyFrequency",
      type: "bar",
      title: "Monthly Frequency",
      subtitle: "Recent months",
      points: stats.monthlyFrequency,
    });
  }

  return applyExplorerOrder(charts, preferences.chartOrder);
}

function buildExplorerEditSections(stats) {
  if (!stats) {
    return [];
  }

  const sections = [];
  const statOptions = (stats.availableStatCards || []).map((card) => ({
    key: card.key,
    label: card.label,
    preview: {
      type: "metric",
      label: card.label,
      value: card.value,
      accent: card.accent,
    },
  }));
  const averageOptions = [];
  const chartOptions = [];
  const chartsUnavailable = (stats.sessionsLogged || 0) < 2;

  averageOptions.push(...(stats.averageMetrics || []).map((metric) => ({
    key: metric.key,
    label: metric.label,
    preview: {
      type: "average",
      value: metric.value,
    },
  })));

  if (stats.performanceTrend?.points?.length) {
    chartOptions.push({
      key: "performanceTrend",
      label: stats.performanceTrend.title,
      preview: {
        type: chartsUnavailable ? "emptyChart" : "lineChart",
        message: "NOT ENOUGH DATA",
        points: stats.performanceTrend.points,
        yTickFormatter: stats.performanceTrend.yTickFormatter,
        tickMode: stats.performanceTrend.tickMode,
        startAtZero: stats.performanceTrend.startAtZero,
      },
    });
  }

  if (stats.estimatedOneRepMaxTrend?.points?.length) {
    chartOptions.push({
      key: "estimatedOneRepMaxTrend",
      label: stats.estimatedOneRepMaxTrend.title,
      preview: {
        type: chartsUnavailable ? "emptyChart" : "lineChart",
        message: "NOT ENOUGH DATA",
        points: stats.estimatedOneRepMaxTrend.points,
        yTickFormatter: stats.estimatedOneRepMaxTrend.yTickFormatter,
        tickMode: stats.estimatedOneRepMaxTrend.tickMode,
        startAtZero: stats.estimatedOneRepMaxTrend.startAtZero,
      },
    });
  }

  chartOptions.push({
    key: "setVolumeTrend",
    label: "Set Volume Trend",
    preview: {
      type: chartsUnavailable ? "emptyChart" : "barChart",
      message: "NOT ENOUGH DATA",
      points: stats.setVolumeTrend,
    },
  });
  chartOptions.push({
    key: "monthlyFrequency",
    label: "Monthly Frequency",
    preview: {
      type: chartsUnavailable ? "emptyChart" : "barChart",
      message: "NOT ENOUGH DATA",
      points: stats.monthlyFrequency,
    },
  });

  sections.push(
    {
      key: "statCards",
      title: "Stat Cards",
      subtitle: "Choose which quick-hit cards appear at the top.",
      options: statOptions,
    },
    {
      key: "averages",
      title: "Averages",
      subtitle: "Show or hide the session and set-level averages table rows.",
      options: averageOptions,
    },
    {
      key: "charts",
      title: "Charts",
      subtitle: "Control which trend charts show up for this workout.",
      options: chartOptions,
    },
  );

  return sections.filter((section) => section.options.length > 0);
}

function getExplorerOrderKey(sectionKey) {
  if (sectionKey === "statCards") {
    return "statCardOrder";
  }

  if (sectionKey === "averages") {
    return "averageOrder";
  }

  return "chartOrder";
}

function getExplorerSectionOptionKeys(sectionKey, stats) {
  if (!stats) {
    return [];
  }

  if (sectionKey === "statCards") {
    return (stats.availableStatCards || []).map((card) => card.key);
  }

  if (sectionKey === "averages") {
    return (stats.averageMetrics || []).map((metric) => metric.key);
  }

  const keys = [];
  if (stats.performanceTrend?.points?.length) {
    keys.push("performanceTrend");
  }
  if (stats.estimatedOneRepMaxTrend?.points?.length) {
    keys.push("estimatedOneRepMaxTrend");
  }
  keys.push("setVolumeTrend", "monthlyFrequency");
  return keys;
}

function applyExplorerOrder(items, order) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const itemMap = new Map(items.map((item) => [item.key, item]));
  const orderedItems = [];
  const seen = new Set();

  (Array.isArray(order) ? order : []).forEach((key) => {
    const item = itemMap.get(key);
    if (!item || seen.has(key)) {
      return;
    }
    orderedItems.push(item);
    seen.add(key);
  });

  items.forEach((item) => {
    if (!seen.has(item.key)) {
      orderedItems.push(item);
    }
  });

  return orderedItems;
}

function applyExplorerKeyOrder(keys, order) {
  if (!Array.isArray(keys) || keys.length === 0) {
    return [];
  }

  const allowedKeys = new Set(keys);
  const orderedKeys = [];
  const seen = new Set();

  (Array.isArray(order) ? order : []).forEach((key) => {
    if (!allowedKeys.has(key) || seen.has(key)) {
      return;
    }

    orderedKeys.push(key);
    seen.add(key);
  });

  keys.forEach((key) => {
    if (!seen.has(key)) {
      orderedKeys.push(key);
    }
  });

  return orderedKeys;
}

function getExplorerDisplayOptions(options, dragState, sectionKey) {
  if (!dragState || dragState.sectionKey !== sectionKey) {
    return options;
  }

  return moveExplorerOptionToIndex(options, dragState.key, dragState.targetIndex);
}

function moveExplorerOptionToIndex(items, optionKey, targetIndex) {
  const currentIndex = items.findIndex((item) => item.key === optionKey);
  if (currentIndex < 0) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(currentIndex, 1);
  const normalizedTargetIndex = Math.max(0, Math.min(targetIndex, nextItems.length));
  nextItems.splice(normalizedTargetIndex, 0, movedItem);
  return nextItems;
}

function moveExplorerKeyToIndex(keys, optionKey, targetIndex) {
  const currentIndex = keys.indexOf(optionKey);
  if (currentIndex < 0) {
    return keys;
  }

  const nextKeys = [...keys];
  const [movedKey] = nextKeys.splice(currentIndex, 1);
  const normalizedTargetIndex = Math.max(0, Math.min(targetIndex, nextKeys.length));
  nextKeys.splice(normalizedTargetIndex, 0, movedKey);
  return nextKeys;
}

function arraysEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function getExplorerDragTargetIndex(slotRects, clientX, clientY) {
  if (!Array.isArray(slotRects) || slotRects.length === 0) {
    return 0;
  }

  const containingSlot = slotRects.find((slot) =>
    clientX >= slot.left
    && clientX <= slot.right
    && clientY >= slot.top
    && clientY <= slot.bottom
  );

  if (containingSlot) {
    return containingSlot.index;
  }

  return slotRects.reduce((closestSlot, slot) => {
    const slotDistance = Math.hypot(slot.centerX - clientX, slot.centerY - clientY);
    const closestDistance = Math.hypot(closestSlot.centerX - clientX, closestSlot.centerY - clientY);
    return slotDistance < closestDistance ? slot : closestSlot;
  }, slotRects[0]).index;
}

function renderExplorerOptionPreview(option) {
  if (!option.preview) {
    return null;
  }

  if (option.preview.type === "metric") {
    return (
      <ExplorerMetricPreview
        label={option.preview.label}
        value={option.preview.value}
        accent={option.preview.accent}
      />
    );
  }

  if (option.preview.type === "average") {
    return <ExplorerAveragePreview value={option.preview.value} />;
  }

  if (option.preview.type === "lineChart") {
    return (
      <div className="explorer-chart-preview">
        <LineTrendChart
          points={option.preview.points}
          yTickFormatter={option.preview.yTickFormatter}
          tickMode={option.preview.tickMode}
          startAtZero={option.preview.startAtZero}
          compact
        />
      </div>
    );
  }

  if (option.preview.type === "barChart") {
    return (
      <div className="explorer-chart-preview">
        <BarTrendChart points={option.preview.points} compact />
      </div>
    );
  }

  if (option.preview.type === "emptyChart") {
    return (
      <div className="explorer-chart-preview explorer-chart-preview-empty">
        <span>{option.preview.message}</span>
      </div>
    );
  }

  return null;
}

function DonutBreakdownChart({ segments, total, activeCategoryKey, onSelectCategory }) {
  if (!total) {
    return (
      <div className="breakdown-donut-empty">
        <div className="breakdown-donut-center">
          <strong>0</strong>
          <span>No workouts yet</span>
        </div>
      </div>
    );
  }

  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="breakdown-donut-wrap">
      <svg viewBox="0 0 220 220" className="breakdown-donut" role="img" aria-label="Workout breakdown donut chart">
        <circle className="breakdown-donut-track" cx="110" cy="110" r={radius} />
        {segments.map((segment) => {
          const segmentLength = (segment.count / total) * circumference;
          const dashArray = `${segmentLength} ${circumference - segmentLength}`;
          const dashOffset = -offset;
          offset += segmentLength;

            return (
              <circle
                key={segment.key}
                className={segment.key === activeCategoryKey ? `breakdown-donut-segment ${segment.segmentClass} is-active` : `breakdown-donut-segment ${segment.segmentClass}`}
                cx="110"
                cy="110"
                r={radius}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                style={segment.color ? { stroke: segment.color } : undefined}
                onClick={() => onSelectCategory(segment.key)}
                role="button"
                tabIndex={0}
              aria-label={`${segment.label}: ${segment.count} workouts`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectCategory(segment.key);
                }
              }}
            />
          );
        })}
      </svg>

      <div className="breakdown-donut-center">
        <strong>{total}</strong>
        <span>sessions</span>
      </div>
    </div>
  );
}

function buildWorkoutExplorerItems(workouts) {
  const totalWorkouts = workouts.length;
  const workoutSummaryMap = new Map();

  workouts.forEach((workout) => {
    const name = workout.templateName || workout.exercise;
    if (!name) {
      return;
    }

    const existing = workoutSummaryMap.get(name) || {
      name,
      count: 0,
      color: getWorkoutColor(workout),
    };
    existing.count += 1;
    workoutSummaryMap.set(name, existing);
  });

  return Array.from(workoutSummaryMap.values())
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .map((workout, index) => ({
      ...workout,
      rank: index + 1,
      share: totalWorkouts ? Math.round((workout.count / totalWorkouts) * 100) : 0,
    }));
}

function resolveStoredSession(session, workouts) {
  if (!session) {
    return session;
  }

  const sourceId = session.sourceWorkoutId || session.id;
  return workouts.find((workout) => workout.id === sourceId)
    || workouts.find((workout) => workout.id === session.id)
    || session;
}

function cloneAnalyticsSessionForEdit(session) {
  const inferredFields = inferAnalyticsFieldsFromSets(session?.sets || []);
  const fields = hasAnalyticsTrackedFields(session?.fields) ? session.fields : inferredFields;

  return {
    ...session,
    fields,
    notes: session?.notes || "",
    sets: Array.isArray(session?.sets)
      ? session.sets.map((set, index) => ({
        ...set,
        id: set.id ?? index + 1,
        setType: normalizeSetType(set.setType),
      }))
      : [],
  };
}

function buildAnalyticsDraftSet(session, templates, setId) {
  if (session?.isMixed) {
    const template = templates[0] || null;
    const fields = template?.fields || {};

    return {
      id: setId,
      setType: "regular",
      templateId: template?.id || "",
      templateName: template?.name || "",
      color: template ? getWorkoutColor(template) : "",
      fields,
      measurements: template?.measurements || {},
      ...copyAnalyticsSetFields({}, fields),
    };
  }

  const fields = hasAnalyticsTrackedFields(session?.fields)
    ? session.fields
    : inferAnalyticsFieldsFromSets(session?.sets || []);

  return {
    id: setId,
    setType: "regular",
    ...copyAnalyticsSetFields({}, fields),
  };
}

function copyAnalyticsSetFields(sourceSet, fields) {
  return {
    ...(fields?.reps ? { reps: sourceSet?.reps ?? "" } : {}),
    ...(fields?.weight ? { weight: sourceSet?.weight ?? "" } : {}),
    ...(fields?.duration ? { duration: sourceSet?.duration ?? "" } : {}),
    ...(fields?.distance ? { distance: sourceSet?.distance ?? "" } : {}),
  };
}

function getAnalyticsVisibleFields(session, setOverride = null) {
  const savedFieldConfig = setOverride?.fields || session?.fields;

  if (savedFieldConfig) {
    return setFieldColumns.filter((field) => savedFieldConfig[field.key]);
  }

  return setFieldColumns.filter((field) =>
    Array.isArray(session?.sets) && session.sets.some((set) => set[field.key] !== undefined && set[field.key] !== "")
  );
}

function getAnalyticsWorkoutMeasurements(session, setOverride = null) {
  if (session?.isMixed) {
    return setOverride?.measurements || session?.measurements || {};
  }

  return session?.measurements || {};
}

function getAnalyticsFieldLabel(field, measurements) {
  if (field.key === "weight") {
    return `Weight (${formatMeasurementLabel(measurements?.weight, "LBs")})`;
  }

  if (field.key === "distance") {
    return `Distance (${formatMeasurementLabel(measurements?.distance, "Miles")})`;
  }

  if (field.key === "duration") {
    return "Time (HH:MM:SS)";
  }

  return field.label;
}

function getAnalyticsFieldUnitSuffix(field, measurements) {
  if (field.key === "weight") {
    return formatMeasurementLabel(measurements?.weight, "lbs");
  }

  if (field.key === "distance") {
    return formatMeasurementLabel(measurements?.distance, "mi");
  }

  return "";
}

function inferAnalyticsFieldsFromSets(sets) {
  return {
    reps: sets.some((set) => hasAnalyticsSetValue(set?.reps)),
    weight: sets.some((set) => hasAnalyticsSetValue(set?.weight)),
    duration: sets.some((set) => hasAnalyticsSetValue(set?.duration)),
    distance: sets.some((set) => hasAnalyticsSetValue(set?.distance)),
    notes: true,
  };
}

function hasAnalyticsTrackedFields(fields) {
  return Boolean(fields?.reps || fields?.weight || fields?.duration || fields?.distance);
}

function hasAnalyticsSetValue(value) {
  return value !== undefined && value !== null && `${value}` !== "";
}

function buildWorkoutTemplateOptions(templates, workoutColorPreferences = {}) {
  return [...templates]
    .sort((left, right) => (left.name || "").localeCompare(right.name || ""))
    .map((template) => {
      const color = getWorkoutColor(template);
      const slotColor = findWorkoutColorSlot(color, workoutColorPreferences);
      const badge = getWorkoutColorPreferenceLabel(slotColor, workoutColorPreferences);

      return {
        value: template.id,
        label: template.name,
        color,
        ...(badge ? { badge, badgeColor: color } : {}),
      };
    });
}

function getNiceNumber(value, round) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(value));
  const fraction = value / (10 ** exponent);
  let niceFraction;

  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;

  return niceFraction * (10 ** exponent);
}

function getDurationTickStep(maxValue) {
  const candidates = [15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  const targetStep = Math.max(maxValue / 3, 1);
  return candidates.find((candidate) => candidate >= targetStep) || 3600;
}

function getLineChartScale(values, { startAtZero = false, tickMode }) {
  const rawMinValue = Math.min(...values);
  const rawMaxValue = Math.max(...values);

  if (!tickMode) {
    return {
      minValue: startAtZero ? 0 : rawMinValue,
      maxValue: rawMaxValue,
      ticks: [],
    };
  }

  if (rawMaxValue <= 0) {
    return {
      minValue: 0,
      maxValue: 1,
      ticks: [0, 1],
    };
  }

  if (startAtZero) {
    const step = tickMode === "duration"
      ? getDurationTickStep(rawMaxValue)
      : getNiceNumber(rawMaxValue / 3, true);
    const maxValue = Math.max(step, Math.ceil(rawMaxValue / step) * step);
    const ticks = [];

    for (let value = 0; value <= maxValue + step * 0.001; value += step) {
      ticks.push(value);
    }

    return { minValue: 0, maxValue, ticks };
  }

  if (tickMode === "numeric") {
    const rawRange = rawMaxValue - rawMinValue || Math.max(rawMaxValue * 0.15, 5);
    const step = Math.max(5, Math.ceil(getNiceNumber(rawRange / 3, true) / 5) * 5);
    const buffer = Math.max(5, Math.ceil(Math.max(rawRange * 0.12, step * 0.5) / 5) * 5);
    const minValue = Math.max(0, Math.floor((rawMinValue - buffer) / 5) * 5);
    const maxValue = Math.ceil((rawMaxValue + buffer) / 5) * 5;
    const ticks = [];

    for (let value = minValue; value <= maxValue + step * 0.001; value += step) {
      ticks.push(value);
    }

    return { minValue, maxValue, ticks };
  }

  const range = getNiceNumber(rawMaxValue - rawMinValue || rawMaxValue || 1, false);
  const step = getNiceNumber(range / 3, true);
  const minValue = Math.floor(rawMinValue / step) * step;
  const maxValue = Math.ceil(rawMaxValue / step) * step;
  const ticks = [];

  for (let value = minValue; value <= maxValue + step * 0.001; value += step) {
    ticks.push(value);
  }

  return { minValue, maxValue, ticks };
}

function LineTrendChart({ points, yTickFormatter, tickMode, startAtZero = false, onPointClick, compact = false }) {
  if (!points || points.length === 0) {
    return <p className="chart-empty">Not enough data yet.</p>;
  }

  const hideDotsUntilHover = points.length > 20;
  const values = points.map((point) => point.value);
  const scale = getLineChartScale(values, { startAtZero, tickMode });
  const minValue = scale.minValue;
  const maxValue = scale.maxValue;
  const width = 320;
  const height = 140;
  const paddingTop = 14;
  const paddingBottom = 14;
  const paddingLeft = yTickFormatter ? 42 : 14;
  const paddingRight = 14;
  const valueRange = maxValue - minValue || 1;
  const yTicks = scale.ticks.map((tickValue, index) => ({
    key: `${index}-${tickValue}`,
    label: yTickFormatter(tickValue),
    y: height - paddingBottom - ((tickValue - minValue) / valueRange) * (height - paddingTop - paddingBottom),
  }));

  const chartPoints = points.map((point, index) => {
    const x = paddingLeft + (index * (width - paddingLeft - paddingRight)) / Math.max(points.length - 1, 1);
    const y = height - paddingBottom - ((point.value - minValue) / valueRange) * (height - paddingTop - paddingBottom);
    return {
      ...point,
      x,
      y,
    };
  });

  const path = chartPoints.map((point, index) => (
    `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
  )).join(" ");

  return (
    <div className={compact ? "line-chart-wrap is-compact" : "line-chart-wrap"}>
      <div className="line-chart-area">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={compact ? "line-chart is-compact" : "line-chart"}
          role="img"
          aria-label="Workout trend line"
        >
          {yTicks.map((tick) => (
            <g key={tick.key}>
              <line
                x1={paddingLeft}
                x2={width - paddingRight}
                y1={tick.y}
                y2={tick.y}
                className="line-chart-grid-line"
              />
              <text
                x={paddingLeft - 6}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="line-chart-tick-label"
              >
                {tick.label}
              </text>
            </g>
          ))}
          <path d={path} className="line-chart-path" />
          {chartPoints.map((point) => (
            <g key={`${point.workoutId || point.label}-${point.label}`}>
              {point.ariaLabel ? <title>{point.ariaLabel}</title> : null}
              <circle
                cx={point.x}
                cy={point.y}
                r="8"
                className={point.workoutId && onPointClick ? "line-chart-hit-dot is-clickable" : "line-chart-hit-dot"}
                onClick={point.workoutId && onPointClick ? () => onPointClick(point.workoutId) : undefined}
                onKeyDown={point.workoutId && onPointClick ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPointClick(point.workoutId);
                  }
                } : undefined}
                role={point.workoutId && onPointClick ? "button" : undefined}
                tabIndex={point.workoutId && onPointClick ? 0 : undefined}
                aria-label={point.ariaLabel || undefined}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r="4.2"
                className={
                  point.workoutId && onPointClick
                    ? `line-chart-dot is-clickable${hideDotsUntilHover ? " is-hidden-until-hover" : ""}`
                    : `line-chart-dot${hideDotsUntilHover ? " is-hidden-until-hover" : ""}`
                }
                onClick={point.workoutId && onPointClick ? () => onPointClick(point.workoutId) : undefined}
              />
            </g>
          ))}
        </svg>
      </div>
      <div className={compact ? "chart-axis-labels is-compact" : "chart-axis-labels"}>
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}

function BarTrendChart({ points, scrollable = false, defaultToEnd = false, compact = false }) {
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (!scrollable || !defaultToEnd || !scrollRef.current) {
      return;
    }

    scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [defaultToEnd, points, scrollable]);

  if (!points || points.length === 0) {
    return <p className="chart-empty">Not enough data yet.</p>;
  }

  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const chart = (
    <div className={scrollable ? `bar-chart is-scrollable${compact ? " is-compact" : ""}` : `bar-chart${compact ? " is-compact" : ""}`}>
      {points.map((point) => (
        <div key={point.label} className="bar-chart-column">
          <span className="bar-chart-value">{point.value}</span>
          <div className="bar-chart-track">
            <div
              className="bar-chart-fill"
              style={{ height: `${(point.value / maxValue) * 100}%` }}
            />
          </div>
          <span className="bar-chart-label">{point.label}</span>
        </div>
      ))}
    </div>
  );

  if (scrollable) {
    return (
      <div className="bar-chart-scroll" ref={scrollRef}>
        {chart}
      </div>
    );
  }

  return (
    chart
  );
}

function CalendarHeatmap({ weeks }) {
  const scrollRef = React.useRef(null);
  const [cellSize, setCellSize] = React.useState(16);
  const minimumCellSize = 16;
  const maximumCellSize = 28;

  React.useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return undefined;
    }

    const updateCellSize = () => {
      const weekCount = Math.max(weeks.length, 1);
      const gap = 4;
      const availableWidth = scrollElement.clientWidth;
      const nextSize = Math.floor((availableWidth - gap * (weekCount - 1)) / weekCount);
      setCellSize(Math.max(minimumCellSize, Math.min(maximumCellSize, nextSize)));
    };

    updateCellSize();

    const resizeObserver = new ResizeObserver(updateCellSize);
    resizeObserver.observe(scrollElement);

    return () => resizeObserver.disconnect();
  }, [weeks.length]);

  React.useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [weeks]);

  return (
    <div
      className="heatmap"
      style={{ "--heatmap-cell-size": `${cellSize}px` }}
    >
      <div className="heatmap-days">
        {weekdayLabels.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="heatmap-scroll" ref={scrollRef}>
        <div className="heatmap-weeks">
          {weeks.map((week) => (
            <div key={week.key} className="heatmap-week">
              {week.days.map((day) => (
                <div
                  key={day.date}
                  className={`heatmap-cell intensity-${day.intensity}`}
                  title={`${day.date}: ${day.count} session${day.count === 1 ? "" : "s"}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildProfileIdentity(workouts, currentUser) {
  const favoriteWorkout = getMostUsedWorkoutName(workouts);
  const firstWorkout = workouts[0];
  const lastWorkout = workouts[workouts.length - 1];
  const displayName = currentUser?.name || currentUser?.email || "QuickSets Athlete";

  return {
    displayName,
    summary: `${workouts.length} sessions logged.`,
    memberSince: firstWorkout ? formatMonthYear(firstWorkout.date) : "No sessions yet",
    lastWorkout: lastWorkout ? formatReadableDate(lastWorkout.date) : "No sessions yet",
    favoriteWorkout,
  };
}

function expandAnalyticsWorkouts(workouts) {
  return workouts.flatMap((workout) => {
    if (!workout?.isMixed || !Array.isArray(workout.sets)) {
      return [workout];
    }

    const groupedSets = new Map();
    workout.sets.forEach((set, index) => {
      const key = set.templateId || set.templateName || `mixed-${index}`;
      const existing = groupedSets.get(key) || {
        ...workout,
        sourceWorkoutId: workout.id,
        isAnalyticsMixedSlice: true,
        id: `${workout.id}-${key}`,
        templateId: set.templateId || workout.templateId,
        templateName: set.templateName || workout.templateName,
        exercise: set.templateName || workout.exercise,
        fields: set.fields || {},
        measurements: set.measurements || workout.measurements,
        sets: [],
      };

      existing.sets.push({
        ...set,
        id: existing.sets.length + 1,
      });
      groupedSets.set(key, existing);
    });

    return Array.from(groupedSets.values());
  });
}

function buildWeeklySnapshot(workouts, uniqueWorkoutDays) {
  const today = stripTime(new Date());
  const weekStart = getWeekStart(today);
  const weekEnd = addDays(weekStart, 6);
  const weekWorkouts = workouts.filter((workout) => {
    const workoutDate = parseLocalDate(workout.date);
    return workoutDate >= weekStart && workoutDate <= weekEnd;
  });

  return {
    workoutsThisWeek: weekWorkouts.length,
    setsThisWeek: weekWorkouts.reduce((count, workout) => count + (workout.sets?.length || 0), 0),
    activeDaysThisWeek: uniqueWorkoutDays.filter((date) => {
      const workoutDate = parseLocalDate(date);
      return workoutDate >= weekStart && workoutDate <= weekEnd;
    }).length,
    weekRange: `${formatReadableDate(formatDateValue(weekStart))} to ${formatReadableDate(formatDateValue(weekEnd))}`,
    shortWeekRange: `${formatShortMonthDay(weekStart)}-${formatShortMonthDay(weekEnd)}`,
  };
}

function buildWorkoutBreakdown(workouts, selectedCategoryKey) {
  const totalWorkouts = workouts.length;
  const workoutPalette = [
    "#4da3ff",
    "#27d7c3",
    "#ffba49",
    "#ff7a67",
    "#c084fc",
    "#7dd3fc",
    "#a3e635",
    "#fb7185",
    "#f59e0b",
    "#22c55e",
  ];
  const categoryMeta = [
    {
      key: "strength",
      label: "Strength",
      description: "Weight or reps-driven exercises.",
      swatchClass: "is-strength",
      segmentClass: "is-strength",
    },
    {
      key: "strength-duration",
      label: "Strength Duration",
      description: "Timed holds or weighted efforts over time.",
      swatchClass: "is-strength-duration",
      segmentClass: "is-strength-duration",
    },
    {
      key: "cardio",
      label: "Cardio",
      description: "Distance-focused movement and endurance sessions.",
      swatchClass: "is-cardio",
      segmentClass: "is-cardio",
    },
    {
      key: "mixed",
      label: "Mixed",
      description: "Exercises blending strength and cardio signals.",
      swatchClass: "is-mixed",
      segmentClass: "is-mixed",
    },
    {
      key: "other",
      label: "Other",
      description: "Anything that does not fit the main buckets.",
      swatchClass: "is-other",
      segmentClass: "is-other",
    },
  ];

  const counts = new Map(categoryMeta.map((category) => [category.key, 0]));
  const workoutsByCategory = new Map(categoryMeta.map((category) => [category.key, []]));

  workouts.forEach((workout) => {
    const categoryKey = classifyWorkout(workout);
    counts.set(categoryKey, (counts.get(categoryKey) || 0) + 1);
    workoutsByCategory.get(categoryKey)?.push(workout);
  });

  const categories = categoryMeta
    .map((category) => ({
      ...category,
      count: counts.get(category.key) || 0,
      percentage: totalWorkouts ? Math.round(((counts.get(category.key) || 0) / totalWorkouts) * 100) : 0,
    }))
    .filter((category) => category.count > 0);

  const sortedCategories = [...categories].sort((left, right) => right.count - left.count);
  const topCategoryShare = totalWorkouts ? (sortedCategories[0]?.count || 0) / totalWorkouts : 0;
  const meaningfulCategories = categories.filter((category) => {
    if (!totalWorkouts) {
      return false;
    }

    return category.count / totalWorkouts >= 0.1;
  }).length;
  const shouldShowWorkoutSplit = categories.length <= 1 || topCategoryShare >= 0.8 || meaningfulCategories < 2;
  const breakdownMode = shouldShowWorkoutSplit ? "workouts" : "categories";

  const workoutSummaryMap = new Map();
  workouts.forEach((workout) => {
    const name = workout.templateName || workout.exercise;
    if (!name) {
      return;
    }

    const existing = workoutSummaryMap.get(name) || {
      key: `workout-${name}`,
      label: name,
      name,
      count: 0,
      categoryKey: classifyWorkout(workout),
      color: getWorkoutColor(workout),
    };
    existing.count += 1;
    workoutSummaryMap.set(name, existing);
  });

  const workoutSegments = Array.from(workoutSummaryMap.values())
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .map((segment, index) => ({
      ...segment,
      percentage: totalWorkouts ? Math.round((segment.count / totalWorkouts) * 100) : 0,
      swatchClass: "is-custom",
      segmentClass: "is-custom",
      color: segment.color || workoutPalette[index % workoutPalette.length],
    }));

  const segments = breakdownMode === "workouts" ? workoutSegments : categories;
  const selectedSegment = segments.find((segment) => segment.key === selectedCategoryKey);
  const activeSegmentKey = selectedSegment ? selectedSegment.key : "all";

  let filteredWorkouts = workouts;
  if (activeSegmentKey !== "all") {
    filteredWorkouts = breakdownMode === "workouts"
      ? workouts.filter((workout) => (workout.templateName || workout.exercise) === selectedSegment?.name)
      : workoutsByCategory.get(activeSegmentKey) || [];
  }

  const workoutCounts = new Map();
  filteredWorkouts.forEach((workout) => {
    const name = workout.templateName || workout.exercise;
    if (!name) {
      return;
    }

    workoutCounts.set(name, (workoutCounts.get(name) || 0) + 1);
  });

  const topWorkouts = Array.from(workoutCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([name, count], index) => ({
      name,
      count,
      rank: index + 1,
      share: filteredWorkouts.length ? Math.round((count / filteredWorkouts.length) * 100) : 0,
      color: getWorkoutColorByName(filteredWorkouts, name),
    }));

  return {
    mode: breakdownMode,
    totalWorkouts,
    categories: segments,
    activeCategoryKey: activeSegmentKey,
    activeCategoryLabel: selectedSegment
      ? selectedSegment.label
      : breakdownMode === "workouts"
        ? "Exercise Split"
        : "All Exercises",
    activeCategoryDescription: selectedSegment
      ? breakdownMode === "workouts"
        ? `${selectedSegment.count} sessions of ${selectedSegment.label}.`
        : selectedSegment.description
      : breakdownMode === "workouts"
        ? "One exercise dominates, so this view drills into your specific exercises."
        : "Your most-performed exercises across every category.",
    topWorkouts,
  };
}

function getCategoryStyleClass(categoryKey) {
  switch (categoryKey) {
    case "strength":
      return "is-strength";
    case "strength-duration":
      return "is-strength-duration";
    case "cardio":
      return "is-cardio";
    case "mixed":
      return "is-mixed";
    default:
      return "is-other";
  }
}

function getWorkoutColorByName(workouts, workoutName) {
  const matchedWorkout = workouts.find((workout) => (workout.templateName || workout.exercise) === workoutName);
  return matchedWorkout ? getWorkoutColor(matchedWorkout) : getWorkoutColor(workoutName);
}

function buildWorkoutGroupBadge(color, workoutColorPreferences) {
  const slotColor = findWorkoutColorSlot(color, workoutColorPreferences);
  const badge = getWorkoutColorPreferenceLabel(slotColor, workoutColorPreferences);

  return badge
    ? { badge, badgeColor: color }
    : {};
}

function buildConsistencyStats(workouts, uniqueWorkoutDays, dayCountMap) {
  const today = stripTime(new Date());
  const minimumHeatmapStart = addDays(getWeekStart(today), -49);
  const firstWorkoutDate = workouts.length > 0
    ? parseLocalDate(workouts[0].date)
    : null;
  const heatmapStartMonday = firstWorkoutDate
    ? earlierDate(getWeekStart(firstWorkoutDate), minimumHeatmapStart)
    : minimumHeatmapStart;
  const heatmapWeeks = [];
  let currentWeekStart = new Date(heatmapStartMonday);

  while (currentWeekStart <= today) {
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const currentDay = addDays(currentWeekStart, index);
      const dateKey = formatDateValue(currentDay);
      const count = dayCountMap.get(dateKey) || 0;

      return {
        date: dateKey,
        count,
        intensity: getHeatIntensity(count),
      };
    });

    heatmapWeeks.push({
      key: formatDateValue(currentWeekStart),
      days: weekDays,
    });

    currentWeekStart = addDays(currentWeekStart, 7);
  }

  const weeklyFrequency = buildWeeklyFrequency(uniqueWorkoutDays);

  return {
    currentStreak: getCurrentStreak(uniqueWorkoutDays),
    longestStreak: getLongestStreak(uniqueWorkoutDays),
    totalWorkoutDays: uniqueWorkoutDays.length,
    averageWorkoutDaysPerWeek: (uniqueWorkoutDays.length / Math.max(getWeekSpan(uniqueWorkoutDays), 1)).toFixed(1),
    heatmapWeeks,
    weeklyFrequency,
  };
}

function earlierDate(left, right) {
  return left <= right ? left : right;
}

function buildSelectedWorkoutStats(workouts, selectedWorkoutName) {
  if (!selectedWorkoutName) {
    return null;
  }

  const selectedWorkouts = workouts.filter(
    (workout) => (workout.templateName || workout.exercise) === selectedWorkoutName
  );

  if (selectedWorkouts.length === 0) {
    return null;
  }

  const representativeWorkout = selectedWorkouts[selectedWorkouts.length - 1];
  const fields = representativeWorkout.fields || {};
  const measurements = normalizeMeasurements(representativeWorkout.measurements);
  const sessionsLogged = selectedWorkouts.length;
  const averageSetsPerSession = (
    selectedWorkouts.reduce((sum, workout) => sum + (workout.sets?.length || 0), 0) / sessionsLogged
  ).toFixed(1);
  const lastPerformedWorkout = selectedWorkouts[selectedWorkouts.length - 1];
  const lastPerformed = formatReadableDate(lastPerformedWorkout.date);
  const availableStatCards = buildWorkoutExplorerAvailableStatCards(
    selectedWorkouts,
    fields,
    measurements,
    lastPerformedWorkout
  );
  const averageMetrics = buildWorkoutAverageMetrics(selectedWorkouts, fields, measurements, averageSetsPerSession);

  return {
    templateId: representativeWorkout.templateId || "",
    fields,
    sessionsLogged,
    averageSetsPerSession,
    lastPerformed,
    lastPerformedWorkoutId: lastPerformedWorkout.id,
    availableStatCards,
    averageMetrics,
    performanceTrend: buildPerformanceTrend(selectedWorkouts, fields, measurements),
    estimatedOneRepMaxTrend: buildEstimatedOneRepMaxTrend(selectedWorkouts, fields, measurements),
    setVolumeTrend: selectedWorkouts.slice(-12).map((workout, index) => ({
      label: `S${index + 1}`,
      value: workout.sets?.length || 0,
    })),
    monthlyFrequency: buildMonthlyFrequency(selectedWorkouts),
  };
}

function classifyWorkout(workout) {
  const fields = workout.fields || {};
  const hasWeight = Boolean(fields.weight);
  const hasReps = Boolean(fields.reps);
  const hasDistance = Boolean(fields.distance);
  const hasDuration = Boolean(fields.duration);

  if (hasDistance && (hasWeight || hasReps)) {
    return "mixed";
  }

  if (hasDistance) {
    return "cardio";
  }

  if (hasDuration && (hasWeight || hasReps)) {
    return "strength-duration";
  }

  if (hasWeight || hasReps) {
    return "strength";
  }

  if (hasDuration) {
    return "strength-duration";
  }

  return "other";
}

function buildWorkoutExplorerAvailableStatCards(workouts, fields, measurements, lastPerformedWorkout) {
  const cards = [
    {
      key: "lastPerformed",
      label: "Last Performed",
      value: formatReadableDate(lastPerformedWorkout.date),
      workoutId: lastPerformedWorkout.id,
      accent: false,
    },
  ];

  if (fields.weight) {
    const bestWeight = getBestWeightMetric(workouts, measurements);
    if (bestWeight) {
      cards.push(bestWeight);
    }
  }

  if (fields.weight && fields.reps) {
    const estimatedOneRepMax = getEstimatedOneRepMaxMetric(workouts, measurements);
    if (estimatedOneRepMax) {
      cards.push(estimatedOneRepMax);
    }
  }

  if (fields.reps) {
    const highestReps = getMostRepsMetric(workouts);
    if (highestReps) {
      cards.push(highestReps);
    }
  }

  if (fields.distance) {
    const farthestDistance = getFarthestDistanceMetric(workouts, measurements);
    if (farthestDistance) {
      cards.push(farthestDistance);
    }
  }

  if (fields.duration) {
    const longestDuration = getLongestDurationMetric(workouts);
    if (longestDuration) {
      cards.push(longestDuration);
    }

    const shortestDuration = getShortestDurationMetric(workouts);
    if (shortestDuration) {
      cards.push(shortestDuration);
    }
  }

  if (fields.distance && fields.duration) {
    const bestPace = getBestPaceMetric(workouts, measurements);
    if (bestPace) {
      cards.push(bestPace);
    }
  }

  return cards;
}

function getBestWeightMetric(workouts, measurements) {
  const bestSet = workouts.reduce((bestWorkoutSet, workout) => {
    const workoutBestSet = (workout.sets || []).reduce((bestSetForWorkout, set) => {
      const weight = Number(set.weight) || 0;
      const reps = Number(set.reps) || 0;

      if (!bestSetForWorkout || weight > bestSetForWorkout.weight || (weight === bestSetForWorkout.weight && reps > bestSetForWorkout.reps)) {
        return { weight, reps, workoutId: workout.id };
      }

      return bestSetForWorkout;
    }, null);

    if (!workoutBestSet) {
      return bestWorkoutSet;
    }

    if (!bestWorkoutSet || workoutBestSet.weight > bestWorkoutSet.weight || (workoutBestSet.weight === bestWorkoutSet.weight && workoutBestSet.reps > bestWorkoutSet.reps)) {
      return workoutBestSet;
    }

    return bestWorkoutSet;
  }, null);

  if (!bestSet || bestSet.weight <= 0) {
    return null;
  }

  const repsSuffix = bestSet.reps > 0 ? ` (${bestSet.reps} rep${bestSet.reps === 1 ? "" : "s"})` : "";
  return {
    key: "bestWeight",
    label: "Best Weight",
    value: `${bestSet.weight} ${formatMeasurementUnit(measurements.weight, "LBs")}${repsSuffix}`,
    workoutId: bestSet.workoutId,
    accent: true,
  };
}

function estimateOneRepMax(weight, reps) {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) {
    return null;
  }

  return weight * (1 + reps / 30);
}

function getBestEstimatedOneRepMaxSet(workout) {
  return (workout.sets || []).reduce((bestSet, set) => {
    const weight = Number(set.weight);
    const reps = Number(set.reps);
    const estimatedOneRepMax = estimateOneRepMax(weight, reps);

    if (!estimatedOneRepMax) {
      return bestSet;
    }

    if (
      !bestSet
      || estimatedOneRepMax > bestSet.estimatedOneRepMax
      || (estimatedOneRepMax === bestSet.estimatedOneRepMax && weight > bestSet.weight)
    ) {
      return {
        estimatedOneRepMax,
        weight,
        reps,
      };
    }

    return bestSet;
  }, null);
}

function getEstimatedOneRepMaxMetric(workouts, measurements) {
  const bestSet = workouts.reduce((bestWorkoutSet, workout) => {
    const workoutBestSet = getBestEstimatedOneRepMaxSet(workout);

    if (!workoutBestSet) {
      return bestWorkoutSet;
    }

    if (
      !bestWorkoutSet
      || workoutBestSet.estimatedOneRepMax > bestWorkoutSet.estimatedOneRepMax
      || (
        workoutBestSet.estimatedOneRepMax === bestWorkoutSet.estimatedOneRepMax
        && workoutBestSet.weight > bestWorkoutSet.weight
      )
    ) {
      return {
        ...workoutBestSet,
        workoutId: workout.id,
      };
    }

    return bestWorkoutSet;
  }, null);

  if (!bestSet) {
    return null;
  }

  return {
    key: "estimatedOneRepMax",
    label: "Estimated 1RM",
    value: `${Math.round(bestSet.estimatedOneRepMax)} ${formatMeasurementUnit(measurements.weight, "LBs")}`,
    workoutId: bestSet.workoutId,
    accent: true,
  };
}

function getFarthestDistanceMetric(workouts, measurements) {
  const bestDistance = workouts.reduce((bestWorkoutDistance, workout) => {
    const workoutBestDistance = Math.max(...(workout.sets || []).map((set) => Number(set.distance) || 0));

    if (!bestWorkoutDistance || workoutBestDistance > bestWorkoutDistance.distance) {
      return { distance: workoutBestDistance, workoutId: workout.id };
    }

    return bestWorkoutDistance;
  }, null);

  if (!bestDistance || bestDistance.distance <= 0) {
    return null;
  }

  return {
    key: "farthestDistance",
    label: "Farthest Distance",
    value: `${formatAverageNumber(bestDistance.distance)} ${formatMeasurementUnit(measurements.distance, "Miles")}`,
    workoutId: bestDistance.workoutId,
    accent: true,
  };
}

function getLongestDurationMetric(workouts) {
  const longestDuration = workouts.reduce((bestWorkoutDuration, workout) => {
    const workoutLongestDuration = Math.max(...(workout.sets || []).map((set) => parseDurationToSeconds(set.duration) || 0));

    if (!bestWorkoutDuration || workoutLongestDuration > bestWorkoutDuration.duration) {
      return { duration: workoutLongestDuration, workoutId: workout.id };
    }

    return bestWorkoutDuration;
  }, null);

  if (!longestDuration || longestDuration.duration <= 0) {
    return null;
  }

  return {
    key: "longestDuration",
    label: "Longest Duration",
    value: formatSeconds(longestDuration.duration),
    workoutId: longestDuration.workoutId,
    accent: true,
  };
}

function getShortestDurationMetric(workouts) {
  const shortestDuration = workouts.reduce((bestWorkoutDuration, workout) => {
    const workoutShortestDuration = Math.min(...(workout.sets || []).map((set) => parseDurationToSeconds(set.duration) || Number.MAX_SAFE_INTEGER));

    if (!bestWorkoutDuration || workoutShortestDuration < bestWorkoutDuration.duration) {
      return { duration: workoutShortestDuration, workoutId: workout.id };
    }

    return bestWorkoutDuration;
  }, null);

  if (!shortestDuration || shortestDuration.duration === Number.MAX_SAFE_INTEGER) {
    return null;
  }

  return {
    key: "shortestDuration",
    label: "Shortest Duration",
    value: formatSeconds(shortestDuration.duration),
    workoutId: shortestDuration.workoutId,
    accent: true,
  };
}

function getBestPaceMetric(workouts, measurements) {
  const bestPace = workouts.reduce((bestWorkoutPace, workout) => {
    const workoutBestPace = (workout.sets || []).reduce((bestPaceForWorkout, set) => {
      const durationSeconds = parseDurationToSeconds(set.duration);
      const distance = Number(set.distance);
      if (!durationSeconds || !distance) {
        return bestPaceForWorkout;
      }

      const pace = durationSeconds / distance;
      if (!bestPaceForWorkout || pace < bestPaceForWorkout.pace) {
        return { pace, workoutId: workout.id };
      }

      return bestPaceForWorkout;
    }, null);

    if (!workoutBestPace) {
      return bestWorkoutPace;
    }

    if (!bestWorkoutPace || workoutBestPace.pace < bestWorkoutPace.pace) {
      return workoutBestPace;
    }

    return bestWorkoutPace;
  }, null);

  if (!bestPace || !Number.isFinite(bestPace.pace) || bestPace.pace <= 0) {
    return null;
  }

  return {
    key: "bestPace",
    label: "Best Pace",
    value: formatPace(bestPace.pace, measurements.distance),
    workoutId: bestPace.workoutId,
    accent: true,
  };
}

function getWorkoutTrendMetric(workout, metricKey) {
  const sets = workout.sets || [];
  const regularSets = sets.filter((set) => normalizeSetType(set?.setType) === "regular");
  const nonWarmupSets = sets.filter((set) => normalizeSetType(set?.setType) !== "warmup");
  const candidateSets = regularSets.length > 0
    ? regularSets
    : (nonWarmupSets.length > 0 ? nonWarmupSets : sets);

  const getAverageMetric = (valueSelector) => {
    const values = candidateSets
      .map((set) => valueSelector(set))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (values.length === 0) {
      return null;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  if (metricKey === "weight") {
    if (regularSets.length === 0) {
      return null;
    }

    const regularWeightValues = regularSets
      .map((set) => Number(set.weight))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (regularWeightValues.length === 0) {
      return null;
    }

    const averageWeight = regularWeightValues.reduce((sum, value) => sum + value, 0) / regularWeightValues.length;
    return averageWeight === null ? null : { value: averageWeight };
  }

  if (metricKey === "distance") {
    const averageDistance = getAverageMetric((set) => Number(set.distance));
    return averageDistance === null ? null : { value: averageDistance };
  }

  if (metricKey === "pace") {
    const paceSamples = candidateSets
      .map((set) => {
        const durationSeconds = parseDurationToSeconds(set.duration);
        const distance = Number(set.distance);
        if (!durationSeconds || !distance) {
          return null;
        }

        return durationSeconds / distance;
      })
      .filter((value) => Number.isFinite(value) && value > 0);

    if (paceSamples.length === 0) {
      return null;
    }

    return {
      value: paceSamples.reduce((sum, value) => sum + value, 0) / paceSamples.length,
    };
  }

  if (metricKey === "duration") {
    const averageDuration = getAverageMetric((set) => parseDurationToSeconds(set.duration));
    return averageDuration === null ? null : { value: averageDuration };
  }

  if (metricKey === "reps") {
    const averageReps = getAverageMetric((set) => Number(set.reps));
    return averageReps === null ? null : { value: averageReps };
  }

  return null;
}

function formatTrendMetricValue(metricKey, metric, measurements) {
  if (!metric) {
    return "N/A";
  }

  if (metricKey === "weight") {
    return `${formatAverageNumber(metric.value)} ${formatMeasurementUnit(measurements.weight, "LBs")}`;
  }

  if (metricKey === "distance") {
    return `${formatAverageNumber(metric.value)} ${formatMeasurementUnit(measurements.distance, "Miles")}`;
  }

  if (metricKey === "pace") {
    return formatPace(metric.value, measurements.distance);
  }

  if (metricKey === "duration") {
    return formatSeconds(Math.round(metric.value));
  }

  if (metricKey === "reps") {
    const roundedReps = Math.round(metric.value * 10) / 10;
    const repsText = Number.isInteger(roundedReps) ? String(roundedReps) : roundedReps.toFixed(1);
    return `${repsText} reps`;
  }

  return String(metric.value);
}

function getPerformanceTrendConfig(fields, measurements) {
  if (fields.weight) {
    return {
      metricKey: "weight",
      title: "Weight Trend",
      subtitle: "Average working-set weight by session",
      shortSubtitle: "Working-set average",
      yTickFormatter: (value) => String(Math.round(value)),
      tickMode: "numeric",
      startAtZero: false,
    };
  }

  if (fields.distance && fields.duration) {
    return {
      metricKey: "pace",
      title: "Average Pace Trend",
      subtitle: `Average working-set pace by session`,
      shortSubtitle: "Working-set average",
      yTickFormatter: null,
      tickMode: null,
      startAtZero: false,
    };
  }

  if (fields.distance) {
    return {
      metricKey: "distance",
      title: "Working Distance Trend",
      subtitle: `Average working-set ${formatMeasurementUnit(measurements.distance, "Miles")} by session`,
      shortSubtitle: "Working-set average",
      yTickFormatter: null,
      tickMode: null,
      startAtZero: false,
    };
  }

  if (fields.duration) {
    return {
      metricKey: "duration",
      title: "Working Duration Trend",
      subtitle: "Average working-set time by session",
      shortSubtitle: "Working-set average",
      yTickFormatter: (value) => formatSeconds(Math.round(value)),
      tickMode: "duration",
      startAtZero: true,
    };
  }

  if (fields.reps) {
    return {
      metricKey: "reps",
      title: "Working Reps Trend",
      subtitle: "Average working-set reps by session",
      shortSubtitle: "Working-set average",
      yTickFormatter: (value) => String(Math.round(value)),
      tickMode: "numeric",
      startAtZero: false,
    };
  }

  return null;
}

function getMostRepsMetric(workouts) {
  const bestRepSet = workouts.reduce((bestWorkoutReps, workout) => {
    const workoutBestReps = (workout.sets || []).reduce((bestRepsForWorkout, set) => {
      const reps = Number(set.reps);
      if (!Number.isFinite(reps)) {
        return bestRepsForWorkout;
      }

      if (!bestRepsForWorkout || reps > bestRepsForWorkout.reps) {
        return { reps, workoutId: workout.id };
      }

      return bestRepsForWorkout;
    }, null);

    if (!workoutBestReps) {
      return bestWorkoutReps;
    }

    if (!bestWorkoutReps || workoutBestReps.reps > bestWorkoutReps.reps) {
      return workoutBestReps;
    }

    return bestWorkoutReps;
  }, null);

  if (!bestRepSet) {
    return null;
  }

  return {
    key: "highestReps",
    label: "Highest Reps",
    value: String(bestRepSet.reps),
    workoutId: bestRepSet.workoutId,
    accent: true,
  };
}

function buildWorkoutAverageMetrics(workouts, fields, measurements, averageSetsPerSession) {
  const metrics = [
    { key: "averageSetsPerSession", label: "Average Sets / Session", value: averageSetsPerSession },
  ];

  if (fields.reps) {
    const averageReps = getAverageFromSets(workouts, (set) => Number(set.reps));
    metrics.push({ key: "averageRepsPerSet", label: "Average Reps / Set", value: averageReps === null ? "N/A" : formatAverageNumber(averageReps) });
  }

  if (fields.weight) {
    const averageWeight = getAverageFromSets(workouts, (set) => Number(set.weight));
    metrics.push({
      key: "averageWeightPerSet",
      label: "Average Weight / Set",
      value: averageWeight === null
        ? "N/A"
        : `${formatAverageNumber(averageWeight)} ${formatMeasurementUnit(measurements.weight, "lbs")}`,
    });
  }

  if (fields.duration) {
    const averageDurationSeconds = getAverageFromSets(workouts, (set) => parseDurationToSeconds(set.duration));
    metrics.push({
      key: "averageTimePerSet",
      label: "Average Time / Set",
      value: averageDurationSeconds === null ? "N/A" : formatSeconds(Math.round(averageDurationSeconds)),
    });
  }

  if (fields.distance && fields.duration) {
    const paceSamples = workouts.flatMap((workout) => (workout.sets || []).map((set) => {
      const durationSeconds = parseDurationToSeconds(set.duration);
      const distance = Number(set.distance);
      if (!durationSeconds || !distance) {
        return null;
      }

      return durationSeconds / distance;
    }).filter((value) => value !== null));

    const averagePace = paceSamples.length > 0
      ? paceSamples.reduce((sum, value) => sum + value, 0) / paceSamples.length
      : null;

    metrics.push({
      key: "averagePace",
      label: "Average Pace",
      value: averagePace === null ? "N/A" : formatPace(averagePace, measurements.distance),
    });
  }

  return metrics;
}

function getAverageFromSets(workouts, valueSelector) {
  const values = workouts.flatMap((workout) => (workout.sets || []).map((set) => {
    const value = valueSelector(set);
    return Number.isFinite(value) && value > 0 ? value : null;
  }).filter((value) => value !== null));

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatAverageNumber(value) {
  const roundedValue = Math.round(value * 10) / 10;
  return Number.isInteger(roundedValue) ? String(roundedValue) : roundedValue.toFixed(1);
}

function buildPerformanceTrend(workouts, fields, measurements) {
  const recentWorkouts = workouts;
  const trendConfig = getPerformanceTrendConfig(fields, measurements);

  if (trendConfig) {
    return {
      title: trendConfig.title,
      subtitle: trendConfig.subtitle,
      shortSubtitle: trendConfig.shortSubtitle,
      yTickFormatter: trendConfig.yTickFormatter,
      tickMode: trendConfig.tickMode,
      startAtZero: trendConfig.startAtZero,
      points: recentWorkouts.map((workout) => {
        const sessionMetric = getWorkoutTrendMetric(workout, trendConfig.metricKey);

        if (!sessionMetric) {
          return null;
        }

        return {
          label: shortDateLabel(workout.date),
          value: sessionMetric.value,
          workoutId: workout.id,
          ariaLabel: `${formatReadableDate(workout.date)}: ${formatTrendMetricValue(trendConfig.metricKey, sessionMetric, measurements)}`,
        };
      }).filter(Boolean),
    };
  }

  return {
    title: "Session Trend",
    subtitle: "Session frequency over time",
    points: [],
  };
}

function buildEstimatedOneRepMaxTrend(workouts, fields, measurements) {
  if (!fields.weight || !fields.reps) {
    return null;
  }

  const points = workouts.map((workout) => {
    const bestSet = getBestEstimatedOneRepMaxSet(workout);

    if (!bestSet) {
      return null;
    }

    return {
      label: shortDateLabel(workout.date),
      value: bestSet.estimatedOneRepMax,
      workoutId: workout.id,
      ariaLabel: `${formatReadableDate(workout.date)}: ${Math.round(bestSet.estimatedOneRepMax)} ${formatMeasurementUnit(measurements.weight, "LBs")} estimated 1RM`,
    };
  }).filter(Boolean);

  return {
    title: "Estimated 1RM Trend",
    subtitle: "Best estimated 1RM by session",
    shortSubtitle: "Best set each session",
    yTickFormatter: (value) => String(Math.round(value)),
    tickMode: "numeric",
    startAtZero: false,
    points,
  };
}

function buildMonthlyFrequency(workouts) {
  const groups = new Map();

  workouts.forEach((workout) => {
    const date = parseLocalDate(workout.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleString("en-US", { month: "short" });
    const existing = groups.get(key) || { label, value: 0 };
    existing.value += 1;
    groups.set(key, existing);
  });

  return Array.from(groups.values()).slice(-6);
}

function buildWeeklyFrequency(uniqueWorkoutDays) {
  const today = stripTime(new Date());
  const currentWeekStart = getWeekStart(today);
  const weeklyPoints = [];

  for (let index = 11; index >= 0; index -= 1) {
    const weekStart = addDays(currentWeekStart, -index * 7);
    const weekEnd = addDays(weekStart, 6);
    const count = uniqueWorkoutDays.filter((date) => {
      const workoutDate = parseLocalDate(date);
      return workoutDate >= weekStart && workoutDate <= weekEnd;
    }).length;

    weeklyPoints.push({
      label: `${weekStart.toLocaleString("en-US", { month: "short" })} ${weekStart.getDate()}`,
      value: count,
    });
  }

  return weeklyPoints;
}

function getWorkoutNames(workouts) {
  return Array.from(new Set(workouts.map((workout) => workout.templateName || workout.exercise).filter(Boolean))).sort();
}

function getMostUsedWorkoutName(workouts) {
  const counts = new Map();

  workouts.forEach((workout) => {
    const name = workout.templateName || workout.exercise;
    if (!name) {
      return;
    }

    counts.set(name, (counts.get(name) || 0) + 1);
  });

  let bestName = "None yet";
  let bestCount = 0;

  counts.forEach((count, name) => {
    if (count > bestCount) {
      bestCount = count;
      bestName = name;
    }
  });

  return bestName;
}

function getUniqueWorkoutDays(workouts) {
  return Array.from(new Set(workouts.map((workout) => workout.date))).sort();
}

function getWorkoutDayCountMap(workouts) {
  const map = new Map();

  workouts.forEach((workout) => {
    map.set(workout.date, (map.get(workout.date) || 0) + 1);
  });

  return map;
}

function getCurrentStreak(uniqueWorkoutDays) {
  const activeWeeks = getActiveWorkoutWeeks(uniqueWorkoutDays);

  if (activeWeeks.length === 0) {
    return 0;
  }

  let streak = 1;

  for (let index = activeWeeks.length - 1; index > 0; index -= 1) {
    const current = activeWeeks[index];
    const previous = activeWeeks[index - 1];
    const difference = Math.round((current - previous) / (1000 * 60 * 60 * 24 * 7));

    if (difference === 1) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function getLongestStreak(uniqueWorkoutDays) {
  const activeWeeks = getActiveWorkoutWeeks(uniqueWorkoutDays);

  if (activeWeeks.length === 0) {
    return 0;
  }

  let best = 1;
  let current = 1;

  for (let index = 1; index < activeWeeks.length; index += 1) {
    const previous = activeWeeks[index - 1];
    const next = activeWeeks[index];
    const difference = Math.round((next - previous) / (1000 * 60 * 60 * 24 * 7));

    if (difference === 1) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }

  return best;
}

function getActiveWorkoutWeeks(uniqueWorkoutDays) {
  return Array.from(
    new Set(
      uniqueWorkoutDays.map((dateValue) => formatDateValue(getWeekStart(parseLocalDate(dateValue))))
    )
  )
    .sort()
    .map((dateValue) => parseLocalDate(dateValue));
}

function getWeekSpan(uniqueWorkoutDays) {
  if (uniqueWorkoutDays.length === 0) {
    return 1;
  }

  const first = parseLocalDate(uniqueWorkoutDays[0]);
  const last = parseLocalDate(uniqueWorkoutDays[uniqueWorkoutDays.length - 1]);
  return Math.max(Math.ceil((last - first) / (1000 * 60 * 60 * 24 * 7)), 1);
}

function getWorkoutBestPace(workout) {
  const paces = (workout.sets || []).map((set) => {
    const distance = Number(set.distance);
    const durationSeconds = parseDurationToSeconds(set.duration);
    if (!distance || !durationSeconds) {
      return 0;
    }

    return durationSeconds / distance;
  }).filter(Boolean);

  return paces.length > 0 ? Math.min(...paces) : 0;
}

function getHeatIntensity(count) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

function sortWorkoutsAscending(workouts) {
  return [...workouts].sort((left, right) => parseLocalDate(left.date) - parseLocalDate(right.date));
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getWeekStart(date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function formatReadableDate(dateValue) {
  return parseLocalDate(dateValue).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonthYear(dateValue) {
  return parseLocalDate(dateValue).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatShortMonthDay(date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function shortDateLabel(dateValue) {
  return parseLocalDate(dateValue).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPace(secondsPerUnit, distanceMeasurement = 'miles') {
  if (!secondsPerUnit || !Number.isFinite(secondsPerUnit)) {
    return "N/A";
  }

  const minutes = Math.floor(secondsPerUnit / 60);
  const seconds = Math.round(secondsPerUnit % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")} / ${formatMeasurementUnit(distanceMeasurement, "Miles")}`;
}

function formatSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizeMeasurements(measurements) {
  return {
    weight: measurements?.weight || 'lbs',
    distance: measurements?.distance || 'miles',
  };
}

function formatMeasurementUnit(value, fallback) {
  return formatMeasurementLabel(value, fallback);
}

