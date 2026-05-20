import React from "react";
import { WheelPicker } from "./wheelPicker";
import { formatDurationFromParts, formatDurationLabel, parseDurationToParts } from "../utils/studySessions";
import "./studyDurationPicker.css";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: String(hour).padStart(2, "0"),
}));

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, minute) => ({
  value: String(minute),
  label: String(minute).padStart(2, "0"),
}));

export function StudyDurationPicker({
  duration,
  onChange,
  hoursLabel = "Hours",
  minutesLabel = "Minutes",
  summaryLabel = "Study time",
}) {
  const { hours, minutes } = React.useMemo(
    () => parseDurationToParts(duration),
    [duration]
  );

  const handleHoursChange = (nextHours) => {
    onChange(formatDurationFromParts(Number(nextHours) || 0, minutes));
  };

  const handleMinutesChange = (nextMinutes) => {
    onChange(formatDurationFromParts(hours, Number(nextMinutes) || 0));
  };

  return (
    <div className="study-duration-picker">
      <div className="study-duration-wheels">
        <label className="study-duration-wheel">
          <span>{hoursLabel}</span>
          <WheelPicker
            value={String(hours)}
            options={HOUR_OPTIONS}
            onChange={handleHoursChange}
            ariaLabel={hoursLabel}
          />
        </label>

        <label className="study-duration-wheel">
          <span>{minutesLabel}</span>
          <WheelPicker
            value={String(minutes)}
            options={MINUTE_OPTIONS}
            onChange={handleMinutesChange}
            ariaLabel={minutesLabel}
          />
        </label>
      </div>

      <p className="study-duration-summary">
        <strong>{summaryLabel}:</strong> {formatDurationLabel(duration)}
      </p>
    </div>
  );
}
