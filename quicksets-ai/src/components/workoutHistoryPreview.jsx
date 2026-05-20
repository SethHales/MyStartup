import React from 'react';
import "../history/history.css";
import {
  formatMeasurementLabel,
  getSetDisplayLabel,
  parseLocalDate,
} from "../utils/workoutDomain";
import { getWorkoutColor } from "../utils/workoutColors";

const setFieldColumns = [
  { key: 'reps', label: 'Reps' },
  { key: 'weight', label: 'Weight' },
  { key: 'duration', label: 'Time' },
  { key: 'distance', label: 'Distance' },
];

export function WorkoutHistoryPreview({ workouts, emptyMessage = "No sessions yet.", focusRequest = null }) {
  const [expandedWorkoutId, setExpandedWorkoutId] = React.useState(null);
  const rowRefs = React.useRef(new Map());
  const sortedWorkouts = React.useMemo(
    () => sortWorkouts(workouts || []),
    [workouts]
  );

  React.useEffect(() => {
    if (!focusRequest?.workoutId) {
      return;
    }

    setExpandedWorkoutId(focusRequest.workoutId);

    const scrollTimeoutId = window.setTimeout(() => {
      rowRefs.current.get(focusRequest.workoutId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 80);

    return () => {
      window.clearTimeout(scrollTimeoutId);
    };
  }, [focusRequest]);

  if (!sortedWorkouts.length) {
    return (
      <section className="history-empty-state">
        <p>{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="history-month-group workout-history-preview-group">
      <table className="history-table table table-dark table-hover">
        <tbody>
          {sortedWorkouts.map((workout) => (
            <WorkoutHistoryPreviewRow
              key={workout.id}
              workout={workout}
              isExpanded={expandedWorkoutId === workout.id}
              rowRef={(node) => {
                if (!node) {
                  rowRefs.current.delete(workout.id);
                  return;
                }
                rowRefs.current.set(workout.id, node);
              }}
              onRowClick={() => {
                setExpandedWorkoutId((currentId) => currentId === workout.id ? null : workout.id);
              }}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

const WorkoutHistoryPreviewRow = React.memo(function WorkoutHistoryPreviewRow({
  workout,
  isExpanded,
  rowRef,
  onRowClick,
}) {
  const workoutName = workout.templateName || workout.exercise;
  const [shouldRenderDetails, setShouldRenderDetails] = React.useState(isExpanded);
  const [detailsState, setDetailsState] = React.useState(isExpanded ? 'open' : 'closed');

  React.useEffect(() => {
    if (isExpanded) {
      setShouldRenderDetails(true);
      setDetailsState('open');
      return undefined;
    }

    if (!shouldRenderDetails) {
      setDetailsState('closed');
      return undefined;
    }

    setDetailsState('closing');
    const timeoutId = window.setTimeout(() => {
      setShouldRenderDetails(false);
      setDetailsState('closed');
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [isExpanded, shouldRenderDetails]);

  return (
    <>
      <tr
        ref={rowRef}
        onClick={onRowClick}
        className={[
          isExpanded ? "history-row-expanded history-row" : "history-row",
          workout.starred ? "history-row-starred" : "",
        ].filter(Boolean).join(" ")}
        style={{ cursor: "pointer" }}
      >
        <td className="workout-history-date-cell">{formatWorkoutListDate(workout.date)}</td>
        <td className="history-workout-cell">
          <span className="history-workout-leading history-workout-leading-static" aria-hidden="true" />
          <span
            className={workout.isMixed ? "history-workout-name is-mixed" : "history-workout-name"}
            style={workout.isMixed ? undefined : { color: getWorkoutColor(workout) }}
          >
            {workoutName}
          </span>
        </td>
        <td className="history-notes-cell">
          <span className={isExpanded ? "history-notes-text is-expanded" : "history-notes-text"}>
            {workout.notes}
          </span>
        </td>
        <td className="workout-actions-cell workout-actions-cell-placeholder" aria-hidden="true" />
      </tr>
      {shouldRenderDetails && (
        <tr className={detailsState === 'open' ? "history-row-details is-open" : "history-row-details is-closing"}>
          <td colSpan={4}>
            <div className={detailsState === 'open' ? "history-details-content is-open" : "history-details-content is-closing"}>
              <div className={detailsState === 'open' ? "history-details-panel is-open" : "history-details-panel is-closing"}>
                {renderWorkoutDetails(workout)}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

function renderWorkoutDetails(workout) {
  const visibleFields = getVisibleFields(workout);

  if (!Array.isArray(workout.sets) || workout.sets.length === 0) {
    return (
      <p className="no-sets-message">
        No sets saved.
      </p>
    );
  }

  return (
    <table className="inner-sets-table">
      <thead>
        <tr>
          <th>Set</th>
          {workout.isMixed && <th>Workout</th>}
          {visibleFields.map((field) => (
            <th key={field.key}>{getFieldLabel(field, getWorkoutMeasurements(workout))}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {workout.sets.map((set, index) => (
          <tr key={set.id ?? index}>
            <td>{getSetDisplayLabel(set, workout.sets, index)}</td>
            {workout.isMixed && (
              <td>
                <span
                  className="history-inline-workout"
                  style={{ color: getWorkoutColor(set) }}
                >
                  {set.templateName || 'Mixed set'}
                </span>
              </td>
            )}
            {visibleFields.map((field) => (
              <td key={field.key}>{set[field.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function getVisibleFields(workout, setOverride = null) {
  const savedFieldConfig = setOverride?.fields || workout?.fields;

  if (savedFieldConfig) {
    return setFieldColumns.filter((field) => savedFieldConfig[field.key]);
  }

  return setFieldColumns.filter((field) =>
    Array.isArray(workout?.sets) && workout.sets.some((set) => set[field.key] !== undefined && set[field.key] !== "")
  );
}

function getWorkoutMeasurements(workout, setOverride = null) {
  if (workout?.isMixed) {
    return setOverride?.measurements || workout?.measurements || {};
  }

  return workout?.measurements || {};
}

function getFieldLabel(field, measurements) {
  if (field.key === 'weight') {
    return `Weight (${formatMeasurementLabel(measurements?.weight, 'LBs')})`;
  }

  if (field.key === 'distance') {
    return `Distance (${formatMeasurementLabel(measurements?.distance, 'Miles')})`;
  }

  if (field.key === 'duration') {
    return 'Time (HH:MM:SS)';
  }

  return field.label;
}

function sortWorkouts(workouts) {
  return [...workouts].sort((left, right) => {
    const leftDate = parseLocalDate(left.date).getTime();
    const rightDate = parseLocalDate(right.date).getTime();

    if (rightDate !== leftDate) {
      return rightDate - leftDate;
    }

    const leftChronology = getWorkoutChronologyValue(left);
    const rightChronology = getWorkoutChronologyValue(right);

    if (leftChronology !== rightChronology) {
      return rightChronology - leftChronology;
    }

    return (left.id || '').localeCompare(right.id || '');
  });
}

function getWorkoutChronologyValue(workout) {
  const createdAtTime = Date.parse(workout?.createdAt || '');
  if (!Number.isNaN(createdAtTime)) {
    return createdAtTime;
  }

  const objectIdValue = typeof workout?._id === 'string'
    ? workout._id
    : workout?._id?.toString?.();

  if (objectIdValue && /^[a-f0-9]{24}$/i.test(objectIdValue)) {
    return parseInt(objectIdValue.slice(0, 8), 16) * 1000;
  }

  return 0;
}

function formatWorkoutListDate(dateValue) {
  const date = parseLocalDate(dateValue);
  const now = new Date();
  const includeYear = date.getFullYear() !== now.getFullYear();
  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
}
