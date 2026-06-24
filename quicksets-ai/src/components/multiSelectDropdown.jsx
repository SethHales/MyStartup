import React from "react";
import { DropdownMobileSheet, optionMatchesSearch } from "./dropdown";
import "./multiSelectDropdown.css";
import { getWorkoutColor } from "../utils/workoutColors";
import { useIsMobile } from "../hooks/useIsMobile";

export function MultiSelectDropdown({
  values,
  options,
  onChange,
  placeholder = "Select options",
  disabled = false,
  className = "",
  ariaLabel,
  searchable = false,
  searchPlaceholder = "Search",
}) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const containerRef = React.useRef(null);
  const buttonRef = React.useRef(null);
  const searchResetTimeoutRef = React.useRef(null);
  const usesMobileSheet = searchable && isMobile;

  const filteredOptions = React.useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => optionMatchesSearch(option, normalizedQuery));
  }, [options, searchQuery]);

  React.useEffect(() => {
    const handlePointerDown = (event) => {
      if (event.target?.closest?.('[data-qs-dropdown-layer="true"]')) {
        return;
      }

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
      setSearchQuery("");
      setIsSearchFocused(false);
      return;
    }

    const firstSelectedIndex = filteredOptions.findIndex((option) => values.includes(option.value) && !option.disabled);
    const firstEnabledIndex = filteredOptions.findIndex((option) => !option.disabled);
    setHighlightedIndex(firstSelectedIndex >= 0 ? firstSelectedIndex : firstEnabledIndex);
  }, [filteredOptions, isOpen, values]);

  React.useEffect(() => () => {
    if (searchResetTimeoutRef.current) {
      window.clearTimeout(searchResetTimeoutRef.current);
    }
  }, []);

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
    if (!filteredOptions.length) {
      return;
    }

    let nextIndex = highlightedIndex;

    for (let count = 0; count < filteredOptions.length; count += 1) {
      nextIndex = (nextIndex + direction + filteredOptions.length) % filteredOptions.length;
      if (!filteredOptions[nextIndex]?.disabled) {
        setHighlightedIndex(nextIndex);
        return;
      }
    }
  };

  const queueSearchReset = () => {
    if (searchResetTimeoutRef.current) {
      window.clearTimeout(searchResetTimeoutRef.current);
    }

    searchResetTimeoutRef.current = window.setTimeout(() => {
      setSearchQuery("");
    }, 1800);
  };

  const handleTypeahead = (event) => {
    if (!searchable || isMobile) {
      return false;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
      setSearchQuery((currentQuery) => currentQuery.slice(0, -1));
      queueSearchReset();
      return true;
    }

    if (event.key.length !== 1 || (!searchQuery && event.key === " ")) {
      return false;
    }

    event.preventDefault();
    if (!isOpen) {
      setIsOpen(true);
    }
    setSearchQuery((currentQuery) => `${currentQuery}${event.key}`.slice(-40));
    queueSearchReset();
    return true;
  };

  const handleButtonKeyDown = (event) => {
    if (disabled) {
      return;
    }

    if (handleTypeahead(event)) {
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
    if (handleTypeahead(event)) {
      return;
    }

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
      const highlightedOption = filteredOptions[highlightedIndex];
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
        onClick={() => {
          setIsOpen((current) => !current);
        }}
        onKeyDown={handleButtonKeyDown}
      >
        <span className="qs-dropdown-label">{triggerLabel}</span>
        <span className="qs-dropdown-caret" aria-hidden="true">⌄</span>
      </button>

      {usesMobileSheet && (
        <DropdownMobileSheet
          open={isOpen}
          title={ariaLabel || placeholder}
          searchPlaceholder={searchPlaceholder}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          isSearchFocused={isSearchFocused}
          setIsSearchFocused={setIsSearchFocused}
          options={filteredOptions}
          values={values}
          multiple
          highlightedIndex={highlightedIndex}
          setHighlightedIndex={setHighlightedIndex}
          onSelect={toggleValue}
          onClose={() => {
            setIsOpen(false);
            setSearchQuery("");
            buttonRef.current?.focus();
          }}
        />
      )}

      {isOpen && !usesMobileSheet && (
        <div
          className="qs-dropdown-menu qs-multiselect-menu"
          role="listbox"
          aria-multiselectable="true"
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
        >
          {searchable && isMobile && (
            <div className="qs-dropdown-search-shell">
              <input
                type="search"
                value={searchQuery}
                className={[
                  "qs-dropdown-search-input",
                  isSearchFocused || searchQuery ? "is-active" : "",
                ].filter(Boolean).join(" ")}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                }}
              />
            </div>
          )}
          {searchQuery && searchable && !isMobile && (
            <div className="qs-dropdown-search-status" aria-live="polite">
              Searching for <strong>{searchQuery}</strong>
            </div>
          )}
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => {
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
                  {option.color && (
                    <span
                      className="qs-dropdown-color"
                      style={{ backgroundColor: getWorkoutColor(option) }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="qs-dropdown-option-label">{option.label}</span>
                  {option.badge && (
                    <span
                      className="qs-dropdown-badge"
                      style={option.badgeColor ? { "--qs-badge-color": option.badgeColor } : undefined}
                    >
                      {option.badge}
                    </span>
                  )}
                  <span className="qs-multiselect-check" aria-hidden="true">
                    {isSelected ? "✓" : ""}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="qs-dropdown-empty">No matches found.</div>
          )}
        </div>
      )}
    </div>
  );
}
