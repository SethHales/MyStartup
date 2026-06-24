import React from "react";
import { Dropdown } from "./dropdown";
import { MobileSetField, getFieldLabel } from "../logger/loggerHelpers";

const defaultSetTypeOptions = [
  { value: "regular", label: "Regular" },
  { value: "warmup", label: "Warmup" },
  { value: "max", label: "Max" },
];

export function SetEditorModal({
  title,
  eyebrow = "Set",
  pendingSet,
  fields,
  measurements,
  isMixed = false,
  allowExerciseChange = false,
  exerciseOptions = [],
  setTypeOptions = defaultSetTypeOptions,
  submitLabel = "Save Set",
  onChange,
  onSubmit,
  onClose,
  onKeyDown,
  onPointerUpSubmit,
  renderFieldActions,
}) {
  if (!pendingSet) {
    return null;
  }

  return (
    <div className="template-modal-backdrop is-stacked-modal" role="presentation">
      <div className="template-modal set-modal" role="dialog" aria-modal="true" aria-labelledby="set-editor-title">
        <div className="template-modal-header">
          <div>
            <p className="template-eyebrow">{eyebrow}</p>
            <h2 id="set-editor-title">{title}</h2>
          </div>
        </div>

        <form className="template-modal-form" onSubmit={onSubmit} onKeyDown={onKeyDown}>
          <section className="template-fields-panel">
            <div className="set-modal-grid">
              {isMixed && allowExerciseChange && (
                <label>
                  Exercise
                  <Dropdown
                    value={pendingSet.templateId || ""}
                    onChange={(nextValue) => onChange("templateId", nextValue)}
                    searchable
                    searchPlaceholder="Search exercises"
                    options={exerciseOptions}
                    ariaLabel="Set exercise"
                  />
                </label>
              )}

              {isMixed && !allowExerciseChange && (
                <label>
                  Exercise
                  <input type="text" value={pendingSet.templateName || "Exercise set"} disabled />
                </label>
              )}

              <label>
                Set type
                <Dropdown
                  value={pendingSet.setType || "regular"}
                  onChange={(nextValue) => onChange("setType", nextValue)}
                  options={setTypeOptions}
                  ariaLabel="Set type"
                />
              </label>

              {fields.map((field) => (
                <label key={field.key}>
                  {getFieldLabel(field, measurements)}
                  <MobileSetField
                    field={field}
                    measurements={measurements}
                    value={pendingSet[field.key] ?? ""}
                    onChange={(nextValue) => onChange(field.key, nextValue)}
                  />
                  {renderFieldActions?.(field)}
                </label>
              ))}
            </div>
          </section>

          <div className="template-modal-actions">
            <button type="button" className="btn btn-outline-light" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              onPointerUpCapture={onPointerUpSubmit}
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
