import React from "react";
import "./wheelPicker.css";

const ITEM_HEIGHT = 44;

export function WheelPicker({ value, options, onChange, ariaLabel }) {
  const scrollRef = React.useRef(null);
  const scrollTimeoutRef = React.useRef(null);
  const isAdjustingScrollRef = React.useRef(false);

  const selectedIndex = React.useMemo(() => {
    const foundIndex = options.findIndex((option) => option.value === value);
    return foundIndex >= 0 ? foundIndex : 0;
  }, [options, value]);

  const repeatedOptions = React.useMemo(() => {
    if (!options.length) {
      return [];
    }

    return [...options, ...options, ...options];
  }, [options]);

  const normalizeIndex = React.useCallback((index) => {
    if (!options.length) {
      return 0;
    }

    return ((index % options.length) + options.length) % options.length;
  }, [options]);

  const getCenteredScrollTop = React.useCallback((index) => {
    return (options.length + index) * ITEM_HEIGHT;
  }, [options.length]);

  React.useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || !options.length) {
      return;
    }

    isAdjustingScrollRef.current = true;
    scrollElement.scrollTo({
      top: getCenteredScrollTop(selectedIndex),
      behavior: "auto",
    });
    isAdjustingScrollRef.current = false;
  }, [getCenteredScrollTop, options.length, selectedIndex]);

  React.useEffect(() => () => {
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }
  }, []);

  const snapToIndex = React.useCallback((index) => {
    const nextIndex = normalizeIndex(index);
    const nextOption = options[nextIndex];
    if (!nextOption) {
      return;
    }

    if (nextOption.value !== value) {
      onChange(nextOption.value);
    }

    isAdjustingScrollRef.current = true;
    scrollRef.current?.scrollTo({
      top: getCenteredScrollTop(nextIndex),
      behavior: "smooth",
    });
    window.setTimeout(() => {
      isAdjustingScrollRef.current = false;
    }, 120);
  }, [getCenteredScrollTop, normalizeIndex, onChange, options, value]);

  const handleScroll = React.useCallback(() => {
    if (!scrollRef.current || !options.length || isAdjustingScrollRef.current) {
      return;
    }

    const scrollElement = scrollRef.current;
    const rawIndex = Math.round(scrollElement.scrollTop / ITEM_HEIGHT);
    const normalizedIndex = normalizeIndex(rawIndex);

    if (rawIndex < options.length || rawIndex >= options.length * 2) {
      isAdjustingScrollRef.current = true;
      scrollElement.scrollTo({
        top: getCenteredScrollTop(normalizedIndex),
        behavior: "auto",
      });
      isAdjustingScrollRef.current = false;
    }

    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = window.setTimeout(() => {
      snapToIndex(normalizedIndex);
    }, 80);
  }, [getCenteredScrollTop, normalizeIndex, options.length, snapToIndex]);

  return (
    <div className="wheel-picker" aria-label={ariaLabel}>
      <div className="wheel-picker-highlight" aria-hidden="true" />
      <div
        ref={scrollRef}
        className="wheel-picker-scroll"
        onScroll={handleScroll}
      >
        <div className="wheel-picker-spacer" aria-hidden="true" />
        {repeatedOptions.map((option, index) => (
          <div
            key={`${option.value}-${index}`}
            className={option.value === value ? "wheel-picker-option is-selected" : "wheel-picker-option"}
          >
            {option.label}
          </div>
        ))}
        <div className="wheel-picker-spacer" aria-hidden="true" />
      </div>
    </div>
  );
}
