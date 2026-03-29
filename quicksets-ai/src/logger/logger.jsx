import React from 'react';
import "./logger.css";

const CREATE_NEW_TEMPLATE = "__create_new_template__";

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

const templateFieldOptions = [
  { key: "reps", label: "Reps", inputType: "number", placeholder: "10" },
  { key: "weight", label: "Weight", inputType: "number", placeholder: "135" },
  { key: "duration", label: "Time", inputType: "text", placeholder: "00:30" },
  { key: "distance", label: "Distance", inputType: "number", placeholder: "1.5" },
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
  };
}

export function Logger() {
  const [templates, setTemplates] = React.useState([]);
  const [savedWorkouts, setSavedWorkouts] = React.useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState("");
  const [selectedTemplate, setSelectedTemplate] = React.useState(null);

  const [sets, setSets] = React.useState([]);
  const [date, setDate] = React.useState(getTodayLocal());
  const [notes, setNotes] = React.useState("");
  const [messages, setMessages] = React.useState([]);
  const [showTemplateModal, setShowTemplateModal] = React.useState(false);
  const [showSetModal, setShowSetModal] = React.useState(false);
  const [editingSetId, setEditingSetId] = React.useState(null);
  const [openSetMenuId, setOpenSetMenuId] = React.useState(null);
  const [newTemplateName, setNewTemplateName] = React.useState("");
  const [newTemplateFields, setNewTemplateFields] = React.useState(defaultTemplateFields);
  const [pendingSet, setPendingSet] = React.useState(buildEmptySet(defaultTemplateFields, 1));

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

        if (normalizedTemplates.length > 0) {
          setSelectedTemplateId(normalizedTemplates[0].id);
          setSelectedTemplate(normalizedTemplates[0]);
        }
      })
      .catch((err) => {
        console.error('Error loading workout templates:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

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

  const activeSetFields = templateFieldOptions.filter(
    (field) => selectedTemplate?.fields?.[field.key]
  );

  const handleTemplateSelection = (event) => {
    const nextTemplateId = event.target.value;

    if (nextTemplateId === CREATE_NEW_TEMPLATE) {
      setShowTemplateModal(true);
      return;
    }

    const template = templates.find((item) => item.id === nextTemplateId) ?? null;
    setSelectedTemplateId(nextTemplateId);
    setSelectedTemplate(template);
    setNotes("");
    setSets([]);
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

  const handleCreateTemplate = async (event) => {
    event.preventDefault();

    try {
      const response = await fetch('/api/workout-templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName,
          fields: newTemplateFields,
        }),
        credentials: 'include',
      });

      const body = await response.json();

      if (!response.ok) {
        alert(body.msg || 'Failed to create workout');
        return;
      }

      const createdTemplate = normalizeTemplate(body);

      setTemplates((prevTemplates) => [...prevTemplates, createdTemplate]);
      setSelectedTemplateId(createdTemplate.id);
      setSelectedTemplate(createdTemplate);
      setSets([]);
      setNotes("");

      setNewTemplateName("");
      setNewTemplateFields(defaultTemplateFields);
      setShowTemplateModal(false);
    } catch (err) {
      console.error('Failed to create workout template:', err);
    }
  };

  const closeTemplateModal = () => {
    setShowTemplateModal(false);
    setNewTemplateName("");
    setNewTemplateFields(defaultTemplateFields);

    if (!selectedTemplateId) {
      setSelectedTemplateId("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedTemplate) {
      alert('Choose a workout from the dropdown first.');
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
    } catch (err) {
      console.error("Failed to update workouts in service:", err);
    }
  };

  return (
    <main>
      <div className="main-formatting">
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
            <select
              value={selectedTemplateId}
              onChange={handleTemplateSelection}
              required
            >
              <option value="" disabled>Select a workout</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
              <option value={CREATE_NEW_TEMPLATE}>Create new workout</option>
            </select>
          </label>

          {selectedTemplate && activeSetFields.length > 0 && (
            <section>
              <div className="section-header">
                <div>
                  <h3>Sets</h3>
                  <p>{selectedTemplate.name} always tracks these fields.</p>
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
                        <th key={field.key}>{field.label}</th>
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
                  <span>
                    The add-set modal will preload the last values you used for this workout.
                  </span>
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

          <button type="submit" className="btn btn-primary">Save Workout</button>
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

            <form className="template-modal-form" onSubmit={handleCreateTemplate}>
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
                  <p>You can mix set fields and workout-level notes.</p>
                </div>
                <div className="template-field-grid">
                  {templateFieldOptions.map((field) => (
                    <label key={field.key} className="template-field-card">
                      <input
                        type="checkbox"
                        checked={newTemplateFields[field.key]}
                        onChange={() => handleTemplateFieldToggle(field.key)}
                      />
                      <span>{field.label}</span>
                    </label>
                  ))}
                  <label className="template-field-card">
                    <input
                      type="checkbox"
                      checked={newTemplateFields.notes}
                      onChange={() => handleTemplateFieldToggle("notes")}
                    />
                    <span>Notes</span>
                  </label>
                </div>
              </section>

              <div className="template-preview">
                <p className="template-preview-title">Preview</p>
                <p className="template-preview-copy">
                  {formatTemplatePreview(newTemplateName, newTemplateFields)}
                </p>
              </div>

              <div className="template-modal-actions">
                <button type="button" className="btn btn-outline-light" onClick={closeTemplateModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create workout
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
                  <p>Fields are prefilled from your most recent matching set when available.</p>
                </div>
                <div className="set-modal-grid">
                  {activeSetFields.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      <input
                        type={field.inputType}
                        value={pendingSet[field.key] ?? ""}
                        placeholder={field.placeholder}
                        onChange={(event) => handlePendingSetChange(field.key, event.target.value)}
                      />
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

function formatTemplatePreview(name, fields) {
  const selectedFields = [
    fields.reps && "reps",
    fields.weight && "weight",
    fields.duration && "duration",
    fields.distance && "distance",
    fields.notes && "notes",
  ].filter(Boolean);

  return `${name.trim() || "Your new workout"} will save ${selectedFields.join(", ")}.`;
}
