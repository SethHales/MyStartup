import React from 'react';
import "./history.css";

const setFieldColumns = [
  { key: 'reps', label: 'Reps', inputType: 'number', placeholder: '10' },
  { key: 'weight', label: 'Weight', inputType: 'number', placeholder: '135' },
  { key: 'duration', label: 'Time', inputType: 'text', placeholder: '00:30' },
  { key: 'distance', label: 'Distance', inputType: 'number', placeholder: '1.5' },
];

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function History() {
  const [workouts, setWorkouts] = React.useState([]);
  const [expandedWorkoutId, setExpandedWorkoutId] = React.useState(null);
  const [editingWorkout, setEditingWorkout] = React.useState(null);
  const [draftWorkout, setDraftWorkout] = React.useState(null);
  const [openWorkoutMenuId, setOpenWorkoutMenuId] = React.useState(null);
  const [workoutFilter, setWorkoutFilter] = React.useState('all');
  const [monthFilter, setMonthFilter] = React.useState('all');
  const [yearFilter, setYearFilter] = React.useState('all');

  React.useEffect(() => {
    loadWorkouts();
  }, []);

  const workoutOptions = React.useMemo(
    () => Array.from(new Set(workouts.map((workout) => workout.templateName || workout.exercise).filter(Boolean))).sort(),
    [workouts]
  );
  const yearOptions = React.useMemo(
    () => Array.from(new Set(workouts.map((workout) => String(parseLocalDate(workout.date).getFullYear())))).sort((left, right) => Number(right) - Number(left)),
    [workouts]
  );
  const filteredWorkouts = React.useMemo(
    () => workouts.filter((workout) => {
      const workoutName = workout.templateName || workout.exercise;
      const workoutDate = parseLocalDate(workout.date);
      const workoutMonth = String(workoutDate.getMonth());
      const workoutYear = String(workoutDate.getFullYear());

      return (workoutFilter === 'all' || workoutName === workoutFilter)
        && (monthFilter === 'all' || workoutMonth === monthFilter)
        && (yearFilter === 'all' || workoutYear === yearFilter);
    }),
    [workouts, workoutFilter, monthFilter, yearFilter]
  );
  const groupedWorkouts = groupWorkoutsByMonth(filteredWorkouts);

  const handleRowClick = (id) => {
    setExpandedWorkoutId((current) =>
      current === id ? null : id
    );
  };

  const openEditModal = (workout) => {
    setEditingWorkout(workout);
    setDraftWorkout(cloneWorkoutForEdit(workout));
    setOpenWorkoutMenuId(null);
  };

  const closeEditModal = () => {
    setEditingWorkout(null);
    setDraftWorkout(null);
  };

  const handleDeleteWorkout = async (workoutId) => {
    setOpenWorkoutMenuId(null);

    try {
      const response = await fetch(`/api/workouts/${workoutId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const body = await response.json();
        alert(body.msg || 'Failed to delete workout');
        return;
      }

      setWorkouts((currentWorkouts) =>
        currentWorkouts.filter((workout) => workout.id !== workoutId)
      );
      setExpandedWorkoutId((current) => current === workoutId ? null : current);
    } catch (err) {
      console.error('Error deleting workout:', err);
    }
  };

  const handleDraftFieldChange = (field, value) => {
    setDraftWorkout((currentWorkout) => ({
      ...currentWorkout,
      [field]: value,
    }));
  };

  const handleDraftSetChange = (setId, field, value) => {
    setDraftWorkout((currentWorkout) => ({
      ...currentWorkout,
      sets: currentWorkout.sets.map((set) =>
        set.id === setId
          ? { ...set, [field]: value }
          : set
      ),
    }));
  };

  const handleDraftAddSet = () => {
    setDraftWorkout((currentWorkout) => ({
      ...currentWorkout,
      sets: [
        ...currentWorkout.sets,
        buildDraftSet(currentWorkout.fields, currentWorkout.sets.length + 1),
      ],
    }));
  };

  const handleDraftDeleteSet = (setId) => {
    setDraftWorkout((currentWorkout) => ({
      ...currentWorkout,
      sets: currentWorkout.sets
        .filter((set) => set.id !== setId)
        .map((set, index) => ({ ...set, id: index + 1 })),
    }));
  };

  const handleSaveWorkout = async (event) => {
    event.preventDefault();

    try {
      const response = await fetch(`/api/workouts/${editingWorkout.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date: draftWorkout.date,
          notes: draftWorkout.notes,
          sets: draftWorkout.sets,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        alert(body.msg || 'Failed to update workout');
        return;
      }

      setWorkouts((currentWorkouts) =>
        sortWorkouts(
          currentWorkouts.map((workout) =>
            workout.id === body.id ? body : workout
          )
        )
      );
      closeEditModal();
    } catch (err) {
      console.error('Error updating workout:', err);
    }
  };

  return (
    <main>
      <section className="main-formatting">
        <section className="history-filter-bar">
          <div className="history-filter-copy">
            <p className="history-kicker">History</p>
            <h2>{filteredWorkouts.length} workout{filteredWorkouts.length === 1 ? "" : "s"}</h2>
            <p className="history-summary">{groupedWorkouts.length} month{groupedWorkouts.length === 1 ? "" : "s"}</p>
          </div>
          <label>
            Workout
            <select value={workoutFilter} onChange={(event) => setWorkoutFilter(event.target.value)}>
              <option value="all">All workouts</option>
              {workoutOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Month
            <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
              <option value="all">All months</option>
              {monthNames.map((month, index) => (
                <option key={month} value={String(index)}>{month}</option>
              ))}
            </select>
          </label>
          <label>
            Year
            <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
              <option value="all">All years</option>
              {yearOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </section>

        {groupedWorkouts.length === 0 && (
          <section className="history-empty-state">
            <p>No matches.</p>
          </section>
        )}

        {groupedWorkouts.map((group) => (
          <section key={group.key} className="history-month-group">
            <div className="history-month-heading">
              <h2>{group.label}</h2>
            </div>
            <table className="history-table table table-dark table-hover">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Workout</th>
                  <th>Notes</th>
                  <th className="workout-actions-header"></th>
                </tr>
              </thead>
              <tbody>
                {group.workouts.map((workout) =>
                  <React.Fragment key={workout.id}>
                    <tr
                      onClick={() => handleRowClick(workout.id)}
                      className={workout.id === expandedWorkoutId ? "history-row-expanded history-row" : "history-row"}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{formatWorkoutDate(workout.date)}</td>
                      <td>{workout.templateName || workout.exercise}</td>
                      <td>{workout.notes}</td>
                      <td
                        className="workout-actions-cell"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="workout-actions-menu">
                          <button
                            type="button"
                            className="workout-menu-trigger"
                            aria-label={`Manage workout ${workout.templateName || workout.exercise}`}
                            onClick={() =>
                              setOpenWorkoutMenuId((currentId) =>
                                currentId === workout.id ? null : workout.id
                              )
                            }
                          >
                            ...
                          </button>
                          {openWorkoutMenuId === workout.id && (
                            <div className="workout-menu-popover">
                              <button
                                type="button"
                                className="workout-menu-item"
                                onClick={() => openEditModal(workout)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="workout-menu-item delete"
                                onClick={() => handleDeleteWorkout(workout.id)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                    <tr className={expandedWorkoutId === workout.id ? "history-row-details is-open" : "history-row-details"}>
                      <td colSpan={4}>
                        <div className={expandedWorkoutId === workout.id ? "history-details-content is-open" : "history-details-content"}>
                          <div className="history-details-panel">
                            {Array.isArray(workout.sets) && workout.sets.length > 0 ? (
                              <table className="inner-sets-table">
                                <thead>
                                  <tr>
                                    <th>#</th>
                                    {getVisibleFields(workout).map((field) => (
                                      <th key={field.key}>{field.label}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {workout.sets.map((set, index) => (
                                    <tr key={set.id ?? index}>
                                      <td>{set.id ?? index + 1}</td>
                                      {getVisibleFields(workout).map((field) => (
                                        <td key={field.key}>{set[field.key]}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="no-sets-message">
                                No sets saved.
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                )}
              </tbody>
            </table>
          </section>
        ))}
      </section>

      {editingWorkout && draftWorkout && (
        <div className="history-modal-backdrop" role="presentation">
          <div className="history-modal" role="dialog" aria-modal="true" aria-labelledby="edit-workout-title">
            <div className="history-modal-header">
              <div>
                <p className="history-modal-eyebrow">Edit Workout</p>
                <h2 id="edit-workout-title">{editingWorkout.templateName || editingWorkout.exercise}</h2>
              </div>
              <button type="button" className="history-close-button" onClick={closeEditModal}>
                Close
              </button>
            </div>

            <form className="history-modal-form" onSubmit={handleSaveWorkout}>
              <label>
                Date
                <input
                  type="date"
                  value={draftWorkout.date}
                  onChange={(event) => handleDraftFieldChange('date', event.target.value)}
                  required
                />
              </label>

              {draftWorkout.fields.notes && (
                <label>
                  Notes
                  <textarea
                    rows="3"
                    value={draftWorkout.notes}
                    onChange={(event) => handleDraftFieldChange('notes', event.target.value)}
                  />
                </label>
              )}

              <section className="history-modal-panel">
                <div className="history-modal-panel-header">
                  <h3>Sets</h3>
                  <button type="button" className="btn btn-outline-light btn-sm" onClick={handleDraftAddSet}>
                    + Add Set
                  </button>
                </div>

                {draftWorkout.sets.length > 0 ? (
                  <div className="history-edit-sets">
                    {draftWorkout.sets.map((set) => (
                      <div key={set.id} className="history-edit-set-card">
                        <div className="history-edit-set-header">
                          <span>Set {set.id}</span>
                          <button
                            type="button"
                            className="history-delete-set-button"
                            onClick={() => handleDraftDeleteSet(set.id)}
                          >
                            Delete
                          </button>
                        </div>
                        <div className="history-edit-set-grid">
                          {getVisibleFields(draftWorkout).map((field) => (
                            <label key={field.key}>
                              {field.label}
                              <input
                                type={field.inputType || 'text'}
                                value={set[field.key] ?? ''}
                                placeholder={field.placeholder || ''}
                                onChange={(event) => handleDraftSetChange(set.id, field.key, event.target.value)}
                              />
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
                <button type="button" className="btn btn-outline-light" onClick={closeEditModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Workout
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );

  function loadWorkouts() {
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
      .then((userWorkouts) => {
        setWorkouts(sortWorkouts(userWorkouts));
      })
      .catch((err) => {
        console.error('Error loading workouts:', err);
      });
  }
}

function getVisibleFields(workout) {
  const savedFieldConfig = workout?.fields;

  if (savedFieldConfig) {
    return setFieldColumns.filter((field) => savedFieldConfig[field.key]);
  }

  return setFieldColumns.filter((field) =>
    Array.isArray(workout?.sets) && workout.sets.some((set) => set[field.key] !== undefined && set[field.key] !== "")
  );
}

function sortWorkouts(workouts) {
  return [...workouts].sort((left, right) => {
    const leftDate = parseLocalDate(left.date).getTime();
    const rightDate = parseLocalDate(right.date).getTime();

    if (rightDate !== leftDate) {
      return rightDate - leftDate;
    }

    return (right.id || '').localeCompare(left.id || '');
  });
}

function groupWorkoutsByMonth(workouts) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const groups = [];
  const groupMap = new Map();

  workouts.forEach((workout) => {
    const workoutDate = parseLocalDate(workout.date);
    const month = workoutDate.toLocaleString('en-US', { month: 'long' });
    const year = workoutDate.getFullYear();
    const key = `${year}-${String(workoutDate.getMonth() + 1).padStart(2, '0')}`;

    if (!groupMap.has(key)) {
      const label = year === currentYear ? month : `${month} ${year}`;
      const group = { key, label, workouts: [] };
      groupMap.set(key, group);
      groups.push(group);
    }

    groupMap.get(key).workouts.push(workout);
  });

  return groups;
}

function formatWorkoutDate(dateValue) {
  const date = parseLocalDate(dateValue);
  const weekday = date.toLocaleString('en-US', { weekday: 'long' });
  const day = date.getDate();
  return `${weekday} the ${day}${getOrdinalSuffix(day)}`;
}

function parseLocalDate(dateValue) {
  return new Date(`${dateValue}T00:00:00`);
}

function getOrdinalSuffix(day) {
  if (day >= 11 && day <= 13) {
    return 'th';
  }

  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function cloneWorkoutForEdit(workout) {
  return {
    ...workout,
    notes: workout.notes || '',
    fields: workout.fields || {},
    sets: Array.isArray(workout.sets)
      ? workout.sets.map((set, index) => ({ ...set, id: set.id ?? index + 1 }))
      : [],
  };
}

function buildDraftSet(fields, id) {
  return {
    id,
    ...(fields?.reps ? { reps: '' } : {}),
    ...(fields?.weight ? { weight: '' } : {}),
    ...(fields?.duration ? { duration: '' } : {}),
    ...(fields?.distance ? { distance: '' } : {}),
  };
}
