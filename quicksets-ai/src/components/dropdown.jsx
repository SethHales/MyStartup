import React from "react";
import "./dropdown.css";

export function Dropdown({
  value,
  options,
  onChange,
  placeholder = "Select an option",
  disabled = false,
  className = "",
  ariaLabel,
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const containerRef = React.useRef(null);
  const buttonRef = React.useRef(null);

  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

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

    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    const firstEnabledIndex = options.findIndex((option) => !option.disabled);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
  }, [isOpen, options, value]);

  const openMenu = () => {
    if (!disabled) {
      setIsOpen(true);
    }
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  const commitSelection = (nextValue) => {
    onChange(nextValue);
    closeMenu();
    buttonRef.current?.focus();
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
        openMenu();
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
      closeMenu();
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
        commitSelection(highlightedOption.value);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      buttonRef.current?.focus();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`qs-dropdown ${className} ${isOpen ? "is-open" : ""}`.trim()}
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
        <span className="qs-dropdown-label">
          {selectedOption?.label || placeholder}
        </span>
        <span className="qs-dropdown-caret" aria-hidden="true">⌄</span>
      </button>

      {isOpen && (
        <div
          className="qs-dropdown-menu"
          role="listbox"
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
        >
          {options.map((option, index) => (
            <button
              key={`${option.value}-${index}`}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={[
                "qs-dropdown-option",
                option.value === value ? "is-selected" : "",
                index === highlightedIndex ? "is-highlighted" : "",
                option.disabled ? "is-disabled" : "",
                option.variant ? `is-${option.variant}` : "",
              ].filter(Boolean).join(" ")}
              disabled={option.disabled}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => commitSelection(option.value)}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
