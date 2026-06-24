import React from 'react';
import "./logger.css";
import { Dropdown } from "../components/dropdown";
import { DatePicker } from "../components/datePicker";
import { SessionSetTable } from "../components/sessionSetTable";
import { SetEditorModal } from "../components/setEditorModal";
import { TimeCaptureModal } from "../components/timeCaptureModal";
import { formatDuration } from "../utils/workoutDomain";
import {
  copyTrackedFields,
  formatColorHexLabel,
  formatTemplatePreview,
  getDefaultSetValues,
  getFieldLabel,
  getLoggerVisibleFields,
  getSetMeasurements,
  getSetTemplateFields,
  parseDurationToSeconds,
  shouldUseEnterShortcut,
} from "./loggerHelpers";
import {
  findWorkoutColorSlot,
  getWorkoutColor,
  getWorkoutColorPreferenceLabel,
  getWorkoutColorPreferenceValue,
  resolveWorkoutColorPreferences,
  workoutColorPalette,
} from "../utils/workoutColors";
import { apiFetch } from "../utils/apiFetch";

const LOGGER_DRAFT_KEY = "quicksets.loggerDraft";
const MIXED_WORKOUT_TEMPLATE_ID = "__mixed_workout__";
const CREATE_TEMPLATE_OPTION_ID = "__create_workout_template__";
const MIXED_WORKOUT_NAME = "Full Workout";
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

export function Logger({
  currentUser = null,
  setCurrentUser = null,
  onSetLogged = null,
  onClearRestStopwatch = null,
}) {
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
  const [newTemplateName, setNewTemplateName] = React.useState("");
  const [newTemplateColor, setNewTemplateColor] = React.useState(workoutColorPalette[0]);
  const [newTemplateFields, setNewTemplateFields] = React.useState(defaultTemplateFields);
  const [newTemplateMeasurements, setNewTemplateMeasurements] = React.useState(defaultTemplateMeasurements);
  const [showColorPickerModal, setShowColorPickerModal] = React.useState(false);
  const [editingColorSlot, setEditingColorSlot] = React.useState("");
  const [colorPreferenceDraft, setColorPreferenceDraft] = React.useState({ label: "", color: "" });
  const [pendingSet, setPendingSet] = React.useState(buildEmptySet(defaultTemplateFields, 1));
  const [timeCaptureMode, setTimeCaptureMode] = React.useState(null);
  const [timeCaptureInitialSeconds, setTimeCaptureInitialSeconds] = React.useState(0);
  const templateActionsRef = React.useRef(null);
  const templateNameInputRef = React.useRef(null);
  const submitFormOnPointerUp = React.useCallback((event) => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const blockGhostClick = (clickEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      document.removeEventListener("click", blockGhostClick, true);
    };

    document.addEventListener("click", blockGhostClick, true);
    window.setTimeout(() => {
      document.removeEventListener("click", blockGhostClick, true);
    }, 400);

    event.currentTarget.form?.requestSubmit();
  }, []);
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

    apiFetch('/api/workout-templates', {
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
    let isMounted = true;

    apiFetch('/api/workouts', {
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

    const handleViewportChange = () => {
      setShowTemplateActions(false);
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

  const activeSetFields = getLoggerVisibleFields(selectedTemplate, sets, templateFieldOptions);
  const pendingSetFields = selectedTemplate?.isMixed
    ? templateFieldOptions.filter((field) => getSetTemplateFields(selectedTemplate, pendingSet, templates, defaultTemplateFields)[field.key])
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
        "Switch exercises? This will discard the sets you've logged for the current session."
      );

      if (!confirmed) {
        return;
      }
    }

    setSelectedTemplateId(nextTemplateId);
    setNotes("");
    setStarred(false);
    setSets([]);
    onClearRestStopwatch?.();
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

    const confirmed = window.confirm(`Delete ${selectedTemplate.name}? This will also delete every saved session logged for that exercise.`);
    if (!confirmed) {
      return;
    }

    try {
      const response = await apiFetch(`/api/workout-templates/${selectedTemplate.id}`, {
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

        alert(body.msg || 'Failed to delete exercise');
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
      console.error('Failed to delete exercise template:', err);
    }
  };

  const openAddSetModal = () => {
    if (!selectedTemplate) {
      return;
    }

    const nextId = sets.length + 1;
    const defaults = getDefaultSetValues(selectedTemplate, sets, savedWorkouts, templates, defaultTemplateFields, defaultTemplateMeasurements, buildEmptySet);
    setEditingSetId(null);
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
    setPendingSet({
      id: setToEdit.id,
      ...copyTrackedFields(setToEdit, getSetTemplateFields(selectedTemplate, setToEdit, templates, defaultTemplateFields)),
    });
    setTimeCaptureMode(null);
    setShowSetModal(true);
  };

  const closeSetModal = () => {
    setShowSetModal(false);
    setEditingSetId(null);
    setTimeCaptureMode(null);
    setPendingSet(getDefaultSetValues(selectedTemplate, sets, savedWorkouts, templates, defaultTemplateFields, defaultTemplateMeasurements, buildEmptySet));
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
    if (editingSetId !== null) {
      setSets((prevSets) =>
        prevSets.map((set) =>
          set.id === editingSetId
            ? { ...set, ...copyTrackedFields(pendingSet, getSetTemplateFields(selectedTemplate, pendingSet, templates, defaultTemplateFields)) }
            : set
        )
      );
    } else {
      setSets((prevSets) => [...prevSets, pendingSet]);
      onSetLogged?.();
    }
    setShowSetModal(false);
    setEditingSetId(null);
  };

  const handleDeleteSet = (setId) => {
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
      alert('Choose at least one set field for this exercise.');
      return;
    }

    try {
      const response = await apiFetch(
        isEditingTemplate ? `/api/workout-templates/${selectedTemplate.id}` : '/api/workout-templates',
        {
          method: isEditingTemplate ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName,
          color: getWorkoutColorPreferenceValue(newTemplateColor, workoutColorPreferences),
          fields: newTemplateFields,
          measurements: newTemplateMeasurements,
        }),
        credentials: 'include',
        }
      );

      const body = await response.json();

      if (!response.ok) {
        alert(body.msg || `Failed to ${isEditingTemplate ? 'update' : 'create'} exercise`);
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
                fields: savedTemplate.fields,
                measurements: savedTemplate.measurements,
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
                fields: savedTemplate.fields,
                measurements: savedTemplate.measurements,
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
      setNewTemplateFields(defaultTemplateFields);
      setNewTemplateMeasurements(defaultTemplateMeasurements);
      setShowTemplateModal(false);
      setIsEditingTemplate(false);
      setTemplateCreationSource("main");
      closeColorPickerModal();
    } catch (err) {
      console.error(`Failed to ${isEditingTemplate ? 'update' : 'create'} exercise template:`, err);
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
      alert('Each exercise color needs to stay unique.');
      return;
    }

    try {
      const response = await apiFetch('/api/user/color-preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ workoutColorPreferences: nextPreferences }),
      });

      const body = await response.json();
      if (!response.ok) {
        alert(body.msg || 'Failed to save exercise colors');
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
      console.error('Failed to save exercise colors:', err);
    }
  };

  const selectedTemplateColorLabel = getWorkoutColorPreferenceLabel(newTemplateColor, workoutColorPreferences) || UNLABELED_COLOR_COPY;

  const closeTemplateModal = () => {
    setShowTemplateModal(false);
    setIsEditingTemplate(false);
    setNewTemplateName("");
    setNewTemplateColor(workoutColorPalette[0]);
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
      alert('Choose an exercise, pick a date, and add at least one set before saving.');
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
      const response = await apiFetch('/api/workouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(workout),
        credentials: 'include',
      });

      const body = await response.json();

      if (!response.ok) {
        alert(body.msg || 'Failed to save session');
        return;
      }

      setSavedWorkouts((prevWorkouts) => [...prevWorkouts, body]);
      setSelectedTemplateId("");
      setSelectedTemplate(null);
      setDate(getTodayLocal());
      setNotes("");
      setStarred(false);
      setSets([]);
      onClearRestStopwatch?.();
      window.localStorage.removeItem(LOGGER_DRAFT_KEY);
    } catch (err) {
      console.error("Failed to update sessions in service:", err);
    }
  };

  return (
    <main>
      <div className="main-formatting">
        <section className="logger-hero">
          <div>
            <p className="logger-kicker">Logger</p>
            <h2>Log today&apos;s session.</h2>
          </div>
        </section>

        <form className="workout-form" onSubmit={handleSubmit}>
          <label>
            Date
            <DatePicker
              value={date}
              onChange={setDate}
              ariaLabel="Session date"
            />
          </label>

          <label>
            Exercise
            <div className="template-picker-row">
              <Dropdown
                value={selectedTemplateId}
                onChange={handleTemplateSelection}
                placeholder="Select an exercise"
                searchable
                searchPlaceholder="Search exercises"
                options={[
                  { value: CREATE_TEMPLATE_OPTION_ID, label: "Create exercise", variant: "create" },
                  { value: "", label: "Select an exercise", disabled: true },
                  { value: MIXED_WORKOUT_TEMPLATE_ID, label: MIXED_WORKOUT_NAME, badge: "New", badgeColor: "#f4b95e", color: "#f4b95e" },
                  ...templates.map(buildWorkoutOption),
                ]}
                ariaLabel="Exercise"
              />
              <div className="template-actions-menu" ref={templateActionsRef}>
                <button
                  type="button"
                  className="template-actions-trigger"
                  aria-label="Exercise actions"
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
                      Create new exercise
                    </button>
                    <button
                      type="button"
                      className="template-actions-item"
                      onClick={openEditTemplateModal}
                      disabled={!selectedTemplate || selectedTemplate.isMixed}
                    >
                      Edit selected exercise
                    </button>
                    <button
                      type="button"
                      className="template-actions-item delete"
                      onClick={handleDeleteTemplate}
                      disabled={!selectedTemplate || selectedTemplate.isMixed}
                    >
                      Delete selected exercise
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
                <SessionSetTable
                  sets={sets}
                  fields={activeSetFields}
                  measurements={selectedTemplate.measurements}
                  isMixed={selectedTemplate?.isMixed}
                  onEditSet={openEditSetModal}
                  onDeleteSet={handleDeleteSet}
                />
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
                This exercise does not currently collect any log fields.
              </p>
            </section>
          )}

          <button type="submit" className="btn btn-primary" disabled={!canSubmitWorkout}>Save Session</button>
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
            <button type="button" className="template-close-button is-icon" onClick={closeTemplateModal} aria-label="Close exercise editor">
              ×
            </button>
            <div className="template-modal-header">
              <div>
                <p className="template-eyebrow">New Exercise</p>
                <h2 id="create-workout-title">Build your exercise</h2>
              </div>
              <div className="modal-header-actions">
                <button type="submit" form="workout-template-form" className="btn btn-primary">
                  {isEditingTemplate ? "Save" : "Create"}
                </button>
              </div>
            </div>

            <form id="workout-template-form" className="template-modal-form" onSubmit={handleSaveTemplate} onKeyDown={handleModalFormKeyDown}>
              <label>
                Exercise name
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

              <section className="template-fields-panel">
                <div className="section-header">
                  <h3>Choose the fields you want every time</h3>
                  <p>Pick what this exercise tracks.</p>
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
                <button type="button" className="template-close-button" onClick={closeTemplateModal} aria-label="Close exercise editor">
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
        <SetEditorModal
          eyebrow={editingSetId !== null ? "Edit Set" : "New Set"}
          title={`${editingSetId !== null ? "Edit" : "Add"} a set for ${selectedTemplate.name}`}
          pendingSet={pendingSet}
          fields={pendingSetFields}
          measurements={getSetMeasurements(selectedTemplate, pendingSet, defaultTemplateMeasurements)}
          isMixed={selectedTemplate?.isMixed}
          allowExerciseChange={selectedTemplate?.isMixed}
          exerciseOptions={[
            { value: CREATE_TEMPLATE_OPTION_ID, label: "Create exercise", variant: "create" },
            ...templates.map(buildWorkoutOption),
          ]}
          setTypeOptions={setTypeOptions}
          submitLabel={editingSetId !== null ? "Save Changes" : "Save Set"}
          onChange={handlePendingSetChange}
          onSubmit={handleConfirmAddSet}
          onClose={closeSetModal}
          onKeyDown={handleModalFormKeyDown}
          onPointerUpSubmit={submitFormOnPointerUp}
          renderFieldActions={(field) => field.key === "duration" ? (
            <div className="duration-capture-buttons">
              <button type="button" onClick={() => openTimeCaptureModal("stopwatch")}>
                Stopwatch
              </button>
              <button type="button" onClick={() => openTimeCaptureModal("timer")}>
                Timer
              </button>
            </div>
          ) : null}
        />
      )}

      {showColorPickerModal && (
        <div className="template-modal-backdrop is-stacked-modal" role="presentation">
          <div className="template-modal color-picker-modal" role="dialog" aria-modal="true" aria-labelledby="color-picker-title">
            <button type="button" className="template-close-button is-icon" onClick={closeColorPickerModal} aria-label="Close color picker">
              ×
            </button>
            <div className="template-modal-header">
              <div>
                <p className="template-eyebrow">Exercise Colors</p>
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
                <div className="template-color-list" role="list" aria-label="Exercise colors">
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
                          onClick={() => {
                            setNewTemplateColor(slotColor);
                            closeColorPickerModal();
                          }}
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

      {timeCaptureMode && (
        <TimeCaptureModal
          mode={timeCaptureMode}
          initialSeconds={timeCaptureInitialSeconds}
          onConfirm={handleConfirmTimeCapture}
          onClose={closeTimeCaptureModal}
        />
      )}
    </main>
  );
}
