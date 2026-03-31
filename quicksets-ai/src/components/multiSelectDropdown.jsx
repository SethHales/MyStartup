import React from "react";
import "./dropdown.css";
import "./multiSelectDropdown.css";

export function MultiSelectDropdown({
  values,
  options,
  onChange,
  placeholder = "Select options",
  disabled = false,
  className = "",
  ariaLabel,
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const containerRef = React.useRef(null);
  const buttonRef = React.useRef(null);

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

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const firstSelectedIndex = options.findIndex((option) => values.includes(option.value) && !option.disabled);
    const firstEnabledIndex = options.findIndex((option) => !option.disabled);
    setHighlightedIndex(firstSelectedIndex >= 0 ? firstSelectedIndex : firstEnabledIndex);
  }, [isOpen, options, values]);

  const selectedOptions = React.useMemo(
    () => options.filter((option) => values.includes(option.value)),
    [options, values]
  );

  const triggerLabel = React.useMemo(() => {
    if (selectedOptions.length === 0) {
      return placeholder;
    }

    if (selectedOptions.length <= 2) {
      return selectedOptions.map((option) => option.label).join(", ");
    }

    return `${selectedOptions.length} selected`;
  }, [placeholder, selectedOptions]);

  const toggleValue = (nextValue) => {
    onChange(
      values.includes(nextValue)
        ? values.filter((value) => value !== nextValue)
        : [...values, nextValue]
    );
  };

  const moveHighlight = (direction) => {
    if (!options.length) {
      return;
    }

    let nextIndex = highlightedIndex;

    for (let count = 0; count < options.length; count += 1) {
      nextIndex = (nextIndex + direction + options.length) % options.length;
      if (!options[nextIndex]?.disabled) {
        setHighlightedIndex(nextIndex);
        return;
      }
    }
  };

  const handleButtonKeyDown = (event) => {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        moveHighlight(event.key === "ArrowDown" ? 1 : -1);
      }
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsOpen((current) => !current);
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleMenuKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const highlightedOption = options[highlightedIndex];
      if (highlightedOption && !highlightedOption.disabled) {
        toggleValue(highlightedOption.value);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`qs-dropdown qs-multiselect ${className} ${isOpen ? "is-open" : ""}`.trim()}
    >
      <button
        ref={buttonRef}
        type="button"
        className="qs-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleButtonKeyDown}
      >
        <span className="qs-dropdown-label">{triggerLabel}</span>
        <span className="qs-dropdown-caret" aria-hidden="true">⌄</span>
      </button>

      {isOpen && (
        <div
          className="qs-dropdown-menu qs-multiselect-menu"
          role="listbox"
          aria-multiselectable="true"
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = values.includes(option.value);

            return (
              <button
                key={`${option.value}-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={[
                  "qs-dropdown-option",
                  "qs-multiselect-option",
                  isSelected ? "is-selected" : "",
                  index === highlightedIndex ? "is-highlighted" : "",
                  option.disabled ? "is-disabled" : "",
                ].filter(Boolean).join(" ")}
                disabled={option.disabled}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => toggleValue(option.value)}
              >
                <span>{option.label}</span>
                <span className="qs-multiselect-check" aria-hidden="true">
                  {isSelected ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
