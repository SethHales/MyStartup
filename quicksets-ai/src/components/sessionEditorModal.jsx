import React from "react";
import { createPortal } from "react-dom";
import "./sessionEditorModal.css";
import { DatePicker } from "./datePicker";
import { SessionSetTable } from "./sessionSetTable";
import { SetEditorModal } from "./setEditorModal";
import {
  normalizeSetType,
} from "../utils/workoutDomain";
import {
  findWorkoutColorSlot,
  getWorkoutColor,
  getWorkoutColorPreferenceLabel,
} from "../utils/workoutColors";

const setFieldColumns = [
  { key: "reps", label: "Reps", inputType: "number", placeholder: "10" },
  { key: "weight", label: "Weight", inputType: "number", placeholder: "135" },
  { key: "duration", label: "Time", inputType: "text", placeholder: "00:30" },
  { key: "distance", label: "Distance", inputType: "number", placeholder: "1.5" },
];

export function SessionEditorModal({
  draftSession,
  formId = "session-editor-form",
  titleId = "session-editor-title",
  templateOptions = [],
  onClose,
  onSubmit,
  onFieldChange,
  onCommitSet,
  onDeleteSet,
}) {
  const [pendingSet, setPendingSet] = React.useState(null);
  const [editingSetId, setEditingSetId] = React.useState(null);

  if (!draftSession) {
    return null;
  }

  const sessionTitle = draftSession.isMixed
    ? "Full Workout"
    : (draftSession.templateName || draftSession.exercise || "Session");
  const activeSetFields = getSessionVisibleFields(draftSession);
  const pendingSetFields = pendingSet
    ? getSessionVisibleFields(draftSession, pendingSet)
    : activeSetFields;
  const pendingSetMeasurements = getSessionMeasurements(draftSession, pendingSet);

  const openAddSetModal = () => {
    setEditingSetId(null);
    setPendingSet(buildSessionDraftSet(draftSession, templateOptions, draftSession.sets.length + 1));
  };

  const openEditSetModal = (set) => {
    setEditingSetId(set.id);
    setPendingSet({ ...set });
  };

  const closeSetModal = () => {
    setEditingSetId(null);
    setPendingSet(null);
  };

  const handlePendingSetChange = (field, value) => {
    setPendingSet((currentSet) => {
      if (!currentSet) {
        return currentSet;
      }

      if (field === "templateId" && draftSession.isMixed) {
        const updatedSession = applySessionDraftSetChange(
          { ...draftSession, sets: [currentSet] },
          currentSet.id,
          field,
          value,
          templateOptions
        );
        return updatedSession.sets[0] || currentSet;
      }

      return { ...currentSet, [field]: value };
    });
  };

  const handleConfirmSet = (event) => {
    event.preventDefault();

    if (!pendingSet) {
      return;
    }

    onCommitSet(pendingSet, editingSetId);
    closeSetModal();
  };

  const modal = (
    <div className="template-modal-backdrop session-editor-backdrop" role="presentation">
      <div className="template-modal session-editor-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="template-close-button is-icon" onClick={onClose} aria-label="Close session editor">
          &times;
        </button>

        <div className="template-modal-header">
          <div>
            <p className="template-eyebrow">Edit Session</p>
            <h2 id={titleId}>{sessionTitle}</h2>
          </div>
          <div className="modal-header-actions">
            <button type="submit" form={formId} className="btn btn-primary">
              Save
            </button>
          </div>
        </div>

        <form id={formId} className="template-modal-form session-editor-form" onSubmit={onSubmit}>
            <div className="set-modal-grid session-editor-meta-grid">
              <label>
                Date
                <DatePicker
                  value={draftSession.date}
                  onChange={(nextDate) => onFieldChange("date", nextDate)}
                  ariaLabel="Session date"
                />
              </label>
            </div>

          <section className="template-fields-panel session-editor-sets-panel">
            <div className="section-header session-editor-sets-header">
              <div>
                <h3>Sets</h3>
              </div>
              <button type="button" className="add-set-button session-editor-add-set-button" onClick={openAddSetModal}>
                + Add Set
              </button>
            </div>

            <SessionSetTable
              sets={draftSession.sets}
              fields={activeSetFields}
              measurements={draftSession.measurements || {}}
              isMixed={draftSession.isMixed}
              emptyMessage="No sets yet."
              onEditSet={openEditSetModal}
              onDeleteSet={onDeleteSet}
            />
          </section>

          <label className="session-editor-notes-field">
            Notes
            <textarea
              rows="3"
              value={draftSession.notes}
              onChange={(event) => onFieldChange("notes", event.target.value)}
            />
          </label>

          <div className="template-modal-actions">
            <button type="button" className="template-close-button" onClick={onClose} aria-label="Close session editor">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>

      {pendingSet && (
        <SetEditorModal
          eyebrow={editingSetId === null ? "New Set" : "Edit Set"}
          title={`${editingSetId === null ? "Add" : "Edit"} a set for ${sessionTitle}`}
          pendingSet={pendingSet}
          fields={pendingSetFields}
          measurements={pendingSetMeasurements}
          isMixed={draftSession.isMixed}
          allowExerciseChange={false}
          exerciseOptions={templateOptions}
          submitLabel={editingSetId === null ? "Save Set" : "Save Changes"}
          onChange={handlePendingSetChange}
          onSubmit={handleConfirmSet}
          onClose={closeSetModal}
        />
      )}
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : modal;
}

export function resolveStoredSession(session, sessions) {
  if (!session) {
    return session;
  }

  const sourceId = session.sourceWorkoutId || session.id;
  return sessions.find((workout) => workout.id === sourceId)
    || sessions.find((workout) => workout.id === session.id)
    || session;
}

export function cloneSessionForEdit(session) {
  const inferredFields = inferSessionFields(session?.sets || []);
  const fields = hasTrackedSessionFields(session?.fields) ? session.fields : inferredFields;

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

export function applySessionDraftSetChange(currentSession, setId, field, value, templateOptions = []) {
  if (!currentSession) {
    return currentSession;
  }

  if (field === "templateId" && currentSession.isMixed) {
    const nextTemplate = templateOptions.find((template) => template.value === value) || null;
    const fields = nextTemplate?.fields || {};

    return {
      ...currentSession,
      sets: currentSession.sets.map((set) =>
        set.id === setId
          ? {
            id: set.id,
            setType: normalizeSetType(set.setType),
            templateId: nextTemplate?.value || value,
            templateName: nextTemplate?.label || set.templateName || "",
            color: nextTemplate?.color || set.color || "",
            fields,
            measurements: nextTemplate?.measurements || set.measurements || {},
            ...copySessionSetFields(set, fields),
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
}

export function buildSessionDraftSet(session, templateOptions = [], setId) {
  if (session?.isMixed) {
    const lastSet = Array.isArray(session?.sets) ? session.sets[session.sets.length - 1] : null;
    const template = templateOptions.find((option) => option.value === lastSet?.templateId) || templateOptions[0] || null;
    const fields = lastSet?.fields || template?.fields || {};

    return {
      id: setId,
      setType: "regular",
      templateId: lastSet?.templateId || template?.value || "",
      templateName: lastSet?.templateName || template?.label || "",
      color: lastSet?.color || template?.color || "",
      fields,
      measurements: lastSet?.measurements || template?.measurements || {},
      ...copySessionSetFields({}, fields),
    };
  }

  const fields = hasTrackedSessionFields(session?.fields)
    ? session.fields
    : inferSessionFields(session?.sets || []);

  return {
    id: setId,
    setType: "regular",
    ...copySessionSetFields({}, fields),
  };
}

export function buildSessionTemplateOptions(templates, workoutColorPreferences = {}) {
  return [...(templates || [])]
    .sort((left, right) => (left.name || "").localeCompare(right.name || ""))
    .map((template) => buildTemplateOption({
      value: template.id,
      label: template.name,
      color: getWorkoutColor(template),
      fields: template.fields || {},
      measurements: template.measurements || {},
    }, workoutColorPreferences));
}

export function buildMixedSessionTemplateOptions(workouts, workoutColorPreferences = {}) {
  const optionMap = new Map();

  (workouts || []).forEach((workout) => {
    if (Array.isArray(workout?.sets)) {
      workout.sets.forEach((set) => {
        if (!set?.templateId || optionMap.has(set.templateId)) {
          return;
        }

        optionMap.set(set.templateId, {
          value: set.templateId,
          label: set.templateName || "Exercise set",
          color: getWorkoutColor(set),
          fields: set.fields || {},
          measurements: set.measurements || {},
        });
      });
    }

    if (!workout?.isMixed && workout?.templateId && !optionMap.has(workout.templateId)) {
      optionMap.set(workout.templateId, {
        value: workout.templateId,
        label: workout.templateName || workout.exercise || "Exercise",
        color: getWorkoutColor(workout),
        fields: workout.fields || {},
        measurements: workout.measurements || {},
      });
    }
  });

  return Array.from(optionMap.values())
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((option) => buildTemplateOption(option, workoutColorPreferences));
}

function buildTemplateOption(option, workoutColorPreferences) {
  const slotColor = findWorkoutColorSlot(option.color, workoutColorPreferences);
  const badge = getWorkoutColorPreferenceLabel(slotColor, workoutColorPreferences);

  return {
    ...option,
    ...(badge ? { badge, badgeColor: option.color } : {}),
  };
}

function copySessionSetFields(sourceSet, fields) {
  return {
    ...(fields?.reps ? { reps: sourceSet?.reps ?? "" } : {}),
    ...(fields?.weight ? { weight: sourceSet?.weight ?? "" } : {}),
    ...(fields?.duration ? { duration: sourceSet?.duration ?? "" } : {}),
    ...(fields?.distance ? { distance: sourceSet?.distance ?? "" } : {}),
  };
}

function getSessionVisibleFields(session, setOverride = null) {
  const savedFieldConfig = setOverride?.fields || session?.fields;

  if (session?.isMixed && !setOverride) {
    const visibleKeys = new Set();

    (session.sets || []).forEach((set) => {
      Object.entries(set?.fields || {}).forEach(([key, isVisible]) => {
        if (isVisible) {
          visibleKeys.add(key);
        }
      });
    });

    if (visibleKeys.size > 0) {
      return setFieldColumns.filter((field) => visibleKeys.has(field.key));
    }
  }

  if (savedFieldConfig) {
    return setFieldColumns.filter((field) => savedFieldConfig[field.key]);
  }

  return setFieldColumns.filter((field) =>
    Array.isArray(session?.sets) && session.sets.some((set) => set[field.key] !== undefined && set[field.key] !== "")
  );
}

function getSessionMeasurements(session, setOverride = null) {
  if (session?.isMixed) {
    return setOverride?.measurements || session?.measurements || {};
  }

  return session?.measurements || {};
}

function getSessionFieldLabel(field, measurements) {
  return getLoggerFieldLabel(field, measurements, "Time");
}

function inferSessionFields(sets) {
  return {
    reps: sets.some((set) => hasSessionValue(set?.reps)),
    weight: sets.some((set) => hasSessionValue(set?.weight)),
    duration: sets.some((set) => hasSessionValue(set?.duration)),
    distance: sets.some((set) => hasSessionValue(set?.distance)),
    notes: true,
  };
}

function hasTrackedSessionFields(fields) {
  return Boolean(fields?.reps || fields?.weight || fields?.duration || fields?.distance);
}

function hasSessionValue(value) {
  return value !== undefined && value !== null && `${value}` !== "";
}
