import React from "react";
import "./datePicker.css";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DatePicker({
  value,
  onChange,
  ariaLabel = "Date",
  className = "",
}) {
  const containerRef = React.useRef(null);
  const buttonRef = React.useRef(null);
  const selectedDate = React.useMemo(() => parseDateString(value), [value]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [visibleMonth, setVisibleMonth] = React.useState(() => getMonthStart(selectedDate || new Date()));

  React.useEffect(() => {
    if (selectedDate) {
      setVisibleMonth(getMonthStart(selectedDate));
    }
  }, [selectedDate]);

  React.useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  const calendarDays = React.useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const todayString = React.useMemo(() => formatDateValue(new Date()), []);

  const handleSelectDate = (nextDate) => {
    onChange(formatDateValue(nextDate));
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={`qs-date-picker ${className} ${isOpen ? "is-open" : ""}`.trim()}
    >
      <button
        ref={buttonRef}
        type="button"
        className="qs-date-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="qs-date-picker-value">
          {selectedDate ? formatDateDisplay(selectedDate) : "Select a date"}
        </span>
        <span className="qs-date-picker-caret" aria-hidden="true">v</span>
      </button>

      {isOpen && (
        <div className="qs-date-picker-popover" role="dialog" aria-label="Calendar">
          <div className="qs-date-picker-header">
            <button
              type="button"
              className="qs-date-nav"
              aria-label="Previous month"
              onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
            >
              &lt;
            </button>
            <div className="qs-date-picker-title">
              {visibleMonth.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </div>
            <button
              type="button"
              className="qs-date-nav"
              aria-label="Next month"
              onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
            >
              &gt;
            </button>
          </div>

          <div className="qs-date-picker-weekdays">
            {weekdayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="qs-date-picker-grid">
            {calendarDays.map((day) => {
              const dayValue = formatDateValue(day.date);
              const isSelected = dayValue === value;
              const isToday = dayValue === todayString;

              return (
                <button
                  key={dayValue}
                  type="button"
                  className={[
                    "qs-date-day",
                    day.isCurrentMonth ? "" : "is-outside-month",
                    isSelected ? "is-selected" : "",
                    isToday ? "is-today" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => handleSelectDate(day.date)}
                >
                  {day.date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="qs-date-picker-footer">
            <button
              type="button"
              className="qs-date-footer-action"
              onClick={() => handleSelectDate(new Date())}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function parseDateString(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(monthStart) {
  const start = new Date(monthStart);
  start.setDate(1 - monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      isCurrentMonth: date.getMonth() === monthStart.getMonth(),
    };
  });
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
