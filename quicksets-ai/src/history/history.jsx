import React from 'react';
import { createPortal } from 'react-dom';
import { Dropdown } from '../components/dropdown';
import { MultiSelectDropdown } from '../components/multiSelectDropdown';
import {
  formatMeasurementLabel,
  getSetDisplayLabel,
  normalizeSetType,
  parseLocalDate,
} from '../utils/workoutDomain';
import "./history.css";
import {
  findWorkoutColorSlot,
  getWorkoutColor,
  getWorkoutColorPreferenceLabel,
  getWorkoutColorPreferenceValue,
  resolveWorkoutColorPreferences,
  workoutColorPalette,
} from "../utils/workoutColors";

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

export function History({ currentUser = null, setCurrentUser = null }) {
  const [workouts, setWorkouts] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [historyView, setHistoryView] = React.useState('date');
  const [expandedWorkoutId, setExpandedWorkoutId] = React.useState(null);
  const [expandedGroupWorkoutKeys, setExpandedGroupWorkoutKeys] = React.useState([]);
  const [expandedGroupedSessionId, setExpandedGroupedSessionId] = React.useState(null);
  const [editingWorkout, setEditingWorkout] = React.useState(null);
  const [draftWorkout, setDraftWorkout] = React.useState(null);
  const [editingGroup, setEditingGroup] = React.useState(null);
  const [groupDraft, setGroupDraft] = React.useState({ label: '', color: '' });
  const [isSavingGroup, setIsSavingGroup] = React.useState(false);
  const [isExerciseSelectionMode, setIsExerciseSelectionMode] = React.useState(false);
  const [selectedExerciseKeys, setSelectedExerciseKeys] = React.useState([]);
  const [showSelectionGroupPicker, setShowSelectionGroupPicker] = React.useState(false);
  const [editingColorSlot, setEditingColorSlot] = React.useState('');
  const [colorPreferenceDraft, setColorPreferenceDraft] = React.useState({ label: '', color: '' });
  const [isSavingColorPreference, setIsSavingColorPreference] = React.useState(false);
  const [isApplyingSelectionAction, setIsApplyingSelectionAction] = React.useState(false);
  const [openWorkoutMenuId, setOpenWorkoutMenuId] = React.useState(null);
  const [showFilterMenu, setShowFilterMenu] = React.useState(false);
  const [workoutFilters, setWorkoutFilters] = React.useState([]);
  const [monthFilters, setMonthFilters] = React.useState([]);
  const [yearFilters, setYearFilters] = React.useState([]);
  const [starredOnly, setStarredOnly] = React.useState(false);
  const [showImportModal, setShowImportModal] = React.useState(false);
  const [importFile, setImportFile] = React.useState(null);
  const [importPastedText, setImportPastedText] = React.useState('');
  const [importNotes, setImportNotes] = React.useState('');
  const [importPreview, setImportPreview] = React.useState(null);
  const [isPreviewingImport, setIsPreviewingImport] = React.useState(false);
  const [isImportingWorkouts, setIsImportingWorkouts] = React.useState(false);
  const filterMenuRef = React.useRef(null);
  const workoutColorPreferences = React.useMemo(
    () => resolveWorkoutColorPreferences(currentUser?.workoutColorPreferences, currentUser?.workoutColorLabels),
    [currentUser?.workoutColorPreferences, currentUser?.workoutColorLabels]
  );

  React.useEffect(() => {
    loadWorkouts();
  }, []);

  React.useEffect(() => {
    const handlePointerDown = (event) => {
      if (!filterMenuRef.current?.contains(event.target)) {
        setShowFilterMenu(false);
      }
    };

    const handleViewportChange = (event) => {
      const didScrollInsideFilter = event?.type === 'scroll'
        && filterMenuRef.current?.contains(event.target);

      if (didScrollInsideFilter) {
        return;
      }

      setShowFilterMenu(false);
      setOpenWorkoutMenuId(null);
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

  const workoutFilterOptions = React.useMemo(
    () => {
      const optionMap = new Map();

      workouts.forEach((workout) => {
        const workoutName = workout.templateName || workout.exercise;
        if (!workoutName || optionMap.has(workoutName)) {
          return;
        }

        const color = getWorkoutColor(workout);
        const slotColor = findWorkoutColorSlot(color, workoutColorPreferences);
        const badge = getWorkoutColorPreferenceLabel(slotColor, workoutColorPreferences);

        optionMap.set(workoutName, {
          value: workoutName,
          label: workoutName,
          color,
          ...(badge ? { badge, badgeColor: color } : {}),
        });
      });

      return Array.from(optionMap.values()).sort((left, right) => left.label.localeCompare(right.label));
    },
    [workouts, workoutColorPreferences]
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
  const groupedByColor = React.useMemo(
    () => groupWorkoutsByColorGroup(filteredWorkouts, workoutColorPreferences),
    [filteredWorkouts, workoutColorPreferences]
  );
  const selectableExerciseGroups = React.useMemo(
    () => flattenHistoryExerciseGroups(groupedByColor),
    [groupedByColor]
  );
  const selectableExerciseKeySet = React.useMemo(
    () => new Set(selectableExerciseGroups.map((group) => group.selectionKey)),
    [selectableExerciseGroups]
  );
  const selectedExerciseKeySet = React.useMemo(
    () => new Set(selectedExerciseKeys),
    [selectedExerciseKeys]
  );
  const selectedExerciseGroups = React.useMemo(
    () => selectableExerciseGroups.filter((group) => selectedExerciseKeySet.has(group.selectionKey)),
    [selectableExerciseGroups, selectedExerciseKeySet]
  );
  const selectedExerciseTemplateIds = React.useMemo(
    () => Array.from(new Set(
      selectedExerciseGroups.flatMap((group) => Array.isArray(group.templateIds) ? group.templateIds : [])
    )),
    [selectedExerciseGroups]
  );
  const canMergeSelectedExercises = React.useMemo(
    () => selectedExerciseTemplateIds.length >= 2 && selectedExerciseGroupsHaveMatchingFields(selectedExerciseGroups),
    [selectedExerciseGroups, selectedExerciseTemplateIds]
  );
  const activeFilterCount = workoutFilters.length + monthFilters.length + yearFilters.length + (starredOnly ? 1 : 0);

  React.useEffect(() => {
    if (!isExerciseSelectionMode) {
      return;
    }

    setSelectedExerciseKeys((currentKeys) => {
      const nextKeys = currentKeys.filter((key) => selectableExerciseKeySet.has(key));
      if (nextKeys.length === 0) {
        setIsExerciseSelectionMode(false);
      }
      return nextKeys;
    });
  }, [isExerciseSelectionMode, selectableExerciseKeySet]);

  React.useEffect(() => {
    if (historyView !== 'group') {
      setIsExerciseSelectionMode(false);
      setSelectedExerciseKeys([]);
      setShowSelectionGroupPicker(false);
    }
  }, [historyView]);

  const handleRowClick = React.useCallback((id) => {
    setExpandedWorkoutId((current) =>
      current === id ? null : id
    );
  }, []);
  const toggleGroupWorkoutKey = React.useCallback((groupWorkoutKey) => {
    setExpandedGroupWorkoutKeys((currentKeys) =>
      currentKeys.includes(groupWorkoutKey)
        ? currentKeys.filter((key) => key !== groupWorkoutKey)
        : [...currentKeys, groupWorkoutKey]
    );
  }, []);
  const toggleGroupedSessionId = React.useCallback((workoutId) => {
    setExpandedGroupedSessionId((currentId) =>
      currentId === workoutId ? null : workoutId
    );
  }, []);
  const beginExerciseSelection = React.useCallback((selectionKey) => {
    setIsExerciseSelectionMode(true);
    setSelectedExerciseKeys((currentKeys) =>
      currentKeys.includes(selectionKey) ? currentKeys : [...currentKeys, selectionKey]
    );
  }, []);
  const toggleExerciseSelection = React.useCallback((selectionKey) => {
    setSelectedExerciseKeys((currentKeys) => {
      const nextKeys = currentKeys.includes(selectionKey)
        ? currentKeys.filter((key) => key !== selectionKey)
        : [...currentKeys, selectionKey];

      if (nextKeys.length === 0) {
        setIsExerciseSelectionMode(false);
      }

      return nextKeys;
    });
  }, []);
  const clearExerciseSelection = React.useCallback(() => {
    setIsExerciseSelectionMode(false);
    setSelectedExerciseKeys([]);
    setShowSelectionGroupPicker(false);
    setEditingColorSlot('');
    setColorPreferenceDraft({ label: '', color: '' });
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

  const openGroupEditor = React.useCallback((group) => {
    const slotColor = group.slotColor;
    setEditingGroup({
      slotColor,
      fallbackLabel: group.fallbackLabel || `${colorSlotNames[slotColor] || 'Unlabeled'} Group`,
    });
    setGroupDraft({
      label: getWorkoutColorPreferenceLabel(slotColor, workoutColorPreferences),
      color: getWorkoutColorPreferenceValue(slotColor, workoutColorPreferences),
    });
    setOpenWorkoutMenuId(null);
  }, [workoutColorPreferences]);

  const closeGroupEditor = React.useCallback(() => {
    setEditingGroup(null);
    setGroupDraft({ label: '', color: '' });
    setIsSavingGroup(false);
  }, []);

  const handleSaveGroupPreference = React.useCallback(async (event) => {
    event.preventDefault();

    if (!editingGroup) {
      return;
    }

    const slotColor = editingGroup.slotColor;
    const trimmedLabel = groupDraft.label.trim();
    const normalizedColor = /^#[0-9a-f]{6}$/i.test(groupDraft.color)
      ? groupDraft.color.toLowerCase()
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
      alert('Each exercise group color needs to stay unique.');
      return;
    }

    setIsSavingGroup(true);

    try {
      const response = await fetch('/api/user/color-preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ workoutColorPreferences: nextPreferences }),
      });
      const body = await response.json();

      if (!response.ok) {
        alert(body.msg || 'Failed to save exercise group');
        setIsSavingGroup(false);
        return;
      }

      const nextResolvedPreferences = resolveWorkoutColorPreferences(
        body?.workoutColorPreferences,
        body?.workoutColorLabels
      );
      const colorUpdates = workoutColorPalette
        .map((paletteSlot) => ({
          previousColor: getWorkoutColorPreferenceValue(paletteSlot, workoutColorPreferences),
          nextColor: getWorkoutColorPreferenceValue(paletteSlot, nextResolvedPreferences),
        }))
        .filter(({ previousColor, nextColor }) => previousColor !== nextColor);
      const remapColor = (colorValue) => {
        const matchedUpdate = colorUpdates.find(({ previousColor }) => previousColor === colorValue);
        return matchedUpdate ? matchedUpdate.nextColor : colorValue;
      };

      if (colorUpdates.length > 0) {
        setWorkouts((currentWorkouts) =>
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

      if (setCurrentUser) {
        setCurrentUser((current) => ({
          ...(current || {}),
          ...body,
        }));
      }

      closeGroupEditor();
    } catch (err) {
      console.error('Failed to save exercise group:', err);
      alert('Failed to save exercise group');
      setIsSavingGroup(false);
    }
  }, [closeGroupEditor, editingGroup, groupDraft, setCurrentUser, workoutColorPreferences]);

  const remapWorkoutColorsFromPreferences = React.useCallback((nextUserPayload) => {
    const nextResolvedPreferences = resolveWorkoutColorPreferences(
      nextUserPayload?.workoutColorPreferences,
      nextUserPayload?.workoutColorLabels
    );
    const colorUpdates = workoutColorPalette
      .map((paletteSlot) => ({
        previousColor: getWorkoutColorPreferenceValue(paletteSlot, workoutColorPreferences),
        nextColor: getWorkoutColorPreferenceValue(paletteSlot, nextResolvedPreferences),
      }))
      .filter(({ previousColor, nextColor }) => previousColor !== nextColor);
    const remapColor = (colorValue) => {
      const matchedUpdate = colorUpdates.find(({ previousColor }) => previousColor === colorValue);
      return matchedUpdate ? matchedUpdate.nextColor : colorValue;
    };

    if (colorUpdates.length > 0) {
      setWorkouts((currentWorkouts) =>
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

    if (setCurrentUser) {
      setCurrentUser((current) => ({
        ...(current || {}),
        ...nextUserPayload,
      }));
    }
  }, [setCurrentUser, workoutColorPreferences]);

  const openSelectionGroupPicker = React.useCallback(() => {
    if (selectedExerciseTemplateIds.length === 0) {
      alert('Select at least one exercise with a saved template first.');
      return;
    }

    setShowSelectionGroupPicker(true);
    setEditingColorSlot('');
    setColorPreferenceDraft({ label: '', color: '' });
  }, [selectedExerciseTemplateIds]);

  const closeSelectionGroupPicker = React.useCallback(() => {
    setShowSelectionGroupPicker(false);
    setEditingColorSlot('');
    setColorPreferenceDraft({ label: '', color: '' });
    setIsSavingColorPreference(false);
  }, []);

  const startEditingColorPreference = React.useCallback((slotColor) => {
    setEditingColorSlot(slotColor);
    setColorPreferenceDraft({
      label: getWorkoutColorPreferenceLabel(slotColor, workoutColorPreferences),
      color: getWorkoutColorPreferenceValue(slotColor, workoutColorPreferences),
    });
  }, [workoutColorPreferences]);

  const handleSaveColorPreference = React.useCallback(async (slotColor) => {
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
      alert('Each exercise group color needs to stay unique.');
      return;
    }

    setIsSavingColorPreference(true);

    try {
      const response = await fetch('/api/user/color-preferences', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ workoutColorPreferences: nextPreferences }),
      });
      const body = await response.json();

      if (!response.ok) {
        alert(body.msg || 'Failed to save exercise groups');
        setIsSavingColorPreference(false);
        return;
      }

      remapWorkoutColorsFromPreferences(body);
      setEditingColorSlot('');
      setColorPreferenceDraft({ label: '', color: '' });
    } catch (err) {
      console.error('Failed to save exercise groups:', err);
      alert('Failed to save exercise groups');
    } finally {
      setIsSavingColorPreference(false);
    }
  }, [colorPreferenceDraft, remapWorkoutColorsFromPreferences, workoutColorPreferences]);

  const handleAssignSelectedExercisesToGroup = React.useCallback(async (slotColor) => {
    if (selectedExerciseTemplateIds.length === 0) {
      alert('Select at least one exercise with a saved template first.');
      return;
    }

    setIsApplyingSelectionAction(true);

    try {
      const response = await fetch('/api/workout-templates/group', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          templateIds: selectedExerciseTemplateIds,
          color: getWorkoutColorPreferenceValue(slotColor, workoutColorPreferences),
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(body.msg || 'Failed to add exercises to group');
        return;
      }

      await loadWorkouts();
      clearExerciseSelection();
    } catch (err) {
      console.error('Failed to add exercises to group:', err);
      alert('Failed to add exercises to group');
    } finally {
      setIsApplyingSelectionAction(false);
    }
  }, [clearExerciseSelection, selectedExerciseTemplateIds, workoutColorPreferences]);

  const handleDeleteSelectedExercises = React.useCallback(async () => {
    if (selectedExerciseTemplateIds.length === 0) {
      alert('Select at least one exercise with a saved template first.');
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedExerciseTemplateIds.length} exercise${selectedExerciseTemplateIds.length === 1 ? '' : 's'}? This will delete their templates and all matching sessions.`
    );

    if (!confirmed) {
      return;
    }

    setIsApplyingSelectionAction(true);

    try {
      for (const templateId of selectedExerciseTemplateIds) {
        const response = await fetch(`/api/workout-templates/${templateId}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          alert(body.msg || 'Failed to delete selected exercises');
          return;
        }
      }

      await loadWorkouts();
      clearExerciseSelection();
    } catch (err) {
      console.error('Failed to delete selected exercises:', err);
      alert('Failed to delete selected exercises');
    } finally {
      setIsApplyingSelectionAction(false);
    }
  }, [clearExerciseSelection, selectedExerciseTemplateIds]);

  const handleMergeSelectedExercises = React.useCallback(async () => {
    if (selectedExerciseTemplateIds.length < 2) {
      alert('Select at least two exercises to merge.');
      return;
    }

    if (!selectedExerciseGroupsHaveMatchingFields(selectedExerciseGroups)) {
      alert('Selected exercises must use the same fields before they can be merged.');
      return;
    }

    const targetGroup = selectedExerciseGroups.find((group) => group.templateIds?.[0]);
    const targetTemplateId = targetGroup?.templateIds?.[0] || selectedExerciseTemplateIds[0];
    const confirmed = window.confirm(
      `Merge ${selectedExerciseTemplateIds.length} exercises into ${targetGroup?.label || 'the first selected exercise'}? This will move their sessions into one exercise and remove the other templates.`
    );

    if (!confirmed) {
      return;
    }

    setIsApplyingSelectionAction(true);

    try {
      const response = await fetch('/api/workout-templates/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          templateIds: selectedExerciseTemplateIds,
          targetTemplateId,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(body.msg || 'Failed to merge selected exercises');
        return;
      }

      await loadWorkouts();
      clearExerciseSelection();
    } catch (err) {
      console.error('Failed to merge selected exercises:', err);
      alert('Failed to merge selected exercises');
    } finally {
      setIsApplyingSelectionAction(false);
    }
  }, [clearExerciseSelection, selectedExerciseGroups, selectedExerciseTemplateIds]);

  const handleDeleteWorkout = React.useCallback(async (workoutId) => {
    setOpenWorkoutMenuId(null);

    try {
      const response = await fetch(`/api/workouts/${workoutId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const body = await response.json();
        alert(body.msg || 'Failed to delete session');
        return;
      }

      setWorkouts((currentWorkouts) =>
        currentWorkouts.filter((workout) => workout.id !== workoutId)
      );
      setExpandedWorkoutId((current) => current === workoutId ? null : current);
      setExpandedGroupedSessionId((currentId) => currentId === workoutId ? null : currentId);
    } catch (err) {
      console.error('Error deleting session:', err);
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
        alert(body.msg || 'Failed to update starred session');
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
      console.error('Error updating starred session:', err);
    }
  }, []);

  const handleSeparateWorkout = React.useCallback(async (workout) => {
    setOpenWorkoutMenuId(null);

    const confirmed = window.confirm(
      `Separate ${workout.templateName || workout.exercise}? This will split the full workout into its individual exercise sessions.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/workouts/${workout.id}/separate`, {
        method: 'POST',
        credentials: 'include',
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        alert(body?.msg || 'Failed to separate session');
        return;
      }

      setWorkouts((currentWorkouts) =>
        sortWorkouts([
          ...currentWorkouts.filter((currentWorkout) => currentWorkout.id !== workout.id),
          ...body,
        ])
      );
      setExpandedWorkoutId((currentId) => currentId === workout.id ? null : currentId);
    } catch (err) {
      console.error('Error separating session:', err);
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
        alert(body.msg || 'Failed to update session');
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
      console.error('Error updating session:', err);
    }
  };

  const clearAllFilters = () => {
    setWorkoutFilters([]);
    setMonthFilters([]);
    setYearFilters([]);
    setStarredOnly(false);
  };

  const closeImportModal = React.useCallback(() => {
    setShowImportModal(false);
    setImportFile(null);
    setImportPastedText('');
    setImportNotes('');
    setImportPreview(null);
    setIsPreviewingImport(false);
    setIsImportingWorkouts(false);
  }, []);

  const handleImportFileChange = React.useCallback(async (event) => {
    const [file] = Array.from(event.target.files || []);

    if (!file) {
      setImportFile(null);
      setImportPreview(null);
      return;
    }

    try {
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        const buffer = await file.arrayBuffer();
        setImportFile({
          name: file.name,
          type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          content: arrayBufferToBase64(buffer),
        });
      } else {
        const text = await file.text();
        setImportFile({
          name: file.name,
          type: file.type || 'text/plain',
          content: btoa(unescape(encodeURIComponent(text))),
        });
      }
      setImportPreview(null);
    } catch (err) {
      console.error('Error reading import file:', err);
      alert('Could not read that file.');
    } finally {
      event.target.value = '';
    }
  }, []);

  const handlePreviewImport = React.useCallback(async () => {
    if (!importFile && !importPastedText.trim()) {
      alert('Attach a file or paste session text first.');
      return;
    }

    setIsPreviewingImport(true);

    try {
      const response = await fetch('/api/workouts/import/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fileName: importFile?.name || '',
          fileMimeType: importFile?.type || '',
          fileContent: importFile?.content || '',
          pastedText: importPastedText,
          notes: importNotes,
        }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(body.msg || 'Failed to preview imported sessions');
        return;
      }

      setImportPreview(body);
    } catch (err) {
      console.error('Error previewing imported sessions:', err);
      alert('Failed to preview imported sessions');
    } finally {
      setIsPreviewingImport(false);
    }
  }, [importFile, importNotes, importPastedText]);

  const handleConfirmImport = React.useCallback(async () => {
    if (!importPreview) {
      return;
    }

    setIsImportingWorkouts(true);

    try {
      const response = await fetch('/api/workouts/import/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(importPreview),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(body.msg || 'Failed to import sessions');
        return;
      }

      await loadWorkouts();
      closeImportModal();
      alert(`Imported ${body.importedWorkouts?.length || 0} session${body.importedWorkouts?.length === 1 ? '' : 's'}${(body.importedTemplates?.length || 0) > 0 ? ` and created ${body.importedTemplates.length} exercise${body.importedTemplates.length === 1 ? '' : 's'}` : ''}.`);
    } catch (err) {
      console.error('Error importing sessions:', err);
      alert('Failed to import sessions');
    } finally {
      setIsImportingWorkouts(false);
    }
  }, [closeImportModal, importPreview]);

  return (
    <main>
      <section className="main-formatting">
        <section className="history-filter-bar">
          <div className="history-filter-copy">
            <p className="history-kicker">History</p>
            <h2>{filteredWorkouts.length} session{filteredWorkouts.length === 1 ? "" : "s"}</h2>
            <p className="history-summary">
              {historyView === 'date'
                ? `${groupedWorkouts.length} month${groupedWorkouts.length === 1 ? "" : "s"}`
                : `${groupedByColor.length} group${groupedByColor.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="history-toolbar-actions">
            <div className="history-view-toggle" role="tablist" aria-label="History view">
              <button
                type="button"
                className={historyView === 'date' ? "history-view-toggle-button is-active" : "history-view-toggle-button"}
                role="tab"
                aria-selected={historyView === 'date'}
                onClick={() => setHistoryView('date')}
              >
                By Date
              </button>
              <button
                type="button"
                className={historyView === 'group' ? "history-view-toggle-button is-active" : "history-view-toggle-button"}
                role="tab"
                aria-selected={historyView === 'group'}
                onClick={() => setHistoryView('group')}
              >
                By Group
              </button>
            </div>
          </div>
        </section>

        <section className="history-controls-bar">
          <button
            type="button"
            className="history-import-trigger"
            onClick={() => setShowImportModal(true)}
          >
            Import sessions
          </button>
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
                      <span>Exercise</span>
                      {workoutFilters.length > 0 && (
                        <button type="button" className="history-filter-clear" onClick={() => setWorkoutFilters([])}>
                          Clear
                        </button>
                      )}
                    </div>
                    <MultiSelectDropdown
                      values={workoutFilters}
                      onChange={setWorkoutFilters}
                      options={workoutFilterOptions}
                      placeholder="All exercises"
                      ariaLabel="Filter by exercise"
                      searchable
                      searchPlaceholder="Search exercises"
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
              <h2>Loading sessions...</h2>
              <p className="history-summary">Pulling your training log together.</p>
            </div>
            <div className="history-loading-list">
              <div className="history-loading-card" />
              <div className="history-loading-card" />
              <div className="history-loading-card" />
            </div>
          </section>
        )}

        {!isLoading && filteredWorkouts.length === 0 && (
          <section className="history-empty-state">
            <p>No matches.</p>
          </section>
        )}

        {!isLoading && historyView === 'date' && groupedWorkouts.map((group) => (
          <HistoryMonthSection
            key={group.key}
            group={group}
            expandedWorkoutId={expandedWorkoutId}
            openWorkoutMenuId={openWorkoutMenuId}
            onRowClick={handleRowClick}
            onToggleStarred={handleToggleStarred}
            onToggleWorkoutMenu={toggleWorkoutMenu}
            onOpenEditModal={openEditModal}
            onSeparateWorkout={handleSeparateWorkout}
            onDeleteWorkout={handleDeleteWorkout}
          />
        ))}

        {!isLoading && historyView === 'group' && groupedByColor.map((group) => (
          <HistoryColorGroupSection
            key={group.key}
            group={group}
            expandedWorkoutKeys={expandedGroupWorkoutKeys}
            expandedSessionId={expandedGroupedSessionId}
            openWorkoutMenuId={openWorkoutMenuId}
            isSelectionMode={isExerciseSelectionMode}
            selectedExerciseKeys={selectedExerciseKeySet}
            onToggleGroupWorkout={toggleGroupWorkoutKey}
            onToggleSession={toggleGroupedSessionId}
            onBeginExerciseSelection={beginExerciseSelection}
            onToggleExerciseSelection={toggleExerciseSelection}
            onOpenGroupEditor={openGroupEditor}
            onToggleStarred={handleToggleStarred}
            onToggleWorkoutMenu={toggleWorkoutMenu}
            onOpenEditModal={openEditModal}
            onSeparateWorkout={handleSeparateWorkout}
            onDeleteWorkout={handleDeleteWorkout}
          />
        ))}

        {isExerciseSelectionMode && (
          <HistoryExerciseSelectionBar
            selectedCount={selectedExerciseGroups.length}
            canMerge={canMergeSelectedExercises}
            hasTemplateSelection={selectedExerciseTemplateIds.length > 0}
            isBusy={isApplyingSelectionAction}
            onDelete={handleDeleteSelectedExercises}
            onMerge={handleMergeSelectedExercises}
            onAddToGroup={openSelectionGroupPicker}
            onClear={clearExerciseSelection}
          />
        )}
      </section>

      {showSelectionGroupPicker && (
        <HistorySelectionGroupPickerModal
          workoutColorPreferences={workoutColorPreferences}
          editingColorSlot={editingColorSlot}
          colorPreferenceDraft={colorPreferenceDraft}
          isSavingColorPreference={isSavingColorPreference}
          isApplyingSelectionAction={isApplyingSelectionAction}
          onClose={closeSelectionGroupPicker}
          onPickGroup={handleAssignSelectedExercisesToGroup}
          onStartEditingColorPreference={startEditingColorPreference}
          onColorPreferenceDraftChange={setColorPreferenceDraft}
          onCancelEditingColorPreference={() => {
            setEditingColorSlot('');
            setColorPreferenceDraft({ label: '', color: '' });
          }}
          onSaveColorPreference={handleSaveColorPreference}
        />
      )}

      {editingGroup && (
        <div className="history-modal-backdrop history-group-editor-backdrop" role="presentation">
          <div className="history-modal history-group-editor-modal" role="dialog" aria-modal="true" aria-labelledby="history-group-editor-title">
            <button type="button" className="history-close-button is-icon" onClick={closeGroupEditor} aria-label="Close group editor">
              Ã—
            </button>
            <div className="history-modal-header">
              <div>
                <p className="history-modal-eyebrow">Exercise Group</p>
                <h2 id="history-group-editor-title">Edit group</h2>
              </div>
              <div className="modal-header-actions">
                <button type="submit" form="history-group-editor-form" className="btn btn-primary" disabled={isSavingGroup}>
                  {isSavingGroup ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <form id="history-group-editor-form" className="history-modal-form" onSubmit={handleSaveGroupPreference}>
              <section className="history-modal-panel history-group-editor-panel">
                <label>
                  Group name
                  <input
                    type="text"
                    value={groupDraft.label}
                    onChange={(event) => setGroupDraft((currentDraft) => ({
                      ...currentDraft,
                      label: event.target.value,
                    }))}
                    placeholder={editingGroup.fallbackLabel}
                    maxLength={32}
                  />
                </label>
                <p className="history-group-editor-hint">
                  Leave blank to use {editingGroup.fallbackLabel}.
                </p>
                <label>
                  Group color
                  <div className="history-group-color-fields">
                    <input
                      type="color"
                      value={groupDraft.color || getWorkoutColorPreferenceValue(editingGroup.slotColor, workoutColorPreferences)}
                      onChange={(event) => setGroupDraft((currentDraft) => ({
                        ...currentDraft,
                        color: event.target.value.toLowerCase(),
                      }))}
                    />
                    <input
                      type="text"
                      value={groupDraft.color || getWorkoutColorPreferenceValue(editingGroup.slotColor, workoutColorPreferences)}
                      onChange={(event) => setGroupDraft((currentDraft) => ({
                        ...currentDraft,
                        color: event.target.value,
                      }))}
                      placeholder="#3b82f6"
                      maxLength={7}
                    />
                  </div>
                </label>
              </section>
            </form>
          </div>
        </div>
      )}

      {editingWorkout && draftWorkout && (
        <div className="history-modal-backdrop" role="presentation">
          <div className="history-modal" role="dialog" aria-modal="true" aria-labelledby="edit-workout-title">
            <button type="button" className="history-close-button is-icon" onClick={closeEditModal} aria-label="Close session editor">
              ×
            </button>
            <div className="history-modal-header">
              <div>
                <p className="history-modal-eyebrow">Edit Session</p>
                <h2 id="edit-workout-title">{editingWorkout.templateName || editingWorkout.exercise}</h2>
              </div>
              <div className="modal-header-actions">
                <button type="submit" form="history-workout-form" className="btn btn-primary">
                  Save
                </button>
              </div>
            </div>

            <form id="history-workout-form" className="history-modal-form" onSubmit={handleSaveWorkout}>
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
                <span>Star this session</span>
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
                              Exercise
                              <Dropdown
                                value={set.templateId || ''}
                                onChange={(nextValue) => handleDraftSetChange(set.id, 'templateId', nextValue)}
                                searchable
                                searchPlaceholder="Search exercises"
                                 options={getMixedWorkoutTemplateOptions(workouts, workoutColorPreferences)}
                                 ariaLabel={`Set ${set.id} exercise`}
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
                <button type="button" className="history-close-button" onClick={closeEditModal} aria-label="Close session editor">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <ImportWorkoutsModal
          importFile={importFile}
          importPastedText={importPastedText}
          importNotes={importNotes}
          importPreview={importPreview}
          isPreviewingImport={isPreviewingImport}
          isImportingWorkouts={isImportingWorkouts}
          onClose={closeImportModal}
          onFileChange={handleImportFileChange}
          onPastedTextChange={(value) => {
            setImportPastedText(value);
            setImportPreview(null);
          }}
          onNotesChange={(value) => {
            setImportNotes(value);
            setImportPreview(null);
          }}
          onPreview={handlePreviewImport}
          onConfirm={handleConfirmImport}
        />
      )}
    </main>
  );

  async function loadWorkouts() {
    return fetch('/api/workouts', {
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

function ImportWorkoutsModal({
  importFile,
  importPastedText,
  importNotes,
  importPreview,
  isPreviewingImport,
  isImportingWorkouts,
  onClose,
  onFileChange,
  onPastedTextChange,
  onNotesChange,
  onPreview,
  onConfirm,
}) {
  const previewWorkoutCount = importPreview?.workouts?.length || 0;
  const previewTemplateCount = importPreview?.templates?.length || 0;
  const skippedCount = importPreview?.skipped?.length || 0;

  return (
    <div className="history-modal-backdrop" role="presentation">
      <div className="history-modal history-import-modal" role="dialog" aria-modal="true" aria-labelledby="import-workouts-title">
        <button type="button" className="history-close-button is-icon" onClick={onClose} aria-label="Close import sessions">
          ×
        </button>
        <div className="history-modal-header">
          <div>
            <p className="history-modal-eyebrow">Import Sessions</p>
            <h2 id="import-workouts-title">Bring exercise sessions into QuickSets</h2>
          </div>
          <div className="modal-header-actions">
            {importPreview && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onConfirm}
                disabled={isImportingWorkouts || previewWorkoutCount === 0}
              >
                {isImportingWorkouts ? 'Importing...' : 'Confirm import'}
              </button>
            )}
          </div>
        </div>

        <div className="history-modal-form history-import-layout">
          <section className="history-modal-panel history-import-source-panel">
            <div className="history-modal-panel-header">
              <h3>Source</h3>
              {importFile && <span className="history-import-file-name">{importFile.name}</span>}
            </div>

            <label className="history-import-upload">
              <span>Attach a `.csv`, `.xlsx`, or text file</span>
              <div className="history-import-upload-row">
                <span className="history-import-upload-button">Choose file</span>
                <span className={importFile ? "history-import-upload-name has-file" : "history-import-upload-name"}>
                  {importFile?.name || 'No file selected'}
                </span>
              </div>
              <input
                type="file"
                accept=".csv,.xlsx,.txt,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={onFileChange}
              />
            </label>

            <label>
              Pasted text
              <textarea
                rows="8"
                value={importPastedText}
                onChange={(event) => onPastedTextChange(event.target.value)}
                placeholder="Paste session notes, exported rows, or copied sheet content here."
              />
            </label>

            <label>
              Additional notes for ChatGPT
              <textarea
                rows="4"
                value={importNotes}
                onChange={(event) => onNotesChange(event.target.value)}
                placeholder="Optional context, like unit assumptions or naming preferences."
              />
            </label>

            <p className="import-hint">
              We’ll send your file/text, notes, current exercises, and last 200 sessions to the backend AI importer. Nothing saves until you confirm the preview.
            </p>
          </section>

          <section className="history-modal-panel history-import-preview-panel">
            <div className="history-modal-panel-header">
              <h3>Preview</h3>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onPreview}
                disabled={isPreviewingImport}
              >
                {isPreviewingImport ? 'Analyzing...' : 'Preview import'}
              </button>
            </div>

            {importPreview ? (
              <div className="history-import-preview">
                <div className="history-import-summary-grid">
                  <div className="history-import-summary-card">
                    <span>Sessions</span>
                    <strong>{previewWorkoutCount}</strong>
                  </div>
                  <div className="history-import-summary-card">
                    <span>Exercises</span>
                    <strong>{previewTemplateCount}</strong>
                  </div>
                  <div className="history-import-summary-card">
                    <span>Skipped</span>
                    <strong>{skippedCount}</strong>
                  </div>
                </div>

                {importPreview.warnings?.length > 0 && (
                  <section className="history-import-section">
                    <h4>Warnings</h4>
                    <ul className="history-import-list">
                      {importPreview.warnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {importPreview.templates?.length > 0 && (
                  <section className="history-import-section">
                    <h4>Exercises to create or match</h4>
                    <div className="history-import-template-list">
                      {importPreview.templates.map((template) => (
                        <article key={template.name} className="history-import-template-card">
                          <div>
                            <strong>{template.name}</strong>
                            <p>{formatImportedTemplateMeta(template)}</p>
                          </div>
                          <span>{template.usesRestTimer ? `Rest ${template.restDuration}` : 'No rest timer'}</span>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {importPreview.workouts?.length > 0 ? (
                  <section className="history-import-section">
                    <h4>Sessions to import</h4>
                    <div className="history-import-workout-list">
                      {importPreview.workouts.map((workout, index) => (
                        <article key={`${workout.date}-${workout.templateName}-${index}`} className="history-import-workout-card">
                          <div className="history-import-workout-head">
                            <div>
                              <strong>{workout.templateName}</strong>
                              <p>{formatImportedWorkoutDate(workout.date)}</p>
                            </div>
                            <span>{workout.sets.length} set{workout.sets.length === 1 ? '' : 's'}</span>
                          </div>
                          {workout.notes && <p className="history-import-workout-notes">{workout.notes}</p>}
                          <div className="history-import-set-list">
                            {workout.sets.map((set, setIndex) => (
                              <span key={`${workout.templateName}-${workout.date}-${setIndex}`} className="history-import-set-chip">
                                {formatImportedSet(set, setIndex)}
                              </span>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="history-empty-state">
                    <p>No new sessions were found to import.</p>
                  </section>
                )}

                {importPreview.skipped?.length > 0 && (
                  <section className="history-import-section">
                    <h4>Skipped items</h4>
                    <div className="history-import-skipped-list">
                      {importPreview.skipped.map((entry, index) => (
                        <article key={`${entry.sourceReference}-${index}`} className="history-import-skipped-card">
                          <strong>{entry.sourceReference || 'Skipped entry'}</strong>
                          <p>{entry.reason}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <section className="history-empty-state">
                <p>Preview your import here before anything gets saved.</p>
              </section>
            )}
          </section>
        </div>

        <div className="history-modal-actions">
          <button type="button" className="history-close-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={importPreview ? onConfirm : onPreview}
            disabled={isPreviewingImport || isImportingWorkouts}
          >
            {importPreview
              ? (isImportingWorkouts ? 'Importing...' : 'Confirm import')
              : (isPreviewingImport ? 'Analyzing...' : 'Preview import')}
          </button>
        </div>
      </div>
    </div>
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

const HistoryMonthSection = React.memo(function HistoryMonthSection({
  group,
  expandedWorkoutId,
  openWorkoutMenuId,
  onRowClick,
  onToggleStarred,
  onToggleWorkoutMenu,
  onOpenEditModal,
  onSeparateWorkout,
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
                  onSeparateWorkout={onSeparateWorkout}
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

const HistoryColorGroupSection = React.memo(function HistoryColorGroupSection({
  group,
  expandedWorkoutKeys,
  expandedSessionId,
  openWorkoutMenuId,
  isSelectionMode,
  selectedExerciseKeys,
  onToggleGroupWorkout,
  onToggleSession,
  onBeginExerciseSelection,
  onToggleExerciseSelection,
  onOpenGroupEditor,
  onToggleStarred,
  onToggleWorkoutMenu,
  onOpenEditModal,
  onSeparateWorkout,
  onDeleteWorkout,
}) {
  const hasOpenMenu = group.workouts.some((workoutGroup) =>
    workoutGroup.sessions.some((workout) => workout.id === openWorkoutMenuId)
  );

  return (
    <section className={hasOpenMenu ? "history-month-group history-month-group-menu-open history-color-group" : "history-month-group history-color-group"}>
      <div className="history-group-heading" style={{ "--history-group-color": group.color }}>
        <span className="history-group-heading-copy">
          <span className="history-group-swatch" style={{ background: group.color }} aria-hidden="true" />
          <span>{group.label}</span>
        </span>
        <span className="history-group-heading-actions">
          <span className="history-group-meta">{group.sessionCount} sessions</span>
          <button
            type="button"
            className="history-group-edit-button"
            aria-label={`Edit ${group.label} group`}
            onClick={() => onOpenGroupEditor(group)}
          >
            {"\u270e"}
          </button>
        </span>
      </div>

      <div className="history-group-body">
        {group.workouts.map((workoutGroup) => {
          const workoutKey = `${group.key}:${workoutGroup.key}`;
          const isWorkoutExpanded = expandedWorkoutKeys.includes(workoutKey);
          const isExerciseSelected = selectedExerciseKeys.has(workoutKey);

          return (
            <section key={workoutKey} className="history-group-workout">
              <HistoryGroupWorkoutToggle
                workoutKey={workoutKey}
                workoutGroup={workoutGroup}
                isExpanded={isWorkoutExpanded}
                isSelected={isExerciseSelected}
                isSelectionMode={isSelectionMode}
                onToggleSessions={onToggleGroupWorkout}
                onBeginSelection={onBeginExerciseSelection}
                onToggleSelection={onToggleExerciseSelection}
              />

              {isWorkoutExpanded && (
                <table className="history-table table table-dark table-hover history-group-table">
                  <tbody>
                    {workoutGroup.sessions.map((workout) => (
                      <HistoryWorkoutRow
                        key={workout.id}
                        workout={workout}
                        isExpanded={expandedSessionId === workout.id}
                        isMenuOpen={openWorkoutMenuId === workout.id}
                        rowLabel={formatImportedWorkoutDate(workout.date)}
                        rowLabelClassName="history-group-session-date"
                        onRowClick={onToggleSession}
                        onToggleStarred={onToggleStarred}
                        onToggleWorkoutMenu={onToggleWorkoutMenu}
                        onOpenEditModal={onOpenEditModal}
                        onSeparateWorkout={onSeparateWorkout}
                        onDeleteWorkout={onDeleteWorkout}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
});

const HistoryGroupWorkoutToggle = React.memo(function HistoryGroupWorkoutToggle({
  workoutKey,
  workoutGroup,
  isExpanded,
  isSelected,
  isSelectionMode,
  onToggleSessions,
  onBeginSelection,
  onToggleSelection,
}) {
  const longPressTimerRef = React.useRef(null);
  const didLongPressRef = React.useRef(false);

  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  const handlePointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    clearLongPressTimer();
    didLongPressRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      didLongPressRef.current = true;
      onBeginSelection(workoutKey);
      window.navigator?.vibrate?.(12);
    }, 420);
  };

  const handlePrimaryClick = (event) => {
    if (didLongPressRef.current) {
      event.preventDefault();
      event.stopPropagation();
      didLongPressRef.current = false;
      return;
    }

    if (isSelectionMode) {
      onToggleSelection(workoutKey);
      return;
    }

    onToggleSessions(workoutKey);
  };

  const handleKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    if (isSelectionMode) {
      onToggleSelection(workoutKey);
      return;
    }

    onToggleSessions(workoutKey);
  };

  const toggleClassName = [
    'history-group-workout-toggle',
    isExpanded ? 'is-expanded' : '',
    isSelectionMode ? 'is-selection-mode' : '',
    isSelected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={toggleClassName}
      role="button"
      tabIndex={0}
      aria-pressed={isSelectionMode ? isSelected : undefined}
      onPointerDown={handlePointerDown}
      onPointerUp={clearLongPressTimer}
      onPointerCancel={clearLongPressTimer}
      onPointerLeave={clearLongPressTimer}
      onClick={handlePrimaryClick}
      onKeyDown={handleKeyDown}
    >
      {isSelectionMode && (
        <span className="history-group-workout-select-indicator" aria-hidden="true">
          {isSelected ? "\u2713" : ""}
        </span>
      )}
      <span className="history-group-workout-name" style={{ color: workoutGroup.color }}>
        {workoutGroup.label}
      </span>
      <button
        type="button"
        className="history-group-workout-session-toggle"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          clearLongPressTimer();
          onToggleSessions(workoutKey);
        }}
      >
        {workoutGroup.sessions.length} sessions
      </button>
    </div>
  );
});

const HistoryExerciseSelectionBar = React.memo(function HistoryExerciseSelectionBar({
  selectedCount,
  canMerge,
  hasTemplateSelection,
  isBusy,
  onDelete,
  onMerge,
  onAddToGroup,
  onClear,
}) {
  return (
    <aside className="history-selection-bar" aria-live="polite">
      <div className="history-selection-copy">
        <strong>{selectedCount}</strong>
        <span>exercise{selectedCount === 1 ? '' : 's'} selected</span>
      </div>
      <div className="history-selection-actions">
        <button type="button" className="history-selection-button danger" onClick={onDelete} disabled={isBusy || !hasTemplateSelection}>
          Delete
        </button>
        <button type="button" className="history-selection-button" onClick={onMerge} disabled={isBusy || !canMerge}>
          Merge
        </button>
        <button type="button" className="history-selection-button primary" onClick={onAddToGroup} disabled={isBusy || !hasTemplateSelection}>
          Add to group
        </button>
        <button type="button" className="history-selection-clear" onClick={onClear} disabled={isBusy}>
          Clear
        </button>
      </div>
    </aside>
  );
});

function HistorySelectionGroupPickerModal({
  workoutColorPreferences,
  editingColorSlot,
  colorPreferenceDraft,
  isSavingColorPreference,
  isApplyingSelectionAction,
  onClose,
  onPickGroup,
  onStartEditingColorPreference,
  onColorPreferenceDraftChange,
  onCancelEditingColorPreference,
  onSaveColorPreference,
}) {
  return (
    <div className="template-modal-backdrop is-stacked-modal history-selection-group-picker" role="presentation">
      <div className="template-modal color-picker-modal" role="dialog" aria-modal="true" aria-labelledby="selection-group-picker-title">
        <button type="button" className="template-close-button is-icon" onClick={onClose} aria-label="Close group picker">
          Ã—
        </button>
        <div className="template-modal-header">
          <div>
            <p className="template-eyebrow">Exercise Groups</p>
            <h2 id="selection-group-picker-title">Add selected exercises</h2>
          </div>
          <div className="modal-header-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>

        <div className="template-modal-form">
          <section className="template-color-panel">
            <div className="template-color-list" role="list" aria-label="Exercise groups">
              {workoutColorPalette.map((slotColor) => {
                const isEditing = editingColorSlot === slotColor;
                const rawLabel = getWorkoutColorPreferenceLabel(slotColor, workoutColorPreferences);
                const label = rawLabel || 'Unlabeled';
                const isUnlabeled = !rawLabel;
                const displayColor = getWorkoutColorPreferenceValue(slotColor, workoutColorPreferences);

                return (
                  <div
                    key={slotColor}
                    className="template-color-row"
                    style={{ "--template-color": displayColor }}
                    role="listitem"
                  >
                    <button
                      type="button"
                      className="template-color-row-main"
                      disabled={isApplyingSelectionAction}
                      onClick={() => onPickGroup(slotColor)}
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
                        aria-label={`Edit ${label} group`}
                        onClick={() => onStartEditingColorPreference(slotColor)}
                      >
                        {"\u270e"}
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
                              onChange={(event) => onColorPreferenceDraftChange((currentDraft) => ({
                                ...currentDraft,
                                color: event.target.value.toLowerCase(),
                              }))}
                            />
                            <input
                              type="text"
                              value={colorPreferenceDraft.color || displayColor}
                              onChange={(event) => onColorPreferenceDraftChange((currentDraft) => ({
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
                          onChange={(event) => onColorPreferenceDraftChange((currentDraft) => ({
                            ...currentDraft,
                            label: event.target.value,
                          }))}
                          maxLength={32}
                        />
                        <div className="template-color-label-actions">
                          <button
                            type="button"
                            className="template-close-button"
                            onClick={onCancelEditingColorPreference}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => onSaveColorPreference(slotColor)}
                            disabled={isSavingColorPreference}
                          >
                            {isSavingColorPreference ? 'Saving...' : 'Save'}
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
  );
}

const HistoryWorkoutRow = React.memo(function HistoryWorkoutRow({
  workout,
  isExpanded,
  isMenuOpen,
  rowLabel = "",
  rowLabelClassName = "",
  onRowClick,
  onToggleStarred,
  onToggleWorkoutMenu,
  onOpenEditModal,
  onSeparateWorkout,
  onDeleteWorkout,
}) {
  const workoutName = workout.isMixed ? "Full Workout" : (workout.templateName || workout.exercise);
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
              aria-label={workout.starred ? `Unstar session for ${workoutName}` : `Star session for ${workoutName}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleStarred(workout);
              }}
            >
              <span className="history-star-glyph" aria-hidden="true" />
            </button>
          </span>
          <span
            className={[
              workout.isMixed ? "history-workout-name is-mixed" : "history-workout-name",
              rowLabelClassName,
            ].filter(Boolean).join(" ")}
            style={rowLabel ? undefined : (workout.isMixed ? undefined : { color: getWorkoutColor(workout) })}
          >
            {rowLabel || workoutName}
          </span>
        </td>
        <td className="history-notes-cell">
          <span className={isExpanded ? "history-notes-text is-expanded" : "history-notes-text"}>
            {workout.notes}
          </span>
        </td>
        <td
          className="workout-actions-cell"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="workout-actions-menu">
            <button
              ref={menuTriggerRef}
              type="button"
              className="workout-menu-trigger"
              aria-label={`Manage session for ${workoutName}`}
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
          {workout.isMixed && (
            <button
              type="button"
              className="workout-menu-item"
              onClick={() => onSeparateWorkout(workout)}
            >
              Separate
            </button>
          )}
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
        {workout.isMixed && <th>Exercise</th>}
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
                  {set.templateName || 'Exercise set'}
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

const colorSlotNames = {
  '#ef4444': 'Red',
  '#f97316': 'Orange',
  '#eab308': 'Yellow',
  '#22c55e': 'Green',
  '#3b82f6': 'Blue',
  '#a855f7': 'Violet',
  '#ec4899': 'Pink',
  '#8b5e3c': 'Brown',
  '#94a3b8': 'Gray',
};

function groupWorkoutsByColorGroup(workouts, workoutColorPreferences) {
  const groupMap = new Map();

  workouts.forEach((workout) => {
    const color = getWorkoutColor(workout);
    const slotColor = findWorkoutColorSlot(color, workoutColorPreferences);
    const customLabel = getWorkoutColorPreferenceLabel(slotColor, workoutColorPreferences);
    const fallbackLabel = `${colorSlotNames[slotColor] || 'Unlabeled'} Group`;
    const groupLabel = customLabel || fallbackLabel;
    const groupKey = `${slotColor}:${groupLabel.toLowerCase()}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        key: groupKey,
        label: groupLabel,
        fallbackLabel,
        color,
        slotColor,
        sessionCount: 0,
        workouts: [],
        workoutMap: new Map(),
      });
    }

    const group = groupMap.get(groupKey);
    const workoutName = workout.isMixed ? 'Full Workout' : (workout.templateName || workout.exercise || 'Exercise');
    const workoutKey = workoutName.toLowerCase();

    if (!group.workoutMap.has(workoutKey)) {
      const workoutGroup = {
        key: workoutKey,
        label: workoutName,
        color,
        templateIds: new Set(),
        sessions: [],
      };
      group.workoutMap.set(workoutKey, workoutGroup);
      group.workouts.push(workoutGroup);
    }

    const workoutGroup = group.workoutMap.get(workoutKey);
    if (workout.templateId) {
      workoutGroup.templateIds.add(workout.templateId);
    }
    workoutGroup.sessions.push(workout);
    group.sessionCount += 1;
  });

  return Array.from(groupMap.values())
    .map(({ workoutMap, ...group }) => ({
      ...group,
      workouts: group.workouts
        .map((workoutGroup) => ({
          ...workoutGroup,
          templateIds: Array.from(workoutGroup.templateIds),
          sessions: sortWorkouts(workoutGroup.sessions),
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function flattenHistoryExerciseGroups(groups) {
  return groups.flatMap((group) =>
    group.workouts.map((workoutGroup) => ({
      ...workoutGroup,
      groupKey: group.key,
      selectionKey: `${group.key}:${workoutGroup.key}`,
    }))
  );
}

function selectedExerciseGroupsHaveMatchingFields(groups) {
  if (groups.length < 2) {
    return false;
  }

  const [firstGroup, ...remainingGroups] = groups;
  const firstFields = getComparableExerciseGroupFields(firstGroup);

  return remainingGroups.every((group) =>
    doComparableFieldsMatch(firstFields, getComparableExerciseGroupFields(group))
  );
}

function getComparableExerciseGroupFields(group) {
  const sessions = Array.isArray(group?.sessions) ? group.sessions : [];
  return sessions.reduce((fields, workout) => {
    const workoutFields = hasTrackedWorkoutFields(workout?.fields)
      ? workout.fields
      : inferWorkoutFields(workout?.sets || []);

    return {
      reps: Boolean(fields.reps || workoutFields?.reps),
      weight: Boolean(fields.weight || workoutFields?.weight),
      duration: Boolean(fields.duration || workoutFields?.duration),
      distance: Boolean(fields.distance || workoutFields?.distance),
    };
  }, {
    reps: false,
    weight: false,
    duration: false,
    distance: false,
  });
}

function doComparableFieldsMatch(leftFields, rightFields) {
  return Boolean(leftFields)
    && Boolean(rightFields)
    && leftFields.reps === rightFields.reps
    && leftFields.weight === rightFields.weight
    && leftFields.duration === rightFields.duration
    && leftFields.distance === rightFields.distance;
}

function formatWorkoutDate(dateValue) {
  const date = parseLocalDate(dateValue);
  const weekday = date.toLocaleString('en-US', { weekday: 'long' });
  const day = date.getDate();
  return `${weekday} the ${day}${getOrdinalSuffix(day)}`;
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

function getMixedWorkoutTemplateOptions(workouts, workoutColorPreferences = {}) {
  const templateMap = new Map();

  workouts.forEach((workout) => {
    (workout.sets || []).forEach((set) => {
      if (set.templateId && set.templateName && !templateMap.has(set.templateId)) {
        const color = getWorkoutColor(set);
        const slotColor = findWorkoutColorSlot(color, workoutColorPreferences);
        const badge = getWorkoutColorPreferenceLabel(slotColor, workoutColorPreferences);
        templateMap.set(set.templateId, {
          value: set.templateId,
          label: set.templateName,
          color,
          ...(badge ? { badge, badgeColor: color } : {}),
        });
      }
    });
  });

  return Array.from(templateMap.values()).sort((left, right) => left.label.localeCompare(right.label));
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

function getFieldUnitSuffix(field, measurements) {
  if (field.key === 'weight') {
    return formatMeasurementLabel(measurements?.weight, 'lbs');
  }

  if (field.key === 'distance') {
    return formatMeasurementLabel(measurements?.distance, 'mi');
  }

  return '';
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

function formatImportedTemplateMeta(template) {
  const enabledFields = [
    template.fields?.reps ? 'reps' : null,
    template.fields?.weight ? `weight (${template.measurements?.weight === 'kgs' ? 'kg' : 'lbs'})` : null,
    template.fields?.duration ? 'time' : null,
    template.fields?.distance ? `distance (${formatMeasurementLabel(template.measurements?.distance, 'mi')})` : null,
  ].filter(Boolean);

  return enabledFields.join(' • ');
}

function formatImportedWorkoutDate(dateValue) {
  const date = parseLocalDate(dateValue);
  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatImportedSet(set, index) {
  const parts = [];
  const label = getImportedSetLabel(set, index);

  if (set.reps) {
    parts.push(`${set.reps} reps`);
  }

  if (set.weight) {
    parts.push(`${set.weight} wt`);
  }

  if (set.duration) {
    parts.push(`${set.duration} time`);
  }

  if (set.distance) {
    parts.push(`${set.distance} dist`);
  }

  return `${label}: ${parts.join(' • ')}`;
}

function getImportedSetLabel(set, index) {
  if (set.setType === 'warmup') {
    return 'Warmup';
  }

  if (set.setType === 'max') {
    return 'Max';
  }

  return `Set ${index + 1}`;
}

