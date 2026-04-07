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
  const pointerStartYRef = React.useRef(0);
  const startIndexRef = React.useRef(0);
  const lastMoveRef = React.useRef({ y: 0, time: 0, velocity: 0 });
  const settleFrameRef = React.useRef(null);
  const interruptedSettleRef = React.useRef(false);

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

  React.useEffect(() => {
    if (!isDragging && !isSettling) {
      setCurrentIndex(selectedIndex);
      setDragOffset(0);
    }
  }, [isDragging, isSettling, selectedIndex]);

  React.useEffect(() => () => {
    if (settleFrameRef.current) {
      window.cancelAnimationFrame(settleFrameRef.current);
    }
  }, []);

  const animateSettle = React.useCallback((fromOffset, toOffset, finalIndex, finalValue, settleDuration) => {
    if (settleFrameRef.current) {
      window.cancelAnimationFrame(settleFrameRef.current);
    }

    setIsSettling(true);
    const startTime = performance.now();

    const step = (now) => {
      const progress = Math.min((now - startTime) / settleDuration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextOffset = fromOffset + (toOffset - fromOffset) * eased;

      setDragOffset(nextOffset);

      if (progress < 1) {
        settleFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      setCurrentIndex(finalIndex);
      setDragOffset(0);
      setIsSettling(false);
      if (finalValue !== value) {
        onChange(finalValue);
      }
    };

    settleFrameRef.current = window.requestAnimationFrame(step);
  }, [onChange, value]);

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
      onChange(nextValue);
    }

    return visibleCenterIndex;
  }, [currentIndex, dragOffset, isSettling, normalizeIndex, onChange, options, value]);

  const handlePointerDown = React.useCallback((event) => {
    if (!options.length) {
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
  }, [currentIndex, isSettling, options.length, stopSettleAtCurrentPosition]);

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

    setDragOffset(nextOffset);
  }, [isDragging]);

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
    const finalValue = options[finalIndex]?.value ?? value;
    const settleDuration = Math.min(1100, 180 + Math.abs(totalShift) * 38);

    setIsDragging(false);
    animateSettle(totalMovement, targetOffset, finalIndex, finalValue, settleDuration);
  }, [animateSettle, dragOffset, isDragging, normalizeIndex, options, value]);

  const handleKeyDown = React.useCallback((event) => {
    if (!options.length || isDragging) {
      return;
    }

    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    event.preventDefault();
    const delta = event.key === "ArrowUp" ? -1 : 1;
    const nextIndex = normalizeIndex(currentIndex + delta);
    const nextValue = options[nextIndex]?.value ?? value;

    animateSettle(delta * ITEM_HEIGHT * -0.35, delta * ITEM_HEIGHT, nextIndex, nextValue, 190);
  }, [animateSettle, currentIndex, isDragging, normalizeIndex, options, value]);

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
      className={isDragging ? "wheel-picker is-dragging" : "wheel-picker"}
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <div className="wheel-picker-highlight" aria-hidden="true" />
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
    </div>
  );
}
