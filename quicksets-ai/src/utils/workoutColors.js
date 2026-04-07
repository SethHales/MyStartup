export const workoutColorPalette = [
  "#4da3ff",
  "#27d7c3",
  "#ffba49",
  "#ff7a67",
  "#c084fc",
  "#7dd3fc",
  "#a3e635",
  "#fb7185",
  "#f59e0b",
  "#22c55e",
];

export function getWorkoutColor(workoutOrName, explicitColor = "") {
  const color = typeof workoutOrName === "object"
    ? workoutOrName?.color || workoutOrName?.templateColor || explicitColor
    : explicitColor;

  if (isHexColor(color)) {
    return color;
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
