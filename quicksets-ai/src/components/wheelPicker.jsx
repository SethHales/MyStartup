import React from "react";
import "./wheelPicker.css";

const ITEM_HEIGHT = 44;
const VISIBLE_RADIUS = 3;
const DRAG_THRESHOLD_PX = 14;
const FLICK_VELOCITY_THRESHOLD = 0.22;
const MAX_MOMENTUM_STEPS = 16;

export function WheelPicker({ value, options, onChange, ariaLabel }) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [dragOffset, setDragOffset] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isSettling, setIsSettling] = React.useState(false);
  const [isTyping, setIsTyping] = React.useState(false);
  const [typedValue, setTypedValue] = React.useState("");
  const pointerStartYRef = React.useRef(0);
  const startIndexRef = React.useRef(0);
  const lastMoveRef = React.useRef({ y: 0, time: 0, velocity: 0 });
  const settleFrameRef = React.useRef(null);
  const interruptedSettleRef = React.useRef(false);
  const typeInputRef = React.useRef(null);
  const lastEmittedValueRef = React.useRef(value);

  React.useEffect(() => {
    lastEmittedValueRef.current = value;
  }, [value]);

  const selectedIndex = React.useMemo(() => {
    const foundIndex = options.findIndex((option) => option.value === value);
    return foundIndex >= 0 ? foundIndex : 0;
  }, [options, value]);

  const normalizeIndex = React.useCallback((index) => {
    if (!options.length) {
      return 0;
    }

    return ((index % options.length) + options.length) % options.length;
  }, [options.length]);

  const emitValueIfChanged = React.useCallback((nextValue) => {
    if (nextValue === undefined || nextValue === lastEmittedValueRef.current) {
      return;
    }

    lastEmittedValueRef.current = nextValue;
    onChange(nextValue);
  }, [onChange]);

  React.useEffect(() => {
    if (!isDragging && !isSettling) {
      setCurrentIndex(selectedIndex);
      setDragOffset(0);
    }
  }, [isDragging, isSettling, selectedIndex]);

  React.useEffect(() => {
    if (!isTyping) {
      setTypedValue(`${value ?? ""}`);
    }
  }, [isTyping, value]);

  React.useEffect(() => {
    if (!isTyping) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      typeInputRef.current?.focus();
      typeInputRef.current?.select?.();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isTyping]);

  React.useEffect(() => () => {
    if (settleFrameRef.current) {
      window.cancelAnimationFrame(settleFrameRef.current);
    }
  }, []);

  const animateSettle = React.useCallback((fromOffset, toOffset, finalIndex, settleDuration) => {
    if (settleFrameRef.current) {
      window.cancelAnimationFrame(settleFrameRef.current);
    }

    setIsSettling(true);
    const startTime = performance.now();

    const step = (now) => {
      const progress = Math.min((now - startTime) / settleDuration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextOffset = fromOffset + (toOffset - fromOffset) * eased;
      const previewStepShift = Math.round(nextOffset / ITEM_HEIGHT);
      const visibleCenterIndex = normalizeIndex(currentIndex - previewStepShift);
      const visibleValue = options[visibleCenterIndex]?.value;

      emitValueIfChanged(visibleValue);
      setDragOffset(nextOffset);

      if (progress < 1) {
        settleFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      setCurrentIndex(finalIndex);
      setDragOffset(0);
      setIsSettling(false);
    };

    settleFrameRef.current = window.requestAnimationFrame(step);
  }, [currentIndex, emitValueIfChanged, normalizeIndex, options]);

  const stopSettleAtCurrentPosition = React.useCallback(() => {
    if (!isSettling || !options.length) {
      return currentIndex;
    }

    if (settleFrameRef.current) {
      window.cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }

    const previewStepShift = Math.round(dragOffset / ITEM_HEIGHT);
    const visibleCenterIndex = normalizeIndex(currentIndex - previewStepShift);
    const nextValue = options[visibleCenterIndex]?.value ?? value;

    setCurrentIndex(visibleCenterIndex);
    setDragOffset(0);
    setIsSettling(false);
    interruptedSettleRef.current = true;

    if (nextValue !== value) {
      emitValueIfChanged(nextValue);
    }

    return visibleCenterIndex;
  }, [currentIndex, dragOffset, emitValueIfChanged, isSettling, normalizeIndex, options, value]);

  const handlePointerDown = React.useCallback((event) => {
    if (!options.length || isTyping) {
      return;
    }

    if (interruptedSettleRef.current) {
      interruptedSettleRef.current = false;
    }

    let startingIndex = currentIndex;

    if (isSettling) {
      event.preventDefault();
      startingIndex = stopSettleAtCurrentPosition();
      interruptedSettleRef.current = false;
    }

    if (settleFrameRef.current) {
      window.cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerStartYRef.current = event.clientY;
    startIndexRef.current = startingIndex;
    lastMoveRef.current = {
      y: event.clientY,
      time: performance.now(),
      velocity: 0,
    };
    setIsDragging(true);
    setIsSettling(false);
    setDragOffset(0);
  }, [currentIndex, isSettling, isTyping, options.length, stopSettleAtCurrentPosition]);

  const handlePointerMove = React.useCallback((event) => {
    if (!isDragging) {
      return;
    }

    const nextOffset = event.clientY - pointerStartYRef.current;
    const now = performance.now();
    const deltaY = event.clientY - lastMoveRef.current.y;
    const deltaTime = Math.max(now - lastMoveRef.current.time, 1);

    lastMoveRef.current = {
      y: event.clientY,
      time: now,
      velocity: deltaY / deltaTime,
    };

    const previewStepShift = Math.round(nextOffset / ITEM_HEIGHT);
    const visibleCenterIndex = normalizeIndex(startIndexRef.current - previewStepShift);
    emitValueIfChanged(options[visibleCenterIndex]?.value);
    setDragOffset(nextOffset);
  }, [emitValueIfChanged, isDragging, normalizeIndex, options]);

  const finishDrag = React.useCallback((event) => {
    if (interruptedSettleRef.current) {
      interruptedSettleRef.current = false;
      return;
    }

    if (!isDragging || !options.length) {
      return;
    }

    event?.currentTarget?.releasePointerCapture?.(event.pointerId);

    const totalMovement = dragOffset;
    const baseShift = Math.abs(totalMovement) < DRAG_THRESHOLD_PX
      ? 0
      : Math.round(totalMovement / ITEM_HEIGHT);
    const flickVelocity = lastMoveRef.current.velocity;
    const momentumSteps = Math.abs(flickVelocity) >= FLICK_VELOCITY_THRESHOLD
      ? Math.sign(flickVelocity) * Math.min(
        MAX_MOMENTUM_STEPS,
        Math.max(1, Math.round(Math.abs(flickVelocity) * 12))
      )
      : 0;
    const totalShift = baseShift + momentumSteps;
    const targetOffset = totalShift * ITEM_HEIGHT;
    const finalIndex = normalizeIndex(startIndexRef.current - totalShift);
    const settleDuration = Math.min(1100, 180 + Math.abs(totalShift) * 38);

    setIsDragging(false);
    animateSettle(totalMovement, targetOffset, finalIndex, settleDuration);
  }, [animateSettle, dragOffset, isDragging, normalizeIndex, options]);

  const handleKeyDown = React.useCallback((event) => {
    if (!options.length || isDragging || isTyping) {
      return;
    }

    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    event.preventDefault();
    const delta = event.key === "ArrowUp" ? -1 : 1;
    const nextIndex = normalizeIndex(currentIndex + delta);
    const nextValue = options[nextIndex]?.value ?? value;

    emitValueIfChanged(nextValue);
    animateSettle(delta * ITEM_HEIGHT * -0.35, delta * ITEM_HEIGHT, nextIndex, 190);
  }, [animateSettle, currentIndex, emitValueIfChanged, isDragging, isTyping, normalizeIndex, options, value]);

  const commitTypedValue = React.useCallback(() => {
    const trimmedValue = `${typedValue ?? ""}`.trim();
    if (!trimmedValue) {
      setTypedValue(`${value ?? ""}`);
      return;
    }

    const normalizedNumber = Number(trimmedValue);
    if (!Number.isFinite(normalizedNumber)) {
      setTypedValue(`${value ?? ""}`);
      return;
    }

    if (trimmedValue !== `${value ?? ""}`) {
      emitValueIfChanged(trimmedValue);
    }
  }, [emitValueIfChanged, typedValue, value]);

  const supportsDecimalInput = React.useMemo(
    () => options.some((option) => `${option.value}`.includes(".")) || `${value ?? ""}`.includes("."),
    [options, value]
  );

  const toggleTypingMode = React.useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsTyping((current) => {
      const nextIsTyping = !current;

      if (nextIsTyping) {
        setTypedValue(`${value ?? ""}`);
        return true;
      }

      commitTypedValue();

      const currentValue = `${typedValue ?? ""}`.trim() || `${value ?? ""}`;
      const exactMatchIndex = options.findIndex((option) => `${option.value}` === currentValue);

      if (exactMatchIndex >= 0) {
        setCurrentIndex(exactMatchIndex);
        setDragOffset(0);
        return false;
      }

      const parsedTypedValue = Number(currentValue);
      if (!Number.isFinite(parsedTypedValue) || !options.length) {
        setCurrentIndex(selectedIndex);
        setDragOffset(0);
        return false;
      }

      let closestIndex = selectedIndex;
      let smallestDistance = Number.POSITIVE_INFINITY;

      options.forEach((option, optionIndex) => {
        const parsedOptionValue = Number(option.value);
        if (!Number.isFinite(parsedOptionValue)) {
          return;
        }

        const distance = Math.abs(parsedOptionValue - parsedTypedValue);
        if (distance < smallestDistance) {
          smallestDistance = distance;
          closestIndex = optionIndex;
        }
      });

      const closestOptionValue = options[closestIndex]?.value;
      if (closestOptionValue !== undefined && `${closestOptionValue}` !== currentValue && closestOptionValue !== value) {
        emitValueIfChanged(closestOptionValue);
      }

      setCurrentIndex(closestIndex);
      setDragOffset(0);
      return false;
    });
  }, [commitTypedValue, emitValueIfChanged, options, selectedIndex, typedValue, value]);

  const visibleOptions = React.useMemo(() => {
    if (!options.length) {
      return [];
    }

    const previewStepShift = Math.round(dragOffset / ITEM_HEIGHT);
    const visibleCenterIndex = normalizeIndex(currentIndex - previewStepShift);
    const visualOffset = dragOffset - previewStepShift * ITEM_HEIGHT;

    return Array.from({ length: VISIBLE_RADIUS * 2 + 1 }, (_, offsetIndex) => {
      const relativeIndex = offsetIndex - VISIBLE_RADIUS;
      const optionIndex = normalizeIndex(visibleCenterIndex + relativeIndex);
      return {
        key: `${options[optionIndex].value}-${relativeIndex}`,
        option: options[optionIndex],
        relativeIndex,
        visualOffset,
      };
    });
  }, [currentIndex, dragOffset, normalizeIndex, options]);

  return (
    <div
      className={[
        "wheel-picker",
        isDragging ? "is-dragging" : "",
        isTyping ? "is-typing" : "",
      ].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      tabIndex={isTyping ? -1 : 0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <div
        role="button"
        tabIndex={0}
        className="wheel-picker-type-toggle"
        aria-label={isTyping ? "Switch to wheel picker" : "Switch to typed input"}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={toggleTypingMode}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            toggleTypingMode(event);
          }
        }}
      >
        {isTyping ? "◴" : "123"}
      </div>
      <div className="wheel-picker-highlight" aria-hidden="true" />
      {isTyping ? (
        <div className="wheel-picker-type-shell">
          <input
            ref={typeInputRef}
            type="number"
            inputMode={supportsDecimalInput ? "decimal" : "numeric"}
            step="any"
            className="wheel-picker-type-input"
            aria-label={`${ariaLabel} typed input`}
            value={typedValue}
            onChange={(event) => setTypedValue(event.target.value)}
            onBlur={commitTypedValue}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                commitTypedValue();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setTypedValue(`${value ?? ""}`);
              }
            }}
          />
        </div>
      ) : (
        <div className="wheel-picker-viewport" aria-hidden="true">
          {visibleOptions.map(({ key, option, relativeIndex, visualOffset }) => {
            const offsetFromCenter = relativeIndex * ITEM_HEIGHT + visualOffset;
            const distance = Math.abs(offsetFromCenter) / ITEM_HEIGHT;
            const isCentered = Math.abs(offsetFromCenter) < ITEM_HEIGHT / 2;

            return (
              <div
                key={key}
                className={isCentered ? "wheel-picker-option is-selected" : "wheel-picker-option"}
                style={{
                  top: `calc(50% - ${ITEM_HEIGHT / 2}px + ${offsetFromCenter}px)`,
                  opacity: Math.max(0.2, 1 - distance * 0.28),
                  transform: `scale(${Math.max(0.92, 1 - distance * 0.05)})`,
                  transition: isDragging ? "none" : "color 120ms ease",
                }}
              >
                {option.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
