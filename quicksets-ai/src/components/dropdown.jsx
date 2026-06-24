import React from "react";
import { createPortal } from "react-dom";
import "./dropdown.css";
import { getWorkoutColor } from "../utils/workoutColors";
import { useIsMobile } from "../hooks/useIsMobile";

export function optionMatchesSearch(option, normalizedQuery) {
  return [
    option.label,
    option.badge,
    option.groupName,
    option.searchText,
  ].some((value) => `${value || ""}`.toLowerCase().includes(normalizedQuery));
}

export function DropdownMobileSheet({
  open,
  title,
  searchPlaceholder,
  searchQuery,
  setSearchQuery,
  isSearchFocused,
  setIsSearchFocused,
  options,
  value,
  values = [],
  multiple = false,
  highlightedIndex,
  setHighlightedIndex,
  onSelect,
  onClose,
}) {
  const searchInputRef = React.useRef(null);

  const moveHighlight = React.useCallback((direction) => {
    if (!options.length) {
      return;
    }

    setHighlightedIndex((currentIndex) => {
      let nextIndex = currentIndex;

      for (let count = 0; count < options.length; count += 1) {
        nextIndex = (nextIndex + direction + options.length) % options.length;
        if (!options[nextIndex]?.disabled) {
          return nextIndex;
        }
      }

      return currentIndex;
    });
  }, [options, setHighlightedIndex]);

  React.useEffect(() => {
    if (!open || typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const focusTimeout = window.setTimeout(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    }, 120);

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimeout);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const handleSearchKeyDown = (event) => {
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

    if (event.key === "Enter") {
      event.preventDefault();
      const highlightedOption = options[highlightedIndex];
      if (highlightedOption && !highlightedOption.disabled) {
        onSelect(highlightedOption.value);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div
      className="qs-mobile-dropdown-backdrop"
      data-qs-dropdown-layer="true"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onTouchStart={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="qs-mobile-dropdown-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="qs-mobile-dropdown-header">
          <div>
            <p className="qs-mobile-dropdown-eyebrow">Search</p>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="qs-mobile-dropdown-close"
            onClick={onClose}
          >
            {multiple ? "Done" : "X"}
          </button>
        </div>

        <div className="qs-mobile-dropdown-search-shell">
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            className={[
              "qs-dropdown-search-input",
              "qs-mobile-dropdown-search-input",
              isSearchFocused || searchQuery ? "is-active" : "",
            ].filter(Boolean).join(" ")}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </div>

        <div
          className="qs-mobile-dropdown-options"
          role="listbox"
          aria-multiselectable={multiple ? "true" : undefined}
        >
          {options.length > 0 ? (
            options.map((option, index) => {
              const isSelected = multiple
                ? values.includes(option.value)
                : option.value === value;

              return (
                <button
                  key={`${option.value}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={[
                    "qs-dropdown-option",
                    multiple ? "qs-multiselect-option" : "",
                    isSelected ? "is-selected" : "",
                    index === highlightedIndex ? "is-highlighted" : "",
                    option.disabled ? "is-disabled" : "",
                    option.variant ? `is-${option.variant}` : "",
                  ].filter(Boolean).join(" ")}
                  disabled={option.disabled}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onFocus={() => setHighlightedIndex(index)}
                  onClick={() => onSelect(option.value)}
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
                  {multiple && (
                    <span className="qs-multiselect-check" aria-hidden="true">
                      {isSelected ? "\u2713" : ""}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="qs-dropdown-empty">No matches found.</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function Dropdown({
  value,
  options,
  onChange,
  placeholder = "Select an option",
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

  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  const filteredOptions = React.useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return options;
    }

    const persistentOptions = options.filter((option) => option.variant === "create");
    const matchingOptions = options.filter((option) => {
      if (option.variant === "create") {
        return false;
      }

      return optionMatchesSearch(option, normalizedQuery);
    });

    return [...persistentOptions, ...matchingOptions];
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

    const selectedIndex = filteredOptions.findIndex((option) => option.value === value && !option.disabled);
    const firstEnabledIndex = filteredOptions.findIndex((option) => !option.disabled);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
  }, [filteredOptions, isOpen, value]);

  React.useEffect(() => () => {
    if (searchResetTimeoutRef.current) {
      window.clearTimeout(searchResetTimeoutRef.current);
    }
  }, []);

  const openMenu = () => {
    if (!disabled) {
      setIsOpen(true);
    }
  };

  const closeMenu = () => {
    setIsOpen(false);
    setSearchQuery("");
  };

  const commitSelection = (nextValue) => {
    onChange(nextValue);
    closeMenu();
    buttonRef.current?.focus();
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
        openMenu();
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
      openMenu();
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
        onClick={() => {
          if (isOpen) {
            closeMenu();
          } else {
            openMenu();
          }
        }}
        onKeyDown={handleButtonKeyDown}
      >
        {selectedOption?.color && (
          <span
            className="qs-dropdown-color"
            style={{ backgroundColor: getWorkoutColor(selectedOption) }}
            aria-hidden="true"
          />
        )}
        <span className="qs-dropdown-label">
          {selectedOption?.label || placeholder}
        </span>
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
          value={value}
          highlightedIndex={highlightedIndex}
          setHighlightedIndex={setHighlightedIndex}
          onSelect={commitSelection}
          onClose={() => {
            closeMenu();
            buttonRef.current?.focus();
          }}
        />
      )}

      {isOpen && !usesMobileSheet && (
        <div
          className="qs-dropdown-menu"
          role="listbox"
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
            filteredOptions.map((option, index) => (
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
              </button>
            ))
          ) : (
            <div className="qs-dropdown-empty">No matches found.</div>
          )}
        </div>
      )}
    </div>
  );
}
