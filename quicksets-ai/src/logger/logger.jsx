import React from 'react';
import "./logger.css";
import { Dropdown } from "../components/dropdown";
import { DatePicker } from "../components/datePicker";
import { useIsMobile } from "../hooks/useIsMobile";
import { WheelPicker } from "../components/wheelPicker";
import { getWorkoutColor, workoutColorPalette } from "../utils/workoutColors";

const LOGGER_DRAFT_KEY = "quicksets.loggerDraft";
const MIXED_WORKOUT_TEMPLATE_ID = "__mixed_workout__";
const MIXED_WORKOUT_NAME = "Mixed Workout";

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
      sets: Array.isArray(draft?.sets) ? draft.sets : [],
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

export function Logger() {
  const mixedTemplate = React.useMemo(() => buildMixedTemplate(), []);
  const storedDraft = React.useMemo(() => readLoggerDraft(), []);
  const isMobile = useIsMobile();
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
  const [showSetModal, setShowSetModal] = React.useState(false);
  const [showTemplateActions, setShowTemplateActions] = React.useState(false);
  const [editingSetId, setEditingSetId] = React.useState(null);
  const [openSetMenuId, setOpenSetMenuId] = React.useState(null);
  const [newTemplateName, setNewTemplateName] = React.useState("");
  const [newTemplateColor, setNewTemplateColor] = React.useState(workoutColorPalette[0]);
  const [newTemplateFields, setNewTemplateFields] = React.useState(defaultTemplateFields);
  const [newTemplateMeasurements, setNewTemplateMeasurements] = React.useState(defaultTemplateMeasurements);
  const [pendingSet, setPendingSet] = React.useState(buildEmptySet(defaultTemplateFields, 1));
  const templateActionsRef = React.useRef(null);

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

  const handleTemplateSelection = (event) => {
    const nextTemplateId = event.target.value;

    const template = nextTemplateId === MIXED_WORKOUT_TEMPLATE_ID
      ? mixedTemplate
      : templates.find((item) => item.id === nextTemplateId) ?? null;
    setSelectedTemplateId(nextTemplateId);
    setNotes("");
    setStarred(false);
    setSets([]);
    if (!template) {
      setDate(getTodayLocal());
    }
  };

  const openCreateTemplateModal = () => {
    setShowTemplateActions(false);
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
    setNewTemplateColor(selectedTemplate.color || workoutColorPalette[0]);
    setNewTemplateFields({ ...defaultTemplateFields, ...selectedTemplate.fields });
    setNewTemplateMeasurements({
      ...defaultTemplateMeasurements,
      ...selectedTemplate.measurements,
    });
    setShowTemplateModal(true);
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
    setOpenSetMenuId(null);
    setPendingSet({
      id: nextId,
      ...defaults,
      setType: "regular",
    });
    setShowSetModal(true);
  };

  const openEditSetModal = (setToEdit) => {
    setEditingSetId(setToEdit.id);
    setOpenSetMenuId(null);
    setPendingSet({
      id: setToEdit.id,
      ...copyTrackedFields(setToEdit, getSetTemplateFields(selectedTemplate, setToEdit, templates)),
    });
    setShowSetModal(true);
  };

  const closeSetModal = () => {
    setShowSetModal(false);
    setEditingSetId(null);
    setPendingSet(getDefaultSetValues(selectedTemplate, sets, savedWorkouts, templates));
  };

  const handlePendingSetChange = (field, value) => {
    if (field === "templateId" && selectedTemplate?.isMixed) {
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
      return;
    }

    setPendingSet((currentSet) => ({
      ...currentSet,
      [field]: value,
    }));
  };

  const handleConfirmAddSet = (event) => {
    event.preventDefault();
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
  };

  const handleDeleteSet = (setId) => {
    setOpenSetMenuId(null);
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
          color: newTemplateColor,
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
      setSets([]);
      setNotes("");
      setStarred(false);

      setNewTemplateName("");
      setNewTemplateColor(workoutColorPalette[0]);
      setNewTemplateFields(defaultTemplateFields);
      setNewTemplateMeasurements(defaultTemplateMeasurements);
      setShowTemplateModal(false);
      setIsEditingTemplate(false);
    } catch (err) {
      console.error(`Failed to ${isEditingTemplate ? 'update' : 'create'} workout template:`, err);
    }
  };

  const closeTemplateModal = () => {
    setShowTemplateModal(false);
    setIsEditingTemplate(false);
    setNewTemplateName("");
    setNewTemplateColor(workoutColorPalette[0]);
    setNewTemplateFields(defaultTemplateFields);
    setNewTemplateMeasurements(defaultTemplateMeasurements);

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
      window.localStorage.removeItem(LOGGER_DRAFT_KEY);
    } catch (err) {
      console.error("Failed to update workouts in service:", err);
    }
  };

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
                onChange={(nextValue) => handleTemplateSelection({ target: { value: nextValue } })}
                placeholder="Select a workout"
                options={[
                  { value: "", label: "Select a workout", disabled: true },
                  { value: MIXED_WORKOUT_TEMPLATE_ID, label: MIXED_WORKOUT_NAME, badge: "New", color: "#f4b95e" },
                  ...templates.map((template) => ({ value: template.id, label: template.name, color: getWorkoutColor(template) })),
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
                              onClick={() =>
                                setOpenSetMenuId((currentId) =>
                                  currentId === set.id ? null : set.id
                                )
                              }
                            >
                              ...
                            </button>
                            {openSetMenuId === set.id && (
                              <div className="set-menu-popover">
                                <button
                                  type="button"
                                  className="set-menu-item"
                                  onClick={() => openEditSetModal(set)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="set-menu-item delete"
                                  onClick={() => handleDeleteSet(set.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
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
        <div className="template-modal-backdrop" role="presentation">
          <div className="template-modal" role="dialog" aria-modal="true" aria-labelledby="create-workout-title">
            <div className="template-modal-header">
              <div>
                <p className="template-eyebrow">New Workout</p>
                <h2 id="create-workout-title">Build your workout template</h2>
              </div>
              <button type="button" className="template-close-button" onClick={closeTemplateModal}>
                Close
              </button>
            </div>

            <form className="template-modal-form" onSubmit={handleSaveTemplate} onKeyDown={handleModalFormKeyDown}>
              <label>
                Workout name
                <input
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
                  <p>Choose the color this workout uses across the app.</p>
                </div>
                <div className="template-color-grid" role="radiogroup" aria-label="Workout color">
                  {workoutColorPalette.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={newTemplateColor === color}
                      className={newTemplateColor === color ? "template-color-option is-selected" : "template-color-option"}
                      style={{ "--template-color": color }}
                      onClick={() => setNewTemplateColor(color)}
                    >
                      <span className="template-color-swatch" aria-hidden="true" />
                    </button>
                  ))}
                </div>
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
                <button type="button" className="btn btn-outline-light" onClick={closeTemplateModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {isEditingTemplate ? "Save workout" : "Create workout"}
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
                        options={templates.map((template) => ({ value: template.id, label: template.name, color: getWorkoutColor(template) }))}
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
                  {activeSetFields.map((field) => (
                    shouldShowSetField(field.key, selectedTemplate, pendingSet)
                      ? (
                    <label key={field.key}>
                      {getFieldLabel(field, getSetMeasurements(selectedTemplate, pendingSet))}
                      {isMobile ? (
                        <MobileSetField
                          field={field}
                          measurements={getSetMeasurements(selectedTemplate, pendingSet)}
                          value={pendingSet[field.key] ?? ""}
                          onChange={(nextValue) => handlePendingSetChange(field.key, nextValue)}
                        />
                      ) : (
                        <div className="input-with-unit">
                          <input
                            type={field.inputType}
                            value={pendingSet[field.key] ?? ""}
                            placeholder={field.placeholder}
                            onChange={(event) => handlePendingSetChange(field.key, event.target.value)}
                          />
                          {getFieldUnitSuffix(field, getSetMeasurements(selectedTemplate, pendingSet)) && (
                            <span className="input-unit">
                              {getFieldUnitSuffix(field, getSetMeasurements(selectedTemplate, pendingSet))}
                            </span>
                          )}
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
