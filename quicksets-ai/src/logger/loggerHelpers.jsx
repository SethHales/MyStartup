import React from "react";
import { WheelPicker } from "../components/wheelPicker";
import {
  formatMeasurementLabel,
  getSetDisplayLabel,
  normalizeSetType,
  parseDurationToSeconds,
} from "../utils/workoutDomain";

export function getDefaultSetValues(
  selectedTemplate,
  currentSets,
  savedWorkouts,
  templates = [],
  defaultTemplateFields,
  defaultTemplateMeasurements,
  buildEmptySet
) {
  if (!selectedTemplate) {
    return {};
  }

  if (selectedTemplate.isMixed) {
    const lastCurrentMixedSet = currentSets.length > 0 ? currentSets[currentSets.length - 1] : null;
    if (lastCurrentMixedSet) {
      const sourceTemplate = templates.find((template) => template.id === lastCurrentMixedSet.templateId) || null;
      return {
        ...copyTrackedFields(lastCurrentMixedSet, getSetTemplateFields(selectedTemplate, lastCurrentMixedSet, templates, defaultTemplateFields)),
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
      ...getMixedTemplateDefaultSet(fallbackTemplate, currentSets, savedWorkouts, buildEmptySet),
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

export function getMixedTemplateDefaultSet(template, currentSets, savedWorkouts, buildEmptySet) {
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

export function MobileSetField({ field, measurements, value, onChange }) {
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

export function copyTrackedFields(sourceSet, fields) {
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

export function getLoggerVisibleFields(selectedTemplate, sets, templateFieldOptions) {
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

export function getSetTemplateFields(selectedTemplate, set, templates = [], defaultTemplateFields) {
  if (!selectedTemplate?.isMixed) {
    return selectedTemplate?.fields || defaultTemplateFields;
  }

  const matchedTemplate = templates.find((template) => template.id === set?.templateId) || null;
  return matchedTemplate?.fields || set?.fields || defaultTemplateFields;
}

export function getSetMeasurements(selectedTemplate, set, defaultTemplateMeasurements) {
  if (!selectedTemplate?.isMixed) {
    return selectedTemplate?.measurements || defaultTemplateMeasurements;
  }

  return set?.measurements || defaultTemplateMeasurements;
}

export function shouldShowSetField(fieldKey, selectedTemplate, set, defaultTemplateFields) {
  if (!selectedTemplate?.isMixed) {
    return Boolean(selectedTemplate?.fields?.[fieldKey]);
  }

  return Boolean(getSetTemplateFields(selectedTemplate, set, [], defaultTemplateFields)[fieldKey]);
}

export function formatTemplatePreview(name, fields, measurements = {}) {
  const selectedFields = [
    fields.reps && "reps",
    fields.weight && `weight (${formatMeasurementLabel(measurements.weight)})`,
    fields.duration && "duration",
    fields.distance && `distance (${formatMeasurementLabel(measurements.distance)})`,
    "notes",
  ].filter(Boolean);

  return `${name.trim() || "Your new exercise"} will save ${selectedFields.join(", ")}.`;
}

export function formatColorHexLabel(color) {
  return `${color}`.toUpperCase();
}

export function getFieldLabel(field, measurements = {}, durationLabel = "Time") {
  if (field.key === "weight") {
    return `Weight (${formatMeasurementLabel(measurements?.weight)})`;
  }

  if (field.key === "distance") {
    return `Distance (${formatMeasurementLabel(measurements?.distance)})`;
  }

  if (field.key === "duration") {
    return durationLabel;
  }

  return field.label;
}

export function getFieldUnitSuffix(field, measurements = {}) {
  if (field.key === "weight") {
    return formatMeasurementLabel(measurements?.weight);
  }

  if (field.key === "distance") {
    return formatMeasurementLabel(measurements?.distance);
  }

  return "";
}

export function parseDurationParts(duration) {
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

export function formatDurationValue(minutes, seconds) {
  if (minutes === "" && seconds === "") {
    return "";
  }

  const safeMinutes = minutes === "" ? "0" : minutes;
  const safeSeconds = seconds === "" ? "0" : seconds;

  return `${String(safeMinutes).padStart(2, "0")}:${String(safeSeconds).padStart(2, "0")}`;
}

export function shouldUseEnterShortcut(event) {
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

export { getSetDisplayLabel, parseDurationToSeconds };
