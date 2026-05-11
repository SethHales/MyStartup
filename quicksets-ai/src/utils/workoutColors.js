export const workoutColorPalette = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#8b5e3c",
  "#94a3b8",
];
const legacyWorkoutColorMap = {
  "#4da3ff": "#3b82f6",
  "#27d7c3": "#3b82f6",
  "#ffba49": "#eab308",
  "#ff7a67": "#ef4444",
  "#c084fc": "#a855f7",
  "#7dd3fc": "#3b82f6",
  "#a3e635": "#22c55e",
  "#fb7185": "#ec4899",
  "#f59e0b": "#f97316",
  "#22c55e": "#22c55e",
};

export function getWorkoutColor(workoutOrName, explicitColor = "") {
  const color = typeof workoutOrName === "object"
    ? workoutOrName?.color || workoutOrName?.templateColor || explicitColor
    : explicitColor;

  if (isHexColor(color)) {
    return normalizeStoredWorkoutColor(color);
  }

  const name = typeof workoutOrName === "string"
    ? workoutOrName
    : workoutOrName?.templateName || workoutOrName?.exercise || workoutOrName?.name || "QuickSets";

  const hash = Array.from(name).reduce((total, character) => total + character.charCodeAt(0), 0);
  return workoutColorPalette[hash % workoutColorPalette.length];
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function normalizeStoredWorkoutColor(color) {
  const normalizedColor = `${color}`.toLowerCase();
  if (workoutColorPalette.includes(normalizedColor)) {
    return normalizedColor;
  }

  if (legacyWorkoutColorMap[normalizedColor]) {
    return legacyWorkoutColorMap[normalizedColor];
  }

  return findNearestWorkoutPaletteColor(normalizedColor) || workoutColorPalette[0];
}

function findNearestWorkoutPaletteColor(color) {
  const sourceRgb = hexToRgb(color);
  if (!sourceRgb) {
    return "";
  }

  let nearestColor = workoutColorPalette[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  workoutColorPalette.forEach((paletteColor) => {
    const paletteRgb = hexToRgb(paletteColor);
    if (!paletteRgb) {
      return;
    }

    const distance = (
      (sourceRgb.r - paletteRgb.r) ** 2
      + (sourceRgb.g - paletteRgb.g) ** 2
      + (sourceRgb.b - paletteRgb.b) ** 2
    );

    if (distance < nearestDistance) {
      nearestColor = paletteColor;
      nearestDistance = distance;
    }
  });

  return nearestColor;
}

function hexToRgb(color) {
  if (!isHexColor(color)) {
    return null;
  }

  const normalizedColor = `${color}`.toLowerCase();
  return {
    r: parseInt(normalizedColor.slice(1, 3), 16),
    g: parseInt(normalizedColor.slice(3, 5), 16),
    b: parseInt(normalizedColor.slice(5, 7), 16),
  };
}
