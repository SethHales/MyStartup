import React from 'react';
import { createPortal } from 'react-dom';
import "./logger.css";
import { Dropdown } from "../components/dropdown";
import { DatePicker } from "../components/datePicker";
import { WheelPicker } from "../components/wheelPicker";
import { TimeCaptureModal } from "../components/timeCaptureModal";
import { playTimerPing, primeTimerAudio, vibrate } from "../utils/timerFeedback";
import {
  findWorkoutColorSlot,
  getWorkoutColor,
  getWorkoutColorPreferenceLabel,
  getWorkoutColorPreferenceValue,
  resolveWorkoutColorPreferences,
  workoutColorPalette,
} from "../utils/workoutColors";

const LOGGER_DRAFT_KEY = "quicksets.loggerDraft";
const MIXED_WORKOUT_TEMPLATE_ID = "__mixed_workout__";
const CREATE_TEMPLATE_OPTION_ID = "__create_workout_template__";
const MIXED_WORKOUT_NAME = "Mixed Workout";
const DEFAULT_REST_DURATION = "00:30";
const UNLABELED_COLOR_COPY = "Unlabeled";

const defaultTemplateFields = {
  reps: true,
  weight: true,
  duration: false,
  distance: false,
};

const defaultTemplateMeasurements = {
  reps: "default",
  weight: "lbs",
  duration: "mm:ss",
  distance: "miles",
  notes: "default",
};

const mixedTemplateFields = {
  reps: true,
  weight: true,
  duration: true,
  distance: true,
  notes: true,
};

const setTypeOptions = [
  { value: "regular", label: "Regular" },
  { value: "warmup", label: "Warmup" },
  { value: "max", label: "Max" },
];

const templateFieldOptions = [
  { key: "reps", label: "Reps", inputType: "number", placeholder: "10" },
  {
    key: "weight",
    label: "Weight",
    inputType: "number",
    placeholder: "135",
    measurementOptions: [
      { value: "lbs", label: "Pounds" },
      { value: "kgs", label: "Kilograms" },
    ],
  },
  { key: "duration", label: "Time", inputType: "text", placeholder: "00:30" },
  {
    key: "distance",
    label: "Distance",
    inputType: "number",
    placeholder: "1.5",
    measurementOptions: [
      { value: "miles", label: "Miles" },
      { value: "kms", label: "Kilometers" },
      { value: "meters", label: "Meters" },
      { value: "feet", label: "Feet" },
    ],
  },
];

function getTodayLocal() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildEmptySet(fields, nextId) {
  return {
    id: nextId,
    setType: "regular",
    ...(fields.reps ? { reps: "" } : {}),
    ...(fields.weight ? { weight: "" } : {}),
    ...(fields.duration ? { duration: "" } : {}),
    ...(fields.distance ? { distance: "" } : {}),
  };
}

function readLoggerDraft() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawDraft = window.localStorage.getItem(LOGGER_DRAFT_KEY);
    if (!rawDraft) {
      return null;
    }

    const draft = JSON.parse(rawDraft);
    return {
      selectedTemplateId: typeof draft?.selectedTemplateId === "string" ? draft.selectedTemplateId : "",
      date: typeof draft?.date === "string" ? draft.date : getTodayLocal(),
      notes: typeof draft?.notes === "string" ? draft.notes : "",
      starred: Boolean(draft?.starred),
      sets: Array.isArray(draft?.sets)
        ? draft.sets.map((set, index) => ({ ...set, id: index + 1 }))
        : [],
    };
  } catch (err) {
    console.error("Failed to restore logger draft:", err);
    return null;
  }
}

function normalizeTemplate(template) {
  return {
    ...template,
    color: getWorkoutColor(template),
    usesRestTimer: Boolean(template?.usesRestTimer),
    restDuration: normalizeRestDuration(template?.restDuration),
    fields: {
      reps: Boolean(template?.fields?.reps),
      weight: Boolean(template?.fields?.weight),
      duration: Boolean(template?.fields?.duration),
      distance: Boolean(template?.fields?.distance),
      notes: true,
    },
    measurements: normalizeTemplateMeasurements(template?.measurements),
  };
}

function buildMixedTemplate() {
  return {
    id: MIXED_WORKOUT_TEMPLATE_ID,
    name: MIXED_WORKOUT_NAME,
    fields: mixedTemplateFields,
    measurements: defaultTemplateMeasurements,
    usesRestTimer: false,
    restDuration: DEFAULT_REST_DURATION,
    isMixed: true,
  };
}

function normalizeTemplateMeasurements(measurements) {
  return {
    reps: defaultTemplateMeasurements.reps,
    weight: measurements?.weight === "kgs" ? "kgs" : defaultTemplateMeasurements.weight,
    duration: defaultTemplateMeasurements.duration,
    distance: ["miles", "kms", "meters", "feet"].includes(measurements?.distance)
      ? measurements.distance
      : defaultTemplateMeasurements.distance,
    notes: defaultTemplateMeasurements.notes,
  };
}

export function Logger({ currentUser = null, setCurrentUser = null }) {
  const mixedTemplate = React.useMemo(() => buildMixedTemplate(), []);
  const storedDraft = React.useMemo(() => readLoggerDraft(), []);
  const [templates, setTemplates] = React.useState([]);
  const [savedWorkouts, setSavedWorkouts] = React.useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState(storedDraft?.selectedTemplateId || "");
  const [selectedTemplate, setSelectedTemplate] = React.useState(null);

  const [sets, setSets] = React.useState(storedDraft?.sets || []);
  const [date, setDate] = React.useState(storedDraft?.date || getTodayLocal());
  const [notes, setNotes] = React.useState(storedDraft?.notes || "");
  const [starred, setStarred] = React.useState(Boolean(storedDraft?.starred));
  const [messages, setMessages] = React.useState([]);
  const [showTemplateModal, setShowTemplateModal] = React.useState(false);
  const [isEditingTemplate, setIsEditingTemplate] = React.useState(false);
  const [templateCreationSource, setTemplateCreationSource] = React.useState("main");
  const [showSetModal, setShowSetModal] = React.useState(false);
  const [showTemplateActions, setShowTemplateActions] = React.useState(false);
  const [editingSetId, setEditingSetId] = React.useState(null);
  const [openSetMenu, setOpenSetMenu] = React.useState(null);
  const [newTemplateName, setNewTemplateName] = React.useState("");
  const [newTemplateColor, setNewTemplateColor] = React.useState(workoutColorPalette[0]);
  const [newTemplateUsesRestTimer, setNewTemplateUsesRestTimer] = React.useState(false);
  const [newTemplateRestDuration, setNewTemplateRestDuration] = React.useState(DEFAULT_REST_DURATION);
  const [newTemplateFields, setNewTemplateFields] = React.useState(defaultTemplateFields);
  const [newTemplateMeasurements, setNewTemplateMeasurements] = React.useState(defaultTemplateMeasurements);
  const [showColorPickerModal, setShowColorPickerModal] = React.useState(false);
  const [editingColorSlot, setEditingColorSlot] = React.useState("");
  const [colorPreferenceDraft, setColorPreferenceDraft] = React.useState({ label: "", color: "" });
  const [pendingSet, setPendingSet] = React.useState(buildEmptySet(defaultTemplateFields, 1));
  const [restTimerSeconds, setRestTimerSeconds] = React.useState(null);
  const [isRestTimerActive, setIsRestTimerActive] = React.useState(false);
  const [showRestTimerModal, setShowRestTimerModal] = React.useState(false);
  const [timeCaptureMode, setTimeCaptureMode] = React.useState(null);
  const [timeCaptureInitialSeconds, setTimeCaptureInitialSeconds] = React.useState(0);
  const hasVibratedForCurrentTimer = React.useRef(false);
  const templateActionsRef = React.useRef(null);
  const setMenuRef = React.useRef(null);
  const templateNameInputRef = React.useRef(null);
  const workoutColorPreferences = React.useMemo(
    () => resolveWorkoutColorPreferences(currentUser?.workoutColorPreferences, currentUser?.workoutColorLabels),
    [currentUser?.workoutColorPreferences, currentUser?.workoutColorLabels]
  );
  const buildWorkoutOption = React.useCallback((template) => {
    const color = getWorkoutColor(template);
    const slotColor = findWorkoutColorSlot(color, workoutColorPreferences);
    const badge = getWorkoutColorPreferenceLabel(slotColor, workoutColorPreferences);

    return {
      value: template.id,
      label: template.name,
      color,
      ...(badge ? { badge, badgeColor: color } : {}),
    };
  }, [workoutColorPreferences]);

  React.useEffect(() => {
    let isMounted = true;

    fetch('/api/workout-templates', {
      method: 'GET',
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) {
          if (response.status === 401) {
            return [];
          }
          throw new Error('Failed to fetch workout templates');
        }
        return response.json();
      })
      .then((savedTemplates) => {
        if (!isMounted) {
          return;
        }

        const normalizedTemplates = savedTemplates.map(normalizeTemplate);
        setTemplates(normalizedTemplates);

      })
      .catch((err) => {
        console.error('Error loading workout templates:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedTemplateId]);

  React.useEffect(() => {
    const template = selectedTemplateId === MIXED_WORKOUT_TEMPLATE_ID
      ? mixedTemplate
      : templates.find((item) => item.id === selectedTemplateId) ?? null;
    setSelectedTemplate(template);
  }, [mixedTemplate, templates, selectedTemplateId]);

  React.useEffect(() => {
    if (!isRestTimerActive || restTimerSeconds === null) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setRestTimerSeconds((currentSeconds) => {
        if (currentSeconds === null) {
          return currentSeconds;
        }

        if (currentSeconds === 1 && !hasVibratedForCurrentTimer.current) {
          hasVibratedForCurrentTimer.current = true;
          vibrate([180, 90, 180]);
          playTimerPing();
        }

        return currentSeconds - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRestTimerActive, restTimerSeconds]);

  React.useEffect(() => {
    let isMounted = true;

    fetch('/api/workouts', {
      method: 'GET',
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) {
          if (response.status === 401) {
            return [];
          }
          throw new Error('Failed to fetch workouts');
        }
        return response.json();
      })
      .then((workouts) => {
        if (isMounted) {
          setSavedWorkouts(workouts);
        }
      })
      .catch((err) => {
        console.error('Error loading workout history:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    const handlePointerDown = (event) => {
      if (!templateActionsRef.current?.contains(event.target)) {
        setShowTemplateActions(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  React.useEffect(() => {
    if (!showTemplateModal) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      templateNameInputRef.current?.focus();
      templateNameInputRef.current?.select?.();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [showTemplateModal]);

  React.useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      if (
        setMenuRef.current?.contains(target)
        || target?.closest?.(".set-menu-trigger")
      ) {
        return;
      }

      setOpenSetMenu(null);
    };

    const handleViewportChange = () => {
      setOpenSetMenu(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, []);

  React.useEffect(() => {
    const normalizedSets = Array.isArray(sets)
      ? sets.map((set, index) => ({ ...set, id: index + 1 }))
      : [];
    if (normalizedSets.length === 0) {
      window.localStorage.removeItem(LOGGER_DRAFT_KEY);
      return;
    }

    window.localStorage.setItem(
      LOGGER_DRAFT_KEY,
        JSON.stringify({
          selectedTemplateId,
          date,
          notes,
          starred,
          sets: normalizedSets,
        })
    );
  }, [selectedTemplateId, date, notes, starred, sets]);

  const activeSetFields = getLoggerVisibleFields(selectedTemplate, sets);
  const pendingSetFields = selectedTemplate?.isMixed
    ? templateFieldOptions.filter((field) => getSetTemplateFields(selectedTemplate, pendingSet, templates)[field.key])
    : activeSetFields;
  const canSubmitWorkout = Boolean(selectedTemplate && date && sets.length > 0);

  React.useEffect(() => {
    const handleGlobalEnterShortcut = (event) => {
      if (
        !shouldUseEnterShortcut(event)
        || showTemplateModal
        || showSetModal
        || !selectedTemplate
        || activeSetFields.length === 0
      ) {
        return;
      }

      event.preventDefault();
      openAddSetModal();
    };

    document.addEventListener("keydown", handleGlobalEnterShortcut);
    return () => {
      document.removeEventListener("keydown", handleGlobalEnterShortcut);
    };
  }, [showTemplateModal, showSetModal, selectedTemplate, activeSetFields.length, sets, savedWorkouts]);

  const handleTemplateSelection = (nextTemplateId) => {
    if (nextTemplateId === CREATE_TEMPLATE_OPTION_ID) {
      openCreateTemplateModal("main");
      return;
    }

    if (nextTemplateId === selectedTemplateId) {
      return;
    }

    const template = nextTemplateId === MIXED_WORKOUT_TEMPLATE_ID
      ? mixedTemplate
      : templates.find((item) => item.id === nextTemplateId) ?? null;

    if (sets.length > 0) {
      const confirmed = window.confirm(
        "Switch workouts? This will discard the sets you've logged for the current workout."
      );

      if (!confirmed) {
        return;
      }
    }

    setSelectedTemplateId(nextTemplateId);
    setNotes("");
    setStarred(false);
    setSets([]);
    setRestTimerSeconds(null);
    setIsRestTimerActive(false);
    setShowRestTimerModal(false);
    if (!template) {
      setDate(getTodayLocal());
    }
  };

  const openCreateTemplateModal = (source = "main") => {
    const nextSource = typeof source === "string" ? source : "main";
    setShowTemplateActions(false);
    setTemplateCreationSource(nextSource);
    setIsEditingTemplate(false);
    setNewTemplateName("");
    setNewTemplateColor(workoutColorPalette[0]);
    setNewTemplateUsesRestTimer(false);
    setNewTemplateRestDuration(DEFAULT_REST_DURATION);
    setNewTemplateFields(defaultTemplateFields);
    setNewTemplateMeasurements(defaultTemplateMeasurements);
    setShowTemplateModal(true);
  };

  const openEditTemplateModal = () => {
    if (!selectedTemplate || selectedTemplate.isMixed) {
      return;
    }

    setShowTemplateActions(false);
    setIsEditingTemplate(true);
    setNewTemplateName(selectedTemplate.name);
    setNewTemplateColor(findWorkoutColorSlot(selectedTemplate.color || workoutColorPalette[0], workoutColorPreferences));
    setNewTemplateUsesRestTimer(Boolean(selectedTemplate.usesRestTimer));
    setNewTemplateRestDuration(normalizeRestDuration(selectedTemplate.restDuration));
    setNewTemplateFields({ ...defaultTemplateFields, ...selectedTemplate.fields });
    setNewTemplateMeasurements({
      ...defaultTemplateMeasurements,
      ...selectedTemplate.measurements,
    });
    setShowTemplateModal(true);
  };

  const closeColorPickerModal = () => {
    setShowColorPickerModal(false);
    setEditingColorSlot("");
    setColorPreferenceDraft({ label: "", color: "" });
  };

  const openColorPickerModal = () => {
    setShowColorPickerModal(true);
    setEditingColorSlot("");
    setColorPreferenceDraft({ label: "", color: "" });
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate || selectedTemplate.isMixed) {
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedTemplate.name}? This will also delete every saved workout logged with that template.`);
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/workout-templates/${selectedTemplate.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        let body = {};
        try {
          body = await response.json();
        } catch (_err) {
          body = {};
        }

        alert(body.msg || 'Failed to delete workout');
        return;
      }

      const remainingTemplates = templates.filter((template) => template.id !== selectedTemplate.id);
      setTemplates(remainingTemplates);
      setSelectedTemplateId(remainingTemplates[0]?.id || "");
      setSelectedTemplate(remainingTemplates[0] || null);
      setSets([]);
      setNotes("");
      setStarred(false);
      setShowTemplateActions(false);
    } catch (err) {
      console.error('Failed to delete workout template:', err);
    }
  };

  const openAddSetModal = () => {
    if (!selectedTemplate) {
      return;
    }

    const nextId = sets.length + 1;
    const defaults = getDefaultSetValues(selectedTemplate, sets, savedWorkouts, templates);
    setEditingSetId(null);
    setOpenSetMenu(null);
    setPendingSet({
      id: nextId,
      ...defaults,
      setType: "regular",
    });
    setTimeCaptureMode(null);
    setShowSetModal(true);
  };

  const openEditSetModal = (setToEdit) => {
    setEditingSetId(setToEdit.id);
    setOpenSetMenu(null);
    setPendingSet({
      id: setToEdit.id,
      ...copyTrackedFields(setToEdit, getSetTemplateFields(selectedTemplate, setToEdit, templates)),
    });
    setTimeCaptureMode(null);
    setShowSetModal(true);
  };

  const closeSetModal = () => {
    setShowSetModal(false);
    setEditingSetId(null);
    setTimeCaptureMode(null);
    setOpenSetMenu(null);
    setPendingSet(getDefaultSetValues(selectedTemplate, sets, savedWorkouts, templates));
  };

  const handlePendingSetChange = (field, value) => {
    if (field === "templateId" && selectedTemplate?.isMixed) {
      if (value === CREATE_TEMPLATE_OPTION_ID) {
        openCreateTemplateModal("mixed-set");
        return;
      }

      const nextTemplate = templates.find((template) => template.id === value) || null;
      if (!nextTemplate) {
        return;
      }

      const defaults = getMixedTemplateDefaultSet(nextTemplate, sets, savedWorkouts);
      setPendingSet((currentSet) => ({
        id: currentSet.id,
        setType: "regular",
        templateId: nextTemplate.id,
        templateName: nextTemplate.name,
        fields: nextTemplate.fields,
        measurements: nextTemplate.measurements,
        ...defaults,
      }));
      setTimeCaptureMode(null);
      return;
    }

    setPendingSet((currentSet) => ({
      ...currentSet,
      [field]: value,
    }));

  };

  const openTimeCaptureModal = (mode) => {
    setTimeCaptureInitialSeconds(parseDurationToSeconds(pendingSet.duration || ""));
    setTimeCaptureMode(mode);
  };

  const closeTimeCaptureModal = () => {
    setTimeCaptureMode(null);
  };

  const handleConfirmTimeCapture = (capturedSeconds) => {
    handlePendingSetChange("duration", formatDuration(capturedSeconds));
    setTimeCaptureMode(null);
  };

  const handleConfirmAddSet = (event) => {
    event.preventDefault();
    const shouldStartRestTimer = editingSetId === null;
    const restDuration = getSetRestDuration(selectedTemplate, pendingSet, templates);
    if (editingSetId !== null) {
      setSets((prevSets) =>
        prevSets.map((set) =>
          set.id === editingSetId
            ? { ...set, ...copyTrackedFields(pendingSet, getSetTemplateFields(selectedTemplate, pendingSet, templates)) }
            : set
        )
      );
    } else {
      setSets((prevSets) => [...prevSets, pendingSet]);
    }
    setShowSetModal(false);
    setEditingSetId(null);
    if (shouldStartRestTimer) {
      startRestTimer(restDuration, shouldUseSetRestTimer(selectedTemplate, pendingSet, templates));
    }
  };

  const startRestTimer = (duration, shouldStart = true) => {
    if (!shouldStart) {
      return;
    }

    const seconds = parseDurationToSeconds(duration);
    primeTimerAudio();
    setRestTimerSeconds(seconds);
    setIsRestTimerActive(true);
    setShowRestTimerModal(true);
    hasVibratedForCurrentTimer.current = seconds <= 0;

    if (seconds <= 0) {
      vibrate([180, 90, 180]);
      playTimerPing();
    }
  };

  const stopRestTimer = () => {
    setIsRestTimerActive(false);
    setShowRestTimerModal(false);
  };

  const handleDeleteSet = (setId) => {
    setOpenSetMenu(null);
    setSets((prevSets) =>
      prevSets
        .filter((set) => set.id !== setId)
        .map((set, index) => ({ ...set, id: index + 1 }))
    );
  };

  const handleTemplateFieldToggle = (fieldKey) => {
    setNewTemplateFields((prevFields) => ({
      ...prevFields,
      [fieldKey]: !prevFields[fieldKey],
    }));
  };

  const handleTemplateMeasurementChange = (fieldKey, value) => {
    setNewTemplateMeasurements((currentMeasurements) => ({
      ...currentMeasurements,
      [fieldKey]: value,
    }));
  };

  const handleModalFormKeyDown = (event) => {
    if (!shouldUseEnterShortcut(event)) {
      return;
    }

    event.preventDefault();
    event.currentTarget.requestSubmit();
  };

  const handleSaveTemplate = async (event) => {
    event.preventDefault();

    if (!newTemplateFields.reps && !newTemplateFields.weight && !newTemplateFields.duration && !newTemplateFields.distance) {
      alert('Choose at least one set field for this workout.');
      return;
    }

    try {
      const response = await fetch(
        isEditingTemplate ? `/api/workout-templates/${selectedTemplate.id}` : '/api/workout-templates',
        {
          method: isEditingTemplate ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName,
          color: getWorkoutColorPreferenceValue(newTemplateColor, workoutColorPreferences),
          usesRestTimer: newTemplateUsesRestTimer,
          restDuration: normalizeRestDuration(newTemplateRestDuration),
          fields: newTemplateFields,
          measurements: newTemplateMeasurements,
        }),
        credentials: 'include',
        }
      );

      const body = await response.json();

      if (!response.ok) {
        alert(body.msg || `Failed to ${isEditingTemplate ? 'update' : 'create'} workout`);
        return;
      }

      const savedTemplate = normalizeTemplate(body);

      setTemplates((prevTemplates) =>
        isEditingTemplate
          ? prevTemplates.map((template) => (template.id === savedTemplate.id ? savedTemplate : template))
          : [...prevTemplates, savedTemplate]
      );

      if (isEditingTemplate) {
        setSavedWorkouts((prevWorkouts) =>
          prevWorkouts.map((workout) => {
            const isDirectMatch = !workout.isMixed && (
              workout.templateId === savedTemplate.id
              || workout.templateName === selectedTemplate?.name
              || workout.exercise === selectedTemplate?.name
            );

            if (isDirectMatch) {
              return {
                ...workout,
                templateId: savedTemplate.id,
                templateName: savedTemplate.name,
                exercise: savedTemplate.name,
                color: savedTemplate.color,
                usesRestTimer: savedTemplate.usesRestTimer,
                fields: savedTemplate.fields,
                measurements: savedTemplate.measurements,
                restDuration: savedTemplate.restDuration,
              };
            }

            if (!workout.isMixed || !Array.isArray(workout.sets)) {
              return workout;
            }

            const updatedSets = workout.sets.map((set) => {
              const isMatchingSet = set?.templateId === savedTemplate.id || set?.templateName === selectedTemplate?.name;
              if (!isMatchingSet) {
                return set;
              }

              return {
                ...set,
                templateId: savedTemplate.id,
                templateName: savedTemplate.name,
                color: savedTemplate.color,
                usesRestTimer: savedTemplate.usesRestTimer,
                fields: savedTemplate.fields,
                measurements: savedTemplate.measurements,
                restDuration: savedTemplate.restDuration,
              };
            });

            return updatedSets.some((set, index) => set !== workout.sets[index])
              ? { ...workout, sets: updatedSets }
              : workout;
          })
        );
        setSelectedTemplateId(savedTemplate.id);
        setSelectedTemplate(savedTemplate);
      } else if (templateCreationSource === "mixed-set" && selectedTemplate?.isMixed) {
        const defaults = getMixedTemplateDefaultSet(savedTemplate, sets, savedWorkouts);
        setPendingSet((currentSet) => ({
          ...defaults,
          id: currentSet.id,
          templateId: savedTemplate.id,
          templateName: savedTemplate.name,
          fields: savedTemplate.fields,
          measurements: savedTemplate.measurements,
          setType: "regular",
        }));
        setTimeCaptureMode(null);
      } else if (sets.length === 0) {
        setSelectedTemplateId(savedTemplate.id);
        setSelectedTemplate(savedTemplate);
        setNotes("");
        setStarred(false);
      }

      setNewTemplateName("");
      setNewTemplateColor(workoutColorPalette[0]);
      setNewTemplateUsesRestTimer(false);
      setNewTemplateRestDuration(DEFAULT_REST_DURATION);
      setNewTemplateFields(defaultTemplateFields);
      setNewTemplateMeasurements(defaultTemplateMeasurements);
      setShowTemplateModal(false);
      setIsEditingTemplate(false);
      setTemplateCreationSource("main");
      closeColorPickerModal();
    } catch (err) {
      console.error(`Failed to ${isEditingTemplate ? 'update' : 'create'} workout template:`, err);
    }
  };

  const startEditingColorPreference = (slotColor) => {
    setEditingColorSlot(slotColor);
    setColorPreferenceDraft({
      label: getWorkoutColorPreferenceLabel(slotColor, workoutColorPreferences),
      color: getWorkoutColorPreferenceValue(slotColor, workoutColorPreferences),
    });
  };

  const handleSaveColorPreference = async (slotColor) => {
    if (!setCurrentUser) {
      return;
    }

    const trimmedLabel = colorPreferenceDraft.label.trim();
    const normalizedColor = /^#[0-9a-f]{6}$/i.test(colorPreferenceDraft.color)
      ? colorPreferenceDraft.color.toLowerCase()
      : getWorkoutColorPreferenceValue(slotColor, workoutColorPreferences);
    const nextPreferences = workoutColorPalette.reduce((preferences, paletteSlot) => ({
      ...preferences,
      [paletteSlot]: {
        ...workoutColorPreferences[paletteSlot],
        ...(paletteSlot === slotColor
          ? {
            label: trimmedLabel,
            color: normalizedColor,
          }
          : {}),
      },
    }), {});
    const colorValues = workoutColorPalette.map((paletteSlot) => nextPreferences[paletteSlot].color);

    if (new Set(colorValues).size !== colorValues.length) {
      alert('Each workout color needs to stay unique.');
      return;
    }

    try {
      const response = await fetch('/api/user/color-preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ workoutColorPreferences: nextPreferences }),
      });

      const body = await response.json();
      if (!response.ok) {
        alert(body.msg || 'Failed to save workout colors');
        return;
      }

      const colorUpdates = workoutColorPalette
        .map((paletteSlot) => ({
          previousColor: getWorkoutColorPreferenceValue(paletteSlot, workoutColorPreferences),
          nextColor: getWorkoutColorPreferenceValue(
            paletteSlot,
            resolveWorkoutColorPreferences(body?.workoutColorPreferences, body?.workoutColorLabels)
          ),
        }))
        .filter(({ previousColor, nextColor }) => previousColor !== nextColor);

      const remapColor = (colorValue) => {
        const matchedUpdate = colorUpdates.find(({ previousColor }) => previousColor === colorValue);
        return matchedUpdate ? matchedUpdate.nextColor : colorValue;
      };

      if (colorUpdates.length > 0) {
        setTemplates((currentTemplates) =>
          currentTemplates.map((template) => ({
            ...template,
            color: remapColor(template.color),
          }))
        );
        setSavedWorkouts((currentWorkouts) =>
          currentWorkouts.map((workout) => ({
            ...workout,
            color: workout.isMixed ? workout.color : remapColor(workout.color),
            sets: Array.isArray(workout.sets)
              ? workout.sets.map((set) => ({
                ...set,
                color: set?.color ? remapColor(set.color) : set.color,
              }))
              : workout.sets,
          }))
        );
      }

      setCurrentUser((current) => ({
        ...(current || {}),
        ...body,
      }));
      setEditingColorSlot("");
      setColorPreferenceDraft({ label: "", color: "" });
    } catch (err) {
      console.error('Failed to save workout colors:', err);
    }
  };

  const selectedTemplateColorLabel = getWorkoutColorPreferenceLabel(newTemplateColor, workoutColorPreferences) || UNLABELED_COLOR_COPY;

  const openSetMenuEntry = React.useMemo(() => {
    if (!openSetMenu) {
      return null;
    }

    return sets.find((set, index) => `${set.id}-${index}` === openSetMenu.rowKey) || null;
  }, [openSetMenu, sets]);

  React.useLayoutEffect(() => {
    if (!openSetMenu || !setMenuRef.current || !openSetMenu.anchorRect) {
      return;
    }

    const menuRect = setMenuRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const footerHeightValue = Number.parseFloat(
      window.getComputedStyle(document.documentElement).getPropertyValue("--footer-height")
    );
    const footerReserve = (Number.isFinite(footerHeightValue) ? footerHeightValue : 76) + 18;
    const maxTop = window.innerHeight - footerReserve - menuRect.height;
    const preferredTop = openSetMenu.anchorRect.bottom + 8;
    const fallbackTop = openSetMenu.anchorRect.top - menuRect.height - 8;
    const nextTop = preferredTop <= maxTop
      ? preferredTop
      : Math.max(viewportPadding, fallbackTop);
    const nextLeft = Math.max(
      viewportPadding,
      Math.min(
        openSetMenu.anchorRect.right - menuRect.width,
        window.innerWidth - menuRect.width - viewportPadding
      )
    );

    if (openSetMenu.top !== nextTop || openSetMenu.left !== nextLeft) {
      setOpenSetMenu((currentMenu) => (
        currentMenu
        && currentMenu.rowKey === openSetMenu.rowKey
        && currentMenu.anchorRect === openSetMenu.anchorRect
          ? { ...currentMenu, top: nextTop, left: nextLeft }
          : currentMenu
      ));
    }
  }, [openSetMenu]);

  const toggleSetMenu = (event, set, index) => {
    event.stopPropagation();

    const rowKey = `${set.id}-${index}`;
    setOpenSetMenu((currentMenu) => {
      if (currentMenu?.rowKey === rowKey) {
        return null;
      }

      const rect = event.currentTarget.getBoundingClientRect();

      return {
        rowKey,
        setId: set.id,
        anchorRect: {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
        top: rect.bottom + 8,
        left: rect.right,
      };
    });
  };

  const closeTemplateModal = () => {
    setShowTemplateModal(false);
    setIsEditingTemplate(false);
    setNewTemplateName("");
    setNewTemplateColor(workoutColorPalette[0]);
    setNewTemplateUsesRestTimer(false);
    setNewTemplateRestDuration(DEFAULT_REST_DURATION);
    setNewTemplateFields(defaultTemplateFields);
    setNewTemplateMeasurements(defaultTemplateMeasurements);
    setTemplateCreationSource("main");

    if (!selectedTemplateId) {
      setSelectedTemplateId("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedTemplate || !date || sets.length === 0) {
      alert('Choose a workout, pick a date, and add at least one set before saving.');
      return;
    }

      const workout = {
      date,
      templateId: selectedTemplate.id,
      notes,
      starred,
      sets,
    };

    try {
      const response = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(workout),
        credentials: 'include',
      });

      const body = await response.json();

      if (!response.ok) {
        alert(body.msg || 'Failed to save workout');
        return;
      }

      setSavedWorkouts((prevWorkouts) => [...prevWorkouts, body]);
      setSelectedTemplateId("");
      setSelectedTemplate(null);
      setDate(getTodayLocal());
      setNotes("");
      setStarred(false);
      setSets([]);
      setRestTimerSeconds(null);
      setIsRestTimerActive(false);
      setShowRestTimerModal(false);
      window.localStorage.removeItem(LOGGER_DRAFT_KEY);
    } catch (err) {
      console.error("Failed to update workouts in service:", err);
    }
  };

  const restTimerDisplaySeconds = restTimerSeconds ?? parseDurationToSeconds(selectedTemplate?.restDuration || DEFAULT_REST_DURATION);
  const restTimerStatus = restTimerDisplaySeconds <= 0
    ? "is-expired"
    : restTimerDisplaySeconds <= 5
      ? "is-warning"
      : "is-running";

  return (
    <main>
      <div className="main-formatting">
        <section className="logger-hero">
          <div>
            <p className="logger-kicker">Logger</p>
            <h2>Log today&apos;s workout.</h2>
          </div>
        </section>

        <form className="workout-form" onSubmit={handleSubmit}>
          <label>
            Date
            <DatePicker
              value={date}
              onChange={setDate}
              ariaLabel="Workout date"
            />
          </label>

          <label>
            Workout
            <div className="template-picker-row">
              <Dropdown
                value={selectedTemplateId}
                onChange={handleTemplateSelection}
                placeholder="Select a workout"
                searchable
                searchPlaceholder="Search workouts"
                options={[
                  { value: CREATE_TEMPLATE_OPTION_ID, label: "Create workout", variant: "create" },
                  { value: "", label: "Select a workout", disabled: true },
                  { value: MIXED_WORKOUT_TEMPLATE_ID, label: MIXED_WORKOUT_NAME, badge: "New", badgeColor: "#f4b95e", color: "#f4b95e" },
                  ...templates.map(buildWorkoutOption),
                ]}
                ariaLabel="Workout"
              />
              <div className="template-actions-menu" ref={templateActionsRef}>
                <button
                  type="button"
                  className="template-actions-trigger"
                  aria-label="Workout template actions"
                  onClick={() => setShowTemplateActions((current) => !current)}
                >
                  ...
                </button>
                {showTemplateActions && (
                  <div className="template-actions-popover">
                    <button
                      type="button"
                      className="template-actions-item"
                      onClick={openCreateTemplateModal}
                    >
                      Create new workout
                    </button>
                    <button
                      type="button"
                      className="template-actions-item"
                      onClick={openEditTemplateModal}
                      disabled={!selectedTemplate || selectedTemplate.isMixed}
                    >
                      Edit selected workout
                    </button>
                    <button
                      type="button"
                      className="template-actions-item delete"
                      onClick={handleDeleteTemplate}
                      disabled={!selectedTemplate || selectedTemplate.isMixed}
                    >
                      Delete selected workout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </label>

          {selectedTemplate && activeSetFields.length > 0 && (
            <section>
              <div className="section-header">
                <div>
                  <h3>Sets</h3>
                  <p className="logger-workout-subtitle">
                    <span
                      className="logger-workout-color"
                      style={{ backgroundColor: getWorkoutColor(selectedTemplate) }}
                      aria-hidden="true"
                    />
                    {selectedTemplate.name}
                  </p>
                </div>
                <button
                  type="button"
                  className="add-set-button"
                  onClick={openAddSetModal}
                >
                  + Add Set
                </button>
              </div>

              {sets.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Set</th>
                      {selectedTemplate?.isMixed && <th>Workout</th>}
                      {activeSetFields.map((field) => (
                        <th key={field.key}>{getFieldLabel(field, selectedTemplate.measurements)}</th>
                      ))}
                      <th className="set-actions-header"></th>
                    </tr>
                  </thead>
                    <tbody>
                    {sets.map((set, index) => (
                      <tr key={set.id}>
                        <td>{getSetDisplayLabel(set, sets, index)}</td>
                        {selectedTemplate?.isMixed && (
                          <td className="logger-mixed-workout-cell">
                            <span
                              className="logger-inline-workout"
                              style={{ '--workout-color': getWorkoutColor(set) }}
                            >
                              <span className="logger-inline-workout-dot" aria-hidden="true" />
                              {set.templateName || "Mixed set"}
                            </span>
                          </td>
                        )}
                        {activeSetFields.map((field) => (
                          <td key={field.key}>{set[field.key] ?? ""}</td>
                        ))}
                        <td className="set-actions-cell">
                          <div className="set-actions-menu">
                            <button
                              type="button"
                              className="set-menu-trigger"
                              aria-label={`Manage set ${set.id}`}
                              aria-expanded={openSetMenu?.rowKey === `${set.id}-${index}`}
                              onClick={(event) => toggleSetMenu(event, set, index)}
                            >
                              ...
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-sets-state">
                  <p>No sets logged yet.</p>
                </div>
              )}
            </section>
          )}

          <label>
            Notes
            <textarea
              rows="3"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          {selectedTemplate && activeSetFields.length === 0 && (
            <section>
              <p className="empty-template-note">
                This workout template does not currently collect any log fields.
              </p>
            </section>
          )}

          <button type="submit" className="btn btn-primary" disabled={!canSubmitWorkout}>Save Workout</button>
        </form>
      </div>

      {showTemplateModal && (
        <div
          className={templateCreationSource === "mixed-set"
            ? "template-modal-backdrop is-stacked-modal"
            : "template-modal-backdrop"}
          role="presentation"
        >
          <div className="template-modal" role="dialog" aria-modal="true" aria-labelledby="create-workout-title">
            <button type="button" className="template-close-button is-icon" onClick={closeTemplateModal} aria-label="Close workout template editor">
              ×
            </button>
            <div className="template-modal-header">
              <div>
                <p className="template-eyebrow">New Workout</p>
                <h2 id="create-workout-title">Build your workout template</h2>
              </div>
              <div className="modal-header-actions">
                <button type="submit" form="workout-template-form" className="btn btn-primary">
                  {isEditingTemplate ? "Save" : "Create"}
                </button>
              </div>
            </div>

            <form id="workout-template-form" className="template-modal-form" onSubmit={handleSaveTemplate} onKeyDown={handleModalFormKeyDown}>
              <label>
                Workout name
                <input
                  ref={templateNameInputRef}
                  type="text"
                  placeholder="Bench Press"
                  value={newTemplateName}
                  onChange={(event) => setNewTemplateName(event.target.value)}
                  required
                />
              </label>

              <section className="template-color-panel">
                <div className="section-header">
                  <h3>Theme color</h3>
                  <p>Assign a color label system that works for you.</p>
                </div>
                <button
                  type="button"
                  className="template-color-picker-trigger"
                  onClick={openColorPickerModal}
                >
                  <span className="template-color-picker-preview">
                    <span
                      className="template-color-swatch"
                      style={{ "--template-color": getWorkoutColorPreferenceValue(newTemplateColor, workoutColorPreferences) }}
                      aria-hidden="true"
                    />
                    <span className="template-color-picker-copy">
                      <strong>{selectedTemplateColorLabel}</strong>
                    </span>
                  </span>
                  <span className="template-color-picker-action">Change</span>
                </button>
              </section>

              <section className="template-rest-panel">
                <div className="section-header">
                  <h3>Rest timer</h3>
                  <p>Optionally start a timer after saving a set.</p>
                </div>
                <label className="template-rest-toggle">
                  <input
                    type="checkbox"
                    checked={newTemplateUsesRestTimer}
                    onChange={(event) => setNewTemplateUsesRestTimer(event.target.checked)}
                  />
                  Use a rest timer for this workout
                </label>
                <label className={!newTemplateUsesRestTimer ? "template-rest-duration is-disabled" : "template-rest-duration"}>
                  Default rest
                  <input
                    type="text"
                    value={newTemplateRestDuration}
                    placeholder={DEFAULT_REST_DURATION}
                    disabled={!newTemplateUsesRestTimer}
                    onChange={(event) => setNewTemplateRestDuration(event.target.value)}
                    onBlur={() => setNewTemplateRestDuration((currentValue) => normalizeRestDuration(currentValue))}
                  />
                </label>
              </section>

              <section className="template-fields-panel">
                <div className="section-header">
                  <h3>Choose the fields you want every time</h3>
                  <p>Pick what this workout tracks.</p>
                </div>
                <div className="template-field-grid">
                  {templateFieldOptions.map((field) => (
                    <label key={field.key} className="template-field-card">
                      <input
                        type="checkbox"
                        checked={newTemplateFields[field.key]}
                        onChange={() => handleTemplateFieldToggle(field.key)}
                      />
                      <div className="template-field-content">
                        <span>{field.label}</span>
                        {field.measurementOptions && newTemplateFields[field.key] && (
                          <Dropdown
                            value={newTemplateMeasurements[field.key]}
                            onChange={(nextValue) => handleTemplateMeasurementChange(field.key, nextValue)}
                            options={field.measurementOptions}
                            ariaLabel={`${field.label} units`}
                          />
                        )}
                        {field.lockedMeasurement && (
                          <small>{field.lockedMeasurement}</small>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              <div className="template-preview">
                <p className="template-preview-title">Preview</p>
                <p className="template-preview-copy">
                  {formatTemplatePreview(newTemplateName, newTemplateFields, newTemplateMeasurements)}
                </p>
              </div>

              <div className="template-modal-actions">
                <button type="button" className="template-close-button" onClick={closeTemplateModal} aria-label="Close workout template editor">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {isEditingTemplate ? "Save" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSetModal && selectedTemplate && (
        <div className="template-modal-backdrop" role="presentation">
          <div className="template-modal set-modal" role="dialog" aria-modal="true" aria-labelledby="add-set-title">
            <div className="template-modal-header">
              <div>
                <p className="template-eyebrow">New Set</p>
                <h2 id="add-set-title">Add a set for {selectedTemplate.name}</h2>
              </div>
            </div>

            <form className="template-modal-form" onSubmit={handleConfirmAddSet} onKeyDown={handleModalFormKeyDown}>
              <section className="template-fields-panel">
                <div className="set-modal-grid">
                  {selectedTemplate?.isMixed && (
                    <label>
                      Workout
                      <Dropdown
                        value={pendingSet.templateId || templates[0]?.id || ""}
                        onChange={(nextValue) => handlePendingSetChange("templateId", nextValue)}
                        searchable
                        searchPlaceholder="Search workouts"
                        options={[
                          { value: CREATE_TEMPLATE_OPTION_ID, label: "Create workout", variant: "create" },
                          ...templates.map(buildWorkoutOption),
                        ]}
                        ariaLabel="Set workout"
                      />
                    </label>
                  )}
                  <label>
                    Set type
                    <Dropdown
                      value={pendingSet.setType || "regular"}
                      onChange={(nextValue) => handlePendingSetChange("setType", nextValue)}
                      options={setTypeOptions}
                      ariaLabel="Set type"
                    />
                  </label>
                  {pendingSetFields.map((field) => (
                    shouldShowSetField(field.key, selectedTemplate, pendingSet)
                      ? (
                    <label key={field.key}>
                      {getFieldLabel(field, getSetMeasurements(selectedTemplate, pendingSet))}
                      <MobileSetField
                        field={field}
                        measurements={getSetMeasurements(selectedTemplate, pendingSet)}
                        value={pendingSet[field.key] ?? ""}
                        onChange={(nextValue) => handlePendingSetChange(field.key, nextValue)}
                      />
                      {field.key === "duration" && (
                        <div className="duration-capture-buttons">
                          <button type="button" onClick={() => openTimeCaptureModal("stopwatch")}>
                            Stopwatch
                          </button>
                          <button type="button" onClick={() => openTimeCaptureModal("timer")}>
                            Timer
                          </button>
                        </div>
                      )}
                    </label>
                      ) : null
                  ))}
                </div>
              </section>

              <div className="template-modal-actions">
                <button type="button" className="btn btn-outline-light" onClick={closeSetModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingSetId !== null ? "Save Changes" : "Save Set"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showColorPickerModal && (
        <div className="template-modal-backdrop is-stacked-modal" role="presentation">
          <div className="template-modal color-picker-modal" role="dialog" aria-modal="true" aria-labelledby="color-picker-title">
            <button type="button" className="template-close-button is-icon" onClick={closeColorPickerModal} aria-label="Close color picker">
              ×
            </button>
            <div className="template-modal-header">
              <div>
                <p className="template-eyebrow">Workout Colors</p>
                <h2 id="color-picker-title">Pick a color label</h2>
              </div>
              <div className="modal-header-actions">
                <button type="button" className="btn btn-primary" onClick={closeColorPickerModal}>
                  Done
                </button>
              </div>
            </div>

            <div className="template-modal-form">
              <section className="template-color-panel">
                <div className="template-color-list" role="list" aria-label="Workout colors">
                  {workoutColorPalette.map((slotColor) => {
                    const isSelected = newTemplateColor === slotColor;
                    const isEditing = editingColorSlot === slotColor;
                    const rawLabel = getWorkoutColorPreferenceLabel(slotColor, workoutColorPreferences);
                    const label = rawLabel || UNLABELED_COLOR_COPY;
                    const isUnlabeled = !rawLabel;
                    const displayColor = getWorkoutColorPreferenceValue(slotColor, workoutColorPreferences);

                    return (
                      <div
                        key={slotColor}
                        className={isSelected ? "template-color-row is-selected" : "template-color-row"}
                        style={{ "--template-color": displayColor }}
                        role="listitem"
                      >
                        <button
                          type="button"
                          className="template-color-row-main"
                          onClick={() => setNewTemplateColor(slotColor)}
                        >
                          <span className="template-color-swatch" style={{ "--template-color": displayColor }} aria-hidden="true" />
                          <span className={isUnlabeled ? "template-color-row-copy is-unlabeled" : "template-color-row-copy"}>
                            <strong>{label}</strong>
                          </span>
                        </button>
                        <div className="template-color-row-actions">
                          <button
                            type="button"
                            className="template-color-icon-button"
                            aria-label={`Edit ${label} color`}
                            onClick={() => startEditingColorPreference(slotColor)}
                          >
                            ✎
                          </button>
                        </div>
                        {isEditing && (
                          <div className="template-color-label-editor">
                            <label className="template-color-editor-row">
                              <span>Color</span>
                              <div className="template-color-editor-input">
                                <input
                                  type="color"
                                  value={colorPreferenceDraft.color || displayColor}
                                  onChange={(event) => setColorPreferenceDraft((currentDraft) => ({
                                    ...currentDraft,
                                    color: event.target.value.toLowerCase(),
                                  }))}
                                />
                                <input
                                  type="text"
                                  value={colorPreferenceDraft.color || displayColor}
                                  onChange={(event) => setColorPreferenceDraft((currentDraft) => ({
                                    ...currentDraft,
                                    color: event.target.value,
                                  }))}
                                  placeholder="#3b82f6"
                                  maxLength={7}
                                />
                              </div>
                            </label>
                            <input
                              type="text"
                              value={colorPreferenceDraft.label}
                              placeholder="Upper Body, Push, Cardio..."
                              onChange={(event) => setColorPreferenceDraft((currentDraft) => ({
                                ...currentDraft,
                                label: event.target.value,
                              }))}
                              maxLength={32}
                            />
                            <div className="template-color-label-actions">
                              <button
                                type="button"
                                className="template-close-button"
                                onClick={() => {
                                  setEditingColorSlot("");
                                  setColorPreferenceDraft({ label: "", color: "" });
                                }}
                              >
                                Cancel
                              </button>
                              <button type="button" className="btn btn-primary" onClick={() => handleSaveColorPreference(slotColor)}>
                                Save
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {showRestTimerModal && (
        <div className="template-modal-backdrop rest-timer-modal-backdrop" role="presentation">
          <div
            className={`rest-timer-modal ${restTimerStatus}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rest-timer-title"
          >
            <p className="rest-timer-kicker">Rest Timer</p>
            <h2 id="rest-timer-title">{formatSignedDuration(restTimerDisplaySeconds)}</h2>
            <p className="rest-timer-copy">
              {restTimerDisplaySeconds <= 0
                ? "Rest is up. Start when you're ready."
                : "Resting between sets."}
            </p>
            <button type="button" className="rest-timer-stop-button" onClick={stopRestTimer}>
              Stop
            </button>
          </div>
        </div>
      )}

      {timeCaptureMode && (
        <TimeCaptureModal
          mode={timeCaptureMode}
          initialSeconds={timeCaptureInitialSeconds}
          onConfirm={handleConfirmTimeCapture}
          onClose={closeTimeCaptureModal}
        />
      )}
      {openSetMenu && openSetMenuEntry && typeof document !== "undefined" && createPortal(
        <div
          ref={setMenuRef}
          className="set-menu-popover is-floating"
          style={{ top: `${openSetMenu.top}px`, left: `${openSetMenu.left}px` }}
        >
          <button
            type="button"
            className="set-menu-item"
            onClick={() => openEditSetModal(openSetMenuEntry)}
          >
            Edit
          </button>
          <button
            type="button"
            className="set-menu-item delete"
            onClick={() => handleDeleteSet(openSetMenu.setId)}
          >
            Delete
          </button>
        </div>,
        document.body
      )}
    </main>
  );
}

function getDefaultSetValues(selectedTemplate, currentSets, savedWorkouts, templates = []) {
  if (!selectedTemplate) {
    return {};
  }

  if (selectedTemplate.isMixed) {
    const lastCurrentMixedSet = currentSets.length > 0 ? currentSets[currentSets.length - 1] : null;
    if (lastCurrentMixedSet) {
      const sourceTemplate = templates.find((template) => template.id === lastCurrentMixedSet.templateId) || null;
      return {
        ...copyTrackedFields(lastCurrentMixedSet, getSetTemplateFields(selectedTemplate, lastCurrentMixedSet, templates)),
        templateId: lastCurrentMixedSet.templateId || sourceTemplate?.id || templates[0]?.id || "",
        templateName: lastCurrentMixedSet.templateName || sourceTemplate?.name || templates[0]?.name || "",
        fields: sourceTemplate?.fields || lastCurrentMixedSet.fields || templates[0]?.fields || defaultTemplateFields,
        measurements: sourceTemplate?.measurements || lastCurrentMixedSet.measurements || templates[0]?.measurements || defaultTemplateMeasurements,
      };
    }

    const fallbackTemplate = templates[0] || null;
    if (!fallbackTemplate) {
      return buildEmptySet(defaultTemplateFields, 1);
    }

    return {
      ...getMixedTemplateDefaultSet(fallbackTemplate, currentSets, savedWorkouts),
      templateId: fallbackTemplate.id,
      templateName: fallbackTemplate.name,
      fields: fallbackTemplate.fields,
      measurements: fallbackTemplate.measurements,
      setType: "regular",
    };
  }

  if (currentSets.length > 0) {
    const lastCurrentSet = currentSets[currentSets.length - 1];
    return copyTrackedFields(lastCurrentSet, selectedTemplate.fields);
  }

  const previousSet = findLastSavedSet(savedWorkouts, selectedTemplate);
  if (previousSet) {
    return copyTrackedFields(previousSet, selectedTemplate.fields);
  }

  return buildEmptySet(selectedTemplate.fields, 1);
}

function getMixedTemplateDefaultSet(template, currentSets, savedWorkouts) {
  const currentMatchingSet = [...currentSets].reverse().find((set) => set.templateId === template.id);
  if (currentMatchingSet) {
    return copyTrackedFields(currentMatchingSet, template.fields);
  }

  const previousSet = findLastSavedSet(savedWorkouts, template);
  if (previousSet) {
    return copyTrackedFields(previousSet, template.fields);
  }

  return buildEmptySet(template.fields, 1);
}

function MobileSetField({ field, measurements, value, onChange }) {
  if (field.key === "duration") {
    const durationParts = parseDurationParts(value);
    const minuteOptions = buildIntegerWheelOptions(0, 59);
    const secondOptions = buildIntegerWheelOptions(0, 59);
    const selectedMinutes = getClosestWheelValue(minuteOptions, durationParts.minutes, "0");
    const selectedSeconds = getClosestWheelValue(secondOptions, durationParts.seconds, "0");

    return (
      <div className="mobile-duration-picker">
        <div className="mobile-wheel-field">
          <WheelPicker
            value={selectedMinutes}
            options={minuteOptions}
            onChange={(nextMinutes) => onChange(formatDurationValue(nextMinutes, selectedSeconds))}
            ariaLabel="Minutes"
          />
          <span className="input-unit">min</span>
        </div>
        <div className="mobile-wheel-field">
          <WheelPicker
            value={selectedSeconds}
            options={secondOptions}
            onChange={(nextSeconds) => onChange(formatDurationValue(selectedMinutes, nextSeconds))}
            ariaLabel="Seconds"
          />
          <span className="input-unit">sec</span>
        </div>
      </div>
    );
  }

  const wheelOptions = buildFieldWheelOptions(field, measurements);
  const selectedValue = getClosestWheelValue(wheelOptions, value, wheelOptions[0]?.value || "0");

  return (
    <div className="mobile-wheel-field">
      <WheelPicker
        value={selectedValue}
        options={wheelOptions}
        onChange={onChange}
        ariaLabel={field.label}
      />
      {getFieldUnitSuffix(field, measurements) && (
        <span className="input-unit">
          {getFieldUnitSuffix(field, measurements)}
        </span>
      )}
    </div>
  );
}

function findLastSavedSet(savedWorkouts, selectedTemplate) {
  for (let index = savedWorkouts.length - 1; index >= 0; index -= 1) {
    const workout = savedWorkouts[index];
    const mixedSetMatch = Array.isArray(workout.sets)
      ? [...workout.sets].reverse().find((set) => set.templateId === selectedTemplate.id || set.templateName === selectedTemplate.name)
      : null;
    const isMatchingWorkout = workout.templateId === selectedTemplate.id
      || workout.templateName === selectedTemplate.name
      || workout.exercise === selectedTemplate.name;

    if (mixedSetMatch) {
      return mixedSetMatch;
    }

    if (!isMatchingWorkout || !Array.isArray(workout.sets) || workout.sets.length === 0) {
      continue;
    }

    return workout.sets[workout.sets.length - 1];
  }

  return null;
}

function copyTrackedFields(sourceSet, fields) {
  return {
    setType: normalizeSetType(sourceSet?.setType),
    ...(sourceSet?.templateId ? { templateId: sourceSet.templateId } : {}),
    ...(sourceSet?.templateName ? { templateName: sourceSet.templateName } : {}),
    ...(sourceSet?.fields ? { fields: sourceSet.fields } : {}),
    ...(sourceSet?.measurements ? { measurements: sourceSet.measurements } : {}),
    ...(fields.reps ? { reps: sourceSet?.reps ?? "" } : {}),
    ...(fields.weight ? { weight: sourceSet?.weight ?? "" } : {}),
    ...(fields.duration ? { duration: sourceSet?.duration ?? "" } : {}),
    ...(fields.distance ? { distance: sourceSet?.distance ?? "" } : {}),
  };
}

function getLoggerVisibleFields(selectedTemplate, sets) {
  if (!selectedTemplate) {
    return [];
  }

  if (!selectedTemplate.isMixed) {
    return templateFieldOptions.filter((field) => selectedTemplate?.fields?.[field.key]);
  }

  const visibleKeys = new Set();
  sets.forEach((set) => {
    const fields = set.fields || {};
    Object.keys(fields).forEach((key) => {
      if (fields[key]) {
        visibleKeys.add(key);
      }
    });
  });

  if (visibleKeys.size === 0) {
    templateFieldOptions.forEach((field) => visibleKeys.add(field.key));
  }

  return templateFieldOptions.filter((field) => visibleKeys.has(field.key));
}

function getSetTemplateFields(selectedTemplate, set, templates = []) {
  if (!selectedTemplate?.isMixed) {
    return selectedTemplate?.fields || defaultTemplateFields;
  }

  const matchedTemplate = templates.find((template) => template.id === set?.templateId) || null;
  return matchedTemplate?.fields || set?.fields || defaultTemplateFields;
}

function getSetMeasurements(selectedTemplate, set) {
  if (!selectedTemplate?.isMixed) {
    return selectedTemplate?.measurements || defaultTemplateMeasurements;
  }

  return set?.measurements || defaultTemplateMeasurements;
}

function shouldShowSetField(fieldKey, selectedTemplate, set) {
  if (!selectedTemplate?.isMixed) {
    return Boolean(selectedTemplate?.fields?.[fieldKey]);
  }

  return Boolean(getSetTemplateFields(selectedTemplate, set)[fieldKey]);
}

function formatTemplatePreview(name, fields, measurements = defaultTemplateMeasurements) {
  const selectedFields = [
    fields.reps && "reps",
    fields.weight && `weight (${formatMeasurementLabel(measurements.weight)})`,
    fields.duration && "duration",
    fields.distance && `distance (${formatMeasurementLabel(measurements.distance)})`,
    "notes",
  ].filter(Boolean);

  return `${name.trim() || "Your new workout"} will save ${selectedFields.join(", ")}.`;
}

function normalizeSetType(value) {
  return ["regular", "warmup", "max"].includes(value) ? value : "regular";
}

function formatColorHexLabel(color) {
  return `${color}`.toUpperCase();
}

function getSetDisplayLabel(set, sets, index) {
  const setType = normalizeSetType(set?.setType);

  if (setType === "warmup") {
    return "Warmup";
  }

  if (setType === "max") {
    return "Max";
  }

  const regularIndex = sets
    .slice(0, index + 1)
    .filter((currentSet) => normalizeSetType(currentSet?.setType) === "regular")
    .length;

  return regularIndex;
}

function getFieldLabel(field, measurements = defaultTemplateMeasurements) {
  if (field.key === "weight") {
    return `Weight (${formatMeasurementLabel(measurements?.weight)})`;
  }

  if (field.key === "distance") {
    return `Distance (${formatMeasurementLabel(measurements?.distance)})`;
  }

  if (field.key === "duration") {
    return "Time";
  }

  return field.label;
}

function formatMeasurementLabel(value) {
  switch (value) {
    case "lbs":
      return "lbs";
    case "kgs":
      return "kg";
    case "kms":
      return "km";
    case "meters":
      return "m";
    case "feet":
      return "ft";
    case "miles":
      return "mi";
    default:
      return value || "default";
  }
}

function getFieldUnitSuffix(field, measurements = defaultTemplateMeasurements) {
  if (field.key === "weight") {
    return formatMeasurementLabel(measurements?.weight);
  }

  if (field.key === "distance") {
    return formatMeasurementLabel(measurements?.distance);
  }

  return "";
}

function parseDurationParts(duration) {
  if (!duration) {
    return { minutes: "", seconds: "" };
  }

  const parts = `${duration}`.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return { minutes: "", seconds: "" };
  }

  if (parts.length === 2) {
    return {
      minutes: String(parts[0]),
      seconds: String(parts[1]),
    };
  }

  if (parts.length === 3) {
    return {
      minutes: String(parts[0] * 60 + parts[1]),
      seconds: String(parts[2]),
    };
  }

  return { minutes: "", seconds: "" };
}

function parseDurationToSeconds(duration) {
  if (!duration) {
    return parseDurationToSeconds(DEFAULT_REST_DURATION);
  }

  const parts = `${duration}`.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part) || part < 0)) {
    return parseDurationToSeconds(DEFAULT_REST_DURATION);
  }

  if (parts.length === 2) {
    return Math.floor(parts[0] * 60 + parts[1]);
  }

  if (parts.length === 3) {
    return Math.floor(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  const seconds = Number(duration);
  return Number.isNaN(seconds) ? parseDurationToSeconds(DEFAULT_REST_DURATION) : Math.max(0, Math.floor(seconds));
}

function normalizeRestDuration(duration) {
  return formatDuration(parseDurationToSeconds(duration));
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Math.abs(totalSeconds)));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatSignedDuration(totalSeconds) {
  const prefix = totalSeconds < 0 ? "-" : "";
  return `${prefix}${formatDuration(totalSeconds)}`;
}

function getSetRestDuration(selectedTemplate, set, templates = []) {
  if (selectedTemplate?.isMixed) {
    const setTemplate = templates.find((template) => template.id === set?.templateId);
    return setTemplate?.restDuration || DEFAULT_REST_DURATION;
  }

  return selectedTemplate?.restDuration || DEFAULT_REST_DURATION;
}

function shouldUseSetRestTimer(selectedTemplate, set, templates = []) {
  if (selectedTemplate?.isMixed) {
    const setTemplate = templates.find((template) => template.id === set?.templateId);
    return Boolean(setTemplate?.usesRestTimer);
  }

  return Boolean(selectedTemplate?.usesRestTimer);
}

function clampDurationPart(value, max) {
  if (value === "") {
    return "";
  }

  const parsedValue = Number(value);
  if (Number.isNaN(parsedValue)) {
    return "";
  }

  return String(Math.max(0, Math.min(max, parsedValue)));
}

function formatDurationValue(minutes, seconds) {
  if (minutes === "" && seconds === "") {
    return "";
  }

  const safeMinutes = minutes === "" ? "0" : minutes;
  const safeSeconds = seconds === "" ? "0" : seconds;

  return `${String(safeMinutes).padStart(2, "0")}:${String(safeSeconds).padStart(2, "0")}`;
}

function buildFieldWheelOptions(field, measurements) {
  if (field.key === "reps") {
    return buildIntegerWheelOptions(0, 40);
  }

  if (field.key === "weight") {
    return measurements?.weight === "kgs"
      ? buildDecimalWheelOptions(0, 250, 2.5)
      : buildIntegerWheelOptions(0, 500, 5);
  }

  if (field.key === "distance") {
    if (measurements?.distance === "meters" || measurements?.distance === "feet") {
      return buildIntegerWheelOptions(0, 10000, 100);
    }

    return buildDecimalWheelOptions(0, 20, 0.1);
  }

  return buildIntegerWheelOptions(0, 30);
}

function buildIntegerWheelOptions(start, end, step = 1) {
  const options = [];

  for (let current = start; current <= end; current += step) {
    options.push({
      value: String(current),
      label: String(current),
    });
  }

  return options;
}

function buildDecimalWheelOptions(start, end, step) {
  const options = [];
  const decimalPlaces = getStepDecimals(step);

  for (let current = start; current <= end + step / 2; current += step) {
    const roundedValue = current.toFixed(decimalPlaces);
    options.push({
      value: trimTrailingZeroes(roundedValue),
      label: trimTrailingZeroes(roundedValue),
    });
  }

  return options;
}

function getClosestWheelValue(options, currentValue, fallbackValue) {
  if (!options.length) {
    return fallbackValue;
  }

  if (!currentValue) {
    return fallbackValue;
  }

  const exactMatch = options.find((option) => option.value === `${currentValue}`);
  if (exactMatch) {
    return exactMatch.value;
  }

  const parsedValue = Number(currentValue);
  if (Number.isNaN(parsedValue)) {
    return fallbackValue;
  }

  let closestOption = options[0];
  let smallestDistance = Math.abs(Number(closestOption.value) - parsedValue);

  options.forEach((option) => {
    const optionDistance = Math.abs(Number(option.value) - parsedValue);
    if (optionDistance < smallestDistance) {
      closestOption = option;
      smallestDistance = optionDistance;
    }
  });

  return closestOption.value;
}

function getStepDecimals(step) {
  const stepValue = `${step}`;
  const decimalPart = stepValue.split(".")[1];
  return decimalPart ? decimalPart.length : 0;
}

function trimTrailingZeroes(value) {
  return `${Number(value)}`;
}

function shouldUseEnterShortcut(event) {
  if (
    event.key !== "Enter"
    || event.defaultPrevented
    || event.shiftKey
    || event.altKey
    || event.ctrlKey
    || event.metaKey
  ) {
    return false;
  }

  const target = event.target;
  const tagName = target?.tagName?.toLowerCase();

  if (tagName === "textarea" || tagName === "button") {
    return false;
  }

  if (target?.closest?.(".qs-dropdown.is-open") || target?.closest?.(".qs-date-picker.is-open")) {
    return false;
  }

  return true;
}
