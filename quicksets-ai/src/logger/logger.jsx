import React from 'react';
import "./logger.css";
import { Dropdown } from "../components/dropdown";

const LOGGER_DRAFT_KEY = "quicksets.loggerDraft";

const mockMessages = [
  { msg: "Started a workout 💪" },
  { msg: "Hit a new PR 🔥" },
  { msg: "Just finished leg day 🦵" },
];

const defaultTemplateFields = {
  reps: true,
  weight: true,
  duration: false,
  distance: false,
  notes: true,
};

const defaultTemplateMeasurements = {
  reps: "default",
  weight: "lbs",
  duration: "hh:mm:ss",
  distance: "miles",
  notes: "default",
};

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
    fields: {
      reps: Boolean(template?.fields?.reps),
      weight: Boolean(template?.fields?.weight),
      duration: Boolean(template?.fields?.duration),
      distance: Boolean(template?.fields?.distance),
      notes: Boolean(template?.fields?.notes),
    },
    measurements: normalizeTemplateMeasurements(template?.measurements),
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
  const storedDraft = React.useMemo(() => readLoggerDraft(), []);
  const [templates, setTemplates] = React.useState([]);
  const [savedWorkouts, setSavedWorkouts] = React.useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState(storedDraft?.selectedTemplateId || "");
  const [selectedTemplate, setSelectedTemplate] = React.useState(null);

  const [sets, setSets] = React.useState(storedDraft?.sets || []);
  const [date, setDate] = React.useState(storedDraft?.date || getTodayLocal());
  const [notes, setNotes] = React.useState(storedDraft?.notes || "");
  const [messages, setMessages] = React.useState([]);
  const [showTemplateModal, setShowTemplateModal] = React.useState(false);
  const [isEditingTemplate, setIsEditingTemplate] = React.useState(false);
  const [showSetModal, setShowSetModal] = React.useState(false);
  const [showTemplateActions, setShowTemplateActions] = React.useState(false);
  const [editingSetId, setEditingSetId] = React.useState(null);
  const [openSetMenuId, setOpenSetMenuId] = React.useState(null);
  const [newTemplateName, setNewTemplateName] = React.useState("");
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

        if (normalizedTemplates.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(normalizedTemplates[0].id);
        }
      })
      .catch((err) => {
        console.error('Error loading workout templates:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedTemplateId]);

  React.useEffect(() => {
    const template = templates.find((item) => item.id === selectedTemplateId) ?? null;
    setSelectedTemplate(template);
  }, [templates, selectedTemplateId]);

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
    let index = 0;

    const interval = setInterval(() => {
      const userName = `User-${Math.floor(Math.random() * 100)}`;
      const newMessage = {
        id: Date.now(),
        msg: mockMessages[index % mockMessages.length].msg,
        from: userName,
      };

      setMessages((prev) => [...prev, newMessage]);

      setTimeout(() => {
        setMessages((prev) => prev.filter((message) => message.id !== newMessage.id));
      }, 10000);

      index++;
    }, 10000);

    return () => clearInterval(interval);
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
    const hasDraftContent = Boolean(
      selectedTemplateId
      || notes.trim()
      || normalizedSets.length > 0
      || date !== getTodayLocal()
    );

    if (!hasDraftContent) {
      window.localStorage.removeItem(LOGGER_DRAFT_KEY);
      return;
    }

    window.localStorage.setItem(
      LOGGER_DRAFT_KEY,
      JSON.stringify({
        selectedTemplateId,
        date,
        notes,
        sets: normalizedSets,
      })
    );
  }, [selectedTemplateId, date, notes, sets]);

  const activeSetFields = templateFieldOptions.filter(
    (field) => selectedTemplate?.fields?.[field.key]
  );
  const canSubmitWorkout = Boolean(selectedTemplate && date && sets.length > 0);

  const handleTemplateSelection = (event) => {
    const nextTemplateId = event.target.value;

    const template = templates.find((item) => item.id === nextTemplateId) ?? null;
    setSelectedTemplateId(nextTemplateId);
    setNotes("");
    setSets([]);
    if (!template) {
      setDate(getTodayLocal());
    }
  };

  const openCreateTemplateModal = () => {
    setShowTemplateActions(false);
    setIsEditingTemplate(false);
    setNewTemplateName("");
    setNewTemplateFields(defaultTemplateFields);
    setNewTemplateMeasurements(defaultTemplateMeasurements);
    setShowTemplateModal(true);
  };

  const openEditTemplateModal = () => {
    if (!selectedTemplate) {
      return;
    }

    setShowTemplateActions(false);
    setIsEditingTemplate(true);
    setNewTemplateName(selectedTemplate.name);
    setNewTemplateFields({ ...defaultTemplateFields, ...selectedTemplate.fields });
    setNewTemplateMeasurements({
      ...defaultTemplateMeasurements,
      ...selectedTemplate.measurements,
    });
    setShowTemplateModal(true);
  };

  const openAddSetModal = () => {
    if (!selectedTemplate) {
      return;
    }

    const nextId = sets.length + 1;
    const defaults = getDefaultSetValues(selectedTemplate, sets, savedWorkouts);
    setEditingSetId(null);
    setOpenSetMenuId(null);
    setPendingSet({
      id: nextId,
      ...defaults,
    });
    setShowSetModal(true);
  };

  const openEditSetModal = (setToEdit) => {
    setEditingSetId(setToEdit.id);
    setOpenSetMenuId(null);
    setPendingSet({
      id: setToEdit.id,
      ...copyTrackedFields(setToEdit, selectedTemplate.fields),
    });
    setShowSetModal(true);
  };

  const closeSetModal = () => {
    setShowSetModal(false);
    setEditingSetId(null);
    setPendingSet(buildEmptySet(selectedTemplate?.fields || defaultTemplateFields, sets.length + 1));
  };

  const handlePendingSetChange = (field, value) => {
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
            ? { ...set, ...copyTrackedFields(pendingSet, selectedTemplate.fields) }
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
      setSelectedTemplateId(savedTemplate.id);
      setSelectedTemplate(savedTemplate);
      setSets([]);
      setNotes("");

      setNewTemplateName("");
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
      notes: selectedTemplate.fields.notes ? notes : "",
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
      setDate(getTodayLocal());
      setNotes("");
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

        <section className="live-feed">
          <p className="feed-title">Live Feed</p>
          {messages.map((message) => (
            <p key={message.id}>
              <strong>{message.from}</strong>: {message.msg}
            </p>
          ))}
        </section>
        <form className="workout-form" onSubmit={handleSubmit}>
          <label>
            Date
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
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
                  ...templates.map((template) => ({ value: template.id, label: template.name })),
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
                      disabled={!selectedTemplate}
                    >
                      Edit selected workout
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
                  <p>{selectedTemplate.name}</p>
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
                      <th>#</th>
                      {activeSetFields.map((field) => (
                        <th key={field.key}>{getFieldLabel(field, selectedTemplate.measurements)}</th>
                      ))}
                      <th className="set-actions-header"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sets.map((set) => (
                      <tr key={set.id}>
                        <td>{set.id}</td>
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
                  <span>New sets reuse your last numbers.</span>
                </div>
              )}
            </section>
          )}

          {selectedTemplate?.fields.notes && (
            <label>
              Notes
              <textarea
                rows="3"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          )}

          {selectedTemplate && activeSetFields.length === 0 && !selectedTemplate.fields.notes && (
            <section>
              <p className="empty-template-note">
                This workout template does not currently collect any log fields.
              </p>
            </section>
          )}

          <button type="submit" className="btn btn-primary" disabled={!canSubmitWorkout}>Save Workout</button>
        </form>
        <a className="github-link" href="https://github.com/SethHales/MyStartup">GitHub</a>
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

            <form className="template-modal-form" onSubmit={handleSaveTemplate}>
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
                  <label className="template-field-card">
                    <input
                      type="checkbox"
                      checked={newTemplateFields.notes}
                      onChange={() => handleTemplateFieldToggle("notes")}
                    />
                    <div className="template-field-content">
                      <span>Notes</span>
                    </div>
                  </label>
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
              <button type="button" className="template-close-button" onClick={closeSetModal}>
                Close
              </button>
            </div>

            <form className="template-modal-form" onSubmit={handleConfirmAddSet}>
              <section className="template-fields-panel">
                <div className="section-header">
                  <h3>{editingSetId !== null ? `Edit Set #${pendingSet.id}` : `Set #${pendingSet.id}`}</h3>
                  <p>Prefilled from your latest matching set.</p>
                </div>
                <div className="set-modal-grid">
                  {activeSetFields.map((field) => (
                    <label key={field.key}>
                      {getFieldLabel(field, selectedTemplate.measurements)}
                      <div className="input-with-unit">
                        <input
                          type={field.inputType}
                          value={pendingSet[field.key] ?? ""}
                          placeholder={field.placeholder}
                          onChange={(event) => handlePendingSetChange(field.key, event.target.value)}
                        />
                        {getFieldUnitSuffix(field, selectedTemplate.measurements) && (
                          <span className="input-unit">
                            {getFieldUnitSuffix(field, selectedTemplate.measurements)}
                          </span>
                        )}
                      </div>
                    </label>
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

function getDefaultSetValues(selectedTemplate, currentSets, savedWorkouts) {
  if (!selectedTemplate) {
    return {};
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

function findLastSavedSet(savedWorkouts, selectedTemplate) {
  for (let index = savedWorkouts.length - 1; index >= 0; index -= 1) {
    const workout = savedWorkouts[index];
    const isMatchingWorkout = workout.templateId === selectedTemplate.id
      || workout.templateName === selectedTemplate.name
      || workout.exercise === selectedTemplate.name;

    if (!isMatchingWorkout || !Array.isArray(workout.sets) || workout.sets.length === 0) {
      continue;
    }

    return workout.sets[workout.sets.length - 1];
  }

  return null;
}

function copyTrackedFields(sourceSet, fields) {
  return {
    ...(fields.reps ? { reps: sourceSet?.reps ?? "" } : {}),
    ...(fields.weight ? { weight: sourceSet?.weight ?? "" } : {}),
    ...(fields.duration ? { duration: sourceSet?.duration ?? "" } : {}),
    ...(fields.distance ? { distance: sourceSet?.distance ?? "" } : {}),
  };
}

function formatTemplatePreview(name, fields, measurements = defaultTemplateMeasurements) {
  const selectedFields = [
    fields.reps && "reps",
    fields.weight && `weight (${formatMeasurementLabel(measurements.weight)})`,
    fields.duration && "duration (hh:mm:ss)",
    fields.distance && `distance (${formatMeasurementLabel(measurements.distance)})`,
    fields.notes && "notes",
  ].filter(Boolean);

  return `${name.trim() || "Your new workout"} will save ${selectedFields.join(", ")}.`;
}

function getFieldLabel(field, measurements = defaultTemplateMeasurements) {
  if (field.key === "weight") {
    return `Weight (${formatMeasurementLabel(measurements?.weight)})`;
  }

  if (field.key === "distance") {
    return `Distance (${formatMeasurementLabel(measurements?.distance)})`;
  }

  if (field.key === "duration") {
    return "Time (HH:MM:SS)";
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
