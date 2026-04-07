import React from 'react';
import { createPortal } from 'react-dom';
import { Dropdown } from '../components/dropdown';
import { MultiSelectDropdown } from '../components/multiSelectDropdown';
import "./history.css";
import { getWorkoutColor } from "../utils/workoutColors";

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
  const [isLoading, setIsLoading] = React.useState(true);
  const [expandedWorkoutId, setExpandedWorkoutId] = React.useState(null);
  const [editingWorkout, setEditingWorkout] = React.useState(null);
  const [draftWorkout, setDraftWorkout] = React.useState(null);
  const [openWorkoutMenuId, setOpenWorkoutMenuId] = React.useState(null);
  const [showFilterMenu, setShowFilterMenu] = React.useState(false);
  const [workoutFilters, setWorkoutFilters] = React.useState([]);
  const [monthFilters, setMonthFilters] = React.useState([]);
  const [yearFilters, setYearFilters] = React.useState([]);
  const [starredOnly, setStarredOnly] = React.useState(false);
  const filterMenuRef = React.useRef(null);

  React.useEffect(() => {
    loadWorkouts();
  }, []);

  React.useEffect(() => {
    const handlePointerDown = (event) => {
      if (!filterMenuRef.current?.contains(event.target)) {
        setShowFilterMenu(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
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

      return (workoutFilters.length === 0 || workoutFilters.includes(workoutName))
        && (monthFilters.length === 0 || monthFilters.includes(workoutMonth))
        && (yearFilters.length === 0 || yearFilters.includes(workoutYear))
        && (!starredOnly || Boolean(workout.starred));
    }),
    [workouts, workoutFilters, monthFilters, yearFilters, starredOnly]
  );
  const groupedWorkouts = React.useMemo(
    () => groupWorkoutsByMonth(filteredWorkouts),
    [filteredWorkouts]
  );
  const activeFilterCount = workoutFilters.length + monthFilters.length + yearFilters.length + (starredOnly ? 1 : 0);

  const handleRowClick = React.useCallback((id) => {
    setExpandedWorkoutId((current) =>
      current === id ? null : id
    );
  }, []);

  const openEditModal = React.useCallback((workout) => {
    setEditingWorkout(workout);
    setDraftWorkout(cloneWorkoutForEdit(workout));
    setOpenWorkoutMenuId(null);
  }, []);

  const closeEditModal = React.useCallback(() => {
    setEditingWorkout(null);
    setDraftWorkout(null);
  }, []);

  const handleDeleteWorkout = React.useCallback(async (workoutId) => {
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
  }, []);

  const handleToggleStarred = React.useCallback(async (workout) => {
    setOpenWorkoutMenuId(null);
    const nextStarred = !workout.starred;

    setWorkouts((currentWorkouts) =>
      sortWorkouts(
        currentWorkouts.map((currentWorkout) =>
          currentWorkout.id === workout.id
            ? { ...currentWorkout, starred: nextStarred }
            : currentWorkout
        )
      )
    );

    try {
      const response = await fetch(`/api/workouts/${workout.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date: workout.date,
          notes: workout.notes,
          starred: nextStarred,
          sets: workout.sets,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setWorkouts((currentWorkouts) =>
          sortWorkouts(
            currentWorkouts.map((currentWorkout) =>
              currentWorkout.id === workout.id
                ? { ...currentWorkout, starred: workout.starred }
                : currentWorkout
            )
          )
        );
        alert(body.msg || 'Failed to update starred workout');
        return;
      }

      setWorkouts((currentWorkouts) =>
        sortWorkouts(
          currentWorkouts.map((currentWorkout) =>
            currentWorkout.id === body.id ? body : currentWorkout
          )
        )
      );
    } catch (err) {
      setWorkouts((currentWorkouts) =>
        sortWorkouts(
          currentWorkouts.map((currentWorkout) =>
            currentWorkout.id === workout.id
              ? { ...currentWorkout, starred: workout.starred }
              : currentWorkout
          )
        )
      );
      console.error('Error updating starred workout:', err);
    }
  }, []);

  const toggleWorkoutMenu = React.useCallback((workoutId) => {
    setOpenWorkoutMenuId((currentId) =>
      currentId === workoutId ? null : workoutId
    );
  }, []);

  const handleDraftFieldChange = (field, value) => {
    setDraftWorkout((currentWorkout) => ({
      ...currentWorkout,
      [field]: value,
    }));
  };

  const handleDraftSetChange = (setId, field, value) => {
    if (field === 'templateId' && draftWorkout?.isMixed) {
      const nextTemplate = workouts
        .flatMap((workout) => Array.isArray(workout.sets) ? workout.sets : [])
        .find((set) => set.templateId === value);

      setDraftWorkout((currentWorkout) => ({
        ...currentWorkout,
        sets: currentWorkout.sets.map((set) =>
          set.id === setId
            ? {
              id: set.id,
              setType: 'regular',
              templateId: nextTemplate?.templateId || value,
              templateName: nextTemplate?.templateName || set.templateName || '',
              fields: nextTemplate?.fields || set.fields || {},
              measurements: nextTemplate?.measurements || set.measurements || {},
              ...copyHistorySetFields(nextTemplate || set, nextTemplate?.fields || set.fields || {}),
            }
            : set
        ),
      }));
      return;
    }

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
    const nextSetId = draftWorkout.sets.length + 1;
    setDraftWorkout((currentWorkout) => ({
      ...currentWorkout,
      sets: [
        ...currentWorkout.sets,
        buildDraftSet(currentWorkout, workouts, nextSetId),
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
          starred: Boolean(draftWorkout.starred),
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

  const clearAllFilters = () => {
    setWorkoutFilters([]);
    setMonthFilters([]);
    setYearFilters([]);
    setStarredOnly(false);
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
          <div className="history-filter-actions" ref={filterMenuRef}>
            <button
              type="button"
              className="history-filter-trigger"
              aria-expanded={showFilterMenu}
              onClick={() => setShowFilterMenu((current) => !current)}
            >
              {activeFilterCount > 0 ? `Filter (${activeFilterCount})` : 'Filter'}
            </button>
            {showFilterMenu && (
              <div className="history-filter-popover">
                <div className="history-filter-section">
                  <div className="history-filter-section-header">
                    <span>Workout</span>
                    {workoutFilters.length > 0 && (
                      <button type="button" className="history-filter-clear" onClick={() => setWorkoutFilters([])}>
                        Clear
                      </button>
                    )}
                  </div>
                  <MultiSelectDropdown
                    values={workoutFilters}
                    onChange={setWorkoutFilters}
                    options={workoutOptions.map((option) => ({ value: option, label: option }))}
                    placeholder="All workouts"
                    ariaLabel="Filter by workout"
                  />
                </div>
                <div className="history-filter-section">
                  <div className="history-filter-section-header">
                    <span>Month</span>
                    {monthFilters.length > 0 && (
                      <button type="button" className="history-filter-clear" onClick={() => setMonthFilters([])}>
                        Clear
                      </button>
                    )}
                  </div>
                  <MultiSelectDropdown
                    values={monthFilters}
                    onChange={setMonthFilters}
                    options={monthNames.map((month, index) => ({ value: String(index), label: month }))}
                    placeholder="All months"
                    ariaLabel="Filter by month"
                  />
                </div>
                <div className="history-filter-section">
                  <div className="history-filter-section-header">
                    <span>Year</span>
                    {yearFilters.length > 0 && (
                      <button type="button" className="history-filter-clear" onClick={() => setYearFilters([])}>
                        Clear
                      </button>
                    )}
                  </div>
                  <MultiSelectDropdown
                    values={yearFilters}
                    onChange={setYearFilters}
                    options={yearOptions.map((option) => ({ value: option, label: option }))}
                    placeholder="All years"
                    ariaLabel="Filter by year"
                  />
                </div>
                <div className="history-filter-popover-actions">
                  <button
                    type="button"
                    className={starredOnly ? "history-filter-toggle is-active" : "history-filter-toggle"}
                    onClick={() => setStarredOnly((current) => !current)}
                  >
                    Starred only
                  </button>
                  <button type="button" className="history-filter-clear-all" onClick={clearAllFilters}>
                    Clear all
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {isLoading && (
          <section className="history-loading-state" aria-live="polite">
            <div className="history-loading-copy">
              <p className="history-kicker">History</p>
              <h2>Loading workouts...</h2>
              <p className="history-summary">Pulling your training log together.</p>
            </div>
            <div className="history-loading-list">
              <div className="history-loading-card" />
              <div className="history-loading-card" />
              <div className="history-loading-card" />
            </div>
          </section>
        )}

        {!isLoading && groupedWorkouts.length === 0 && (
          <section className="history-empty-state">
            <p>No matches.</p>
          </section>
        )}

        {!isLoading && groupedWorkouts.map((group) => (
          <HistoryMonthSection
            key={group.key}
            group={group}
            expandedWorkoutId={expandedWorkoutId}
            openWorkoutMenuId={openWorkoutMenuId}
            onRowClick={handleRowClick}
            onToggleStarred={handleToggleStarred}
            onToggleWorkoutMenu={toggleWorkoutMenu}
            onOpenEditModal={openEditModal}
            onDeleteWorkout={handleDeleteWorkout}
          />
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

              <label>
                Notes
                <textarea
                  rows="3"
                  value={draftWorkout.notes}
                  onChange={(event) => handleDraftFieldChange('notes', event.target.value)}
                />
              </label>

              <label className="history-starred-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(draftWorkout.starred)}
                  onChange={(event) => handleDraftFieldChange('starred', event.target.checked)}
                />
                <span>Star this workout</span>
              </label>

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
                          <span>{getSetDisplayLabel(set, draftWorkout.sets, draftWorkout.sets.findIndex((currentSet) => currentSet.id === set.id))}</span>
                          <button
                            type="button"
                            className="history-delete-set-button"
                            onClick={() => handleDraftDeleteSet(set.id)}
                          >
                            Delete
                          </button>
                        </div>
                        <div className="history-edit-set-grid">
                          {draftWorkout.isMixed && (
                            <label>
                              Workout
                              <Dropdown
                                value={set.templateId || ''}
                                onChange={(nextValue) => handleDraftSetChange(set.id, 'templateId', nextValue)}
                                options={getMixedWorkoutTemplateOptions(workouts)}
                                ariaLabel={`Set ${set.id} workout`}
                              />
                            </label>
                          )}
                          <label>
                            Set type
                            <Dropdown
                              value={set.setType || 'regular'}
                              onChange={(nextValue) => handleDraftSetChange(set.id, 'setType', nextValue)}
                              options={[
                                { value: 'regular', label: 'Regular' },
                                { value: 'warmup', label: 'Warmup' },
                                { value: 'max', label: 'Max' },
                              ]}
                              ariaLabel={`Set ${set.id} type`}
                            />
                          </label>
                          {getVisibleFields(draftWorkout, set).map((field) => (
                            <label key={field.key}>
                              {getFieldLabel(field, getWorkoutMeasurements(draftWorkout, set))}
                              <div className="input-with-unit">
                                <input
                                  type={field.inputType || 'text'}
                                  value={set[field.key] ?? ''}
                                  placeholder={field.placeholder || ''}
                                  onChange={(event) => handleDraftSetChange(set.id, field.key, event.target.value)}
                                />
                                {getFieldUnitSuffix(field, getWorkoutMeasurements(draftWorkout, set)) && (
                                  <span className="input-unit">
                                    {getFieldUnitSuffix(field, getWorkoutMeasurements(draftWorkout, set))}
                                  </span>
                                )}
                              </div>
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
      })
      .finally(() => {
        setIsLoading(false);
      });
  }
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

const HistoryMonthSection = React.memo(function HistoryMonthSection({
  group,
  expandedWorkoutId,
  openWorkoutMenuId,
  onRowClick,
  onToggleStarred,
  onToggleWorkoutMenu,
  onOpenEditModal,
  onDeleteWorkout,
}) {
  const hasOpenMenu = group.days.some((dayGroup) =>
    dayGroup.workouts.some((workout) => workout.id === openWorkoutMenuId)
  );

  return (
    <section className={hasOpenMenu ? "history-month-group history-month-group-menu-open" : "history-month-group"}>
      <div className="history-month-heading">
        <h2>{group.label}</h2>
      </div>
      <table className="history-table table table-dark table-hover">
        <tbody>
          {group.days.map((dayGroup) => (
            <React.Fragment key={dayGroup.key}>
              <tr className="history-day-row">
                <td colSpan={3}>{dayGroup.label}</td>
              </tr>
              {dayGroup.workouts.map((workout) => (
                <HistoryWorkoutRow
                  key={workout.id}
                  workout={workout}
                  isExpanded={expandedWorkoutId === workout.id}
                  isMenuOpen={openWorkoutMenuId === workout.id}
                  onRowClick={onRowClick}
                  onToggleStarred={onToggleStarred}
                  onToggleWorkoutMenu={onToggleWorkoutMenu}
                  onOpenEditModal={onOpenEditModal}
                  onDeleteWorkout={onDeleteWorkout}
                />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
});

const HistoryWorkoutRow = React.memo(function HistoryWorkoutRow({
  workout,
  isExpanded,
  isMenuOpen,
  onRowClick,
  onToggleStarred,
  onToggleWorkoutMenu,
  onOpenEditModal,
  onDeleteWorkout,
}) {
  const workoutName = workout.templateName || workout.exercise;
  const [shouldRenderDetails, setShouldRenderDetails] = React.useState(isExpanded);
  const [detailsState, setDetailsState] = React.useState(isExpanded ? 'open' : 'closed');
  const menuTriggerRef = React.useRef(null);
  const [menuPosition, setMenuPosition] = React.useState(null);

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

  React.useEffect(() => {
    if (!isMenuOpen) {
      setMenuPosition(null);
      return undefined;
    }

    const updateMenuPosition = () => {
      const trigger = menuTriggerRef.current;

      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const menuWidth = 160;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const desiredLeft = rect.right - menuWidth;
      const left = Math.min(
        Math.max(12, desiredLeft),
        Math.max(12, viewportWidth - menuWidth - 12)
      );
      const openUpward = rect.bottom + 156 > viewportHeight - 12;

      setMenuPosition({
        left,
        top: openUpward ? rect.top - 8 : rect.bottom + 8,
        openUpward,
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isMenuOpen]);

  return (
    <>
      <tr
        onClick={() => onRowClick(workout.id)}
        className={[
          isExpanded ? "history-row-expanded history-row" : "history-row",
          workout.starred ? "history-row-starred" : "",
        ].filter(Boolean).join(" ")}
        style={{ cursor: "pointer" }}
      >
        <td className="history-workout-cell">
          <span className="history-workout-leading">
            <button
              type="button"
              className={workout.starred ? "history-star-button is-starred" : "history-star-button"}
              aria-label={workout.starred ? `Unstar ${workoutName}` : `Star ${workoutName}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleStarred(workout);
              }}
            >
              <span className="history-star-glyph" aria-hidden="true" />
            </button>
          </span>
          <span
            className={workout.isMixed ? "history-workout-name is-mixed" : "history-workout-name"}
            style={workout.isMixed ? undefined : { color: getWorkoutColor(workout) }}
          >
            {workoutName}
          </span>
        </td>
        <td>{workout.notes}</td>
        <td
          className="workout-actions-cell"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="workout-actions-menu">
            <button
              ref={menuTriggerRef}
              type="button"
              className="workout-menu-trigger"
              aria-label={`Manage workout ${workoutName}`}
              onClick={() => onToggleWorkoutMenu(workout.id)}
            >
              ...
            </button>
          </div>
        </td>
      </tr>
      {shouldRenderDetails && (
        <tr className={detailsState === 'open' ? "history-row-details is-open" : "history-row-details is-closing"}>
          <td colSpan={3}>
            <div className={detailsState === 'open' ? "history-details-content is-open" : "history-details-content is-closing"}>
              <div className={detailsState === 'open' ? "history-details-panel is-open" : "history-details-panel is-closing"}>
                {renderWorkoutDetails(workout)}
              </div>
            </div>
          </td>
        </tr>
      )}
      {isMenuOpen && menuPosition && typeof document !== 'undefined' && createPortal(
        <div
          className={menuPosition.openUpward ? "workout-menu-popover workout-menu-popover-overlay is-open-upward" : "workout-menu-popover workout-menu-popover-overlay"}
          style={{
            position: 'fixed',
            left: `${menuPosition.left}px`,
            top: menuPosition.openUpward ? 'auto' : `${menuPosition.top}px`,
            bottom: menuPosition.openUpward ? `${window.innerHeight - menuPosition.top}px` : 'auto',
          }}
        >
          <button
            type="button"
            className="workout-menu-item"
            onClick={() => onOpenEditModal(workout)}
          >
            Edit
          </button>
          <button
            type="button"
            className="workout-menu-item delete"
            onClick={() => onDeleteWorkout(workout.id)}
          >
            Delete
          </button>
        </div>,
        document.body
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
      const group = { key, label, days: [], dayMap: new Map() };
      groupMap.set(key, group);
      groups.push(group);
    }

    const monthGroup = groupMap.get(key);
    const dayKey = workout.date;

    if (!monthGroup.dayMap.has(dayKey)) {
      const dayGroup = {
        key: dayKey,
        label: formatWorkoutDate(workout.date),
        workouts: [],
      };
      monthGroup.dayMap.set(dayKey, dayGroup);
      monthGroup.days.push(dayGroup);
    }

    monthGroup.dayMap.get(dayKey).workouts.push(workout);
  });

  return groups.map(({ dayMap, ...group }) => group);
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
  const inferredFields = inferWorkoutFields(workout?.sets || []);

  return {
    ...workout,
    notes: workout.notes || '',
    starred: Boolean(workout.starred),
    fields: hasTrackedWorkoutFields(workout.fields) ? workout.fields : inferredFields,
    sets: Array.isArray(workout.sets)
      ? workout.sets.map((set, index) => ({ ...set, id: set.id ?? index + 1, setType: normalizeSetType(set.setType) }))
      : [],
  };
}

function buildDraftSet(workout, workouts, id) {
  const fields = workout?.fields || {};
  if (workout?.isMixed) {
    const firstTemplateSet = workouts
      .flatMap((currentWorkout) => Array.isArray(currentWorkout.sets) ? currentWorkout.sets : [])
      .find((set) => set.templateId);

    return {
      id,
      setType: 'regular',
      templateId: firstTemplateSet?.templateId || '',
      templateName: firstTemplateSet?.templateName || '',
      fields: firstTemplateSet?.fields || {},
      measurements: firstTemplateSet?.measurements || {},
      ...copyHistorySetFields(firstTemplateSet || {}, firstTemplateSet?.fields || {}),
    };
  }

  return {
    id,
    setType: 'regular',
    ...(fields?.reps ? { reps: '' } : {}),
    ...(fields?.weight ? { weight: '' } : {}),
    ...(fields?.duration ? { duration: '' } : {}),
    ...(fields?.distance ? { distance: '' } : {}),
  };
}

function copyHistorySetFields(sourceSet, fields) {
  return {
    ...(fields?.reps ? { reps: sourceSet?.reps ?? '' } : {}),
    ...(fields?.weight ? { weight: sourceSet?.weight ?? '' } : {}),
    ...(fields?.duration ? { duration: sourceSet?.duration ?? '' } : {}),
    ...(fields?.distance ? { distance: sourceSet?.distance ?? '' } : {}),
  };
}

function inferWorkoutFields(sets) {
  return {
    reps: sets.some((set) => hasWorkoutValue(set?.reps)),
    weight: sets.some((set) => hasWorkoutValue(set?.weight)),
    duration: sets.some((set) => hasWorkoutValue(set?.duration)),
    distance: sets.some((set) => hasWorkoutValue(set?.distance)),
    notes: true,
  };
}

function hasTrackedWorkoutFields(fields) {
  return Boolean(fields?.reps || fields?.weight || fields?.duration || fields?.distance);
}

function hasWorkoutValue(value) {
  return value !== undefined && value !== null && `${value}` !== '';
}

function getWorkoutMeasurements(workout, setOverride = null) {
  if (workout?.isMixed) {
    return setOverride?.measurements || workout?.measurements || {};
  }

  return workout?.measurements || {};
}

function getMixedWorkoutTemplateOptions(workouts) {
  const templateMap = new Map();

  workouts.forEach((workout) => {
    (workout.sets || []).forEach((set) => {
      if (set.templateId && set.templateName && !templateMap.has(set.templateId)) {
        templateMap.set(set.templateId, { value: set.templateId, label: set.templateName, color: getWorkoutColor(set) });
      }
    });
  });

  return Array.from(templateMap.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function normalizeSetType(value) {
  return ['regular', 'warmup', 'max'].includes(value) ? value : 'regular';
}

function getSetDisplayLabel(set, sets, index) {
  const setType = normalizeSetType(set?.setType);

  if (setType === 'warmup') {
    return 'Warmup';
  }

  if (setType === 'max') {
    return 'Max';
  }

  return sets
    .slice(0, index + 1)
    .filter((currentSet) => normalizeSetType(currentSet?.setType) === 'regular')
    .length;
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

function formatMeasurementLabel(value, fallback) {
  switch (value) {
    case 'kgs':
      return 'kg';
    case 'kms':
      return 'km';
    case 'meters':
      return 'm';
    case 'feet':
      return 'ft';
    case 'miles':
      return 'mi';
    case 'lbs':
      return 'lbs';
    default:
      return fallback;
  }
}

function getFieldUnitSuffix(field, measurements) {
  if (field.key === 'weight') {
    return formatMeasurementLabel(measurements?.weight, 'lbs');
  }

  if (field.key === 'distance') {
    return formatMeasurementLabel(measurements?.distance, 'mi');
  }

  return '';
}

