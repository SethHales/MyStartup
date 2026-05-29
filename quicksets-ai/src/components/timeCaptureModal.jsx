import React from "react";
import { WheelPicker } from "./wheelPicker";
import { playMinuteTick, playTimerPing, primeTimerAudio, vibrate } from "../utils/timerFeedback";
import "./timeCaptureModal.css";

export function TimeCaptureModal({
  mode,
  initialSeconds = 0,
  onConfirm,
  onClose,
}) {
  const safeInitialSeconds = Math.max(0, Math.floor(Number(initialSeconds) || 0));
  const isTimer = mode === "timer";
  const minuteOptions = React.useMemo(() => buildIntegerOptions(0, 59), []);
  const secondOptions = React.useMemo(() => buildIntegerOptions(0, 59), []);
  const [timerStartSeconds, setTimerStartSeconds] = React.useState(safeInitialSeconds);
  const [seconds, setSeconds] = React.useState(safeInitialSeconds);
  const [isRunning, setIsRunning] = React.useState(false);
  const [hasStarted, setHasStarted] = React.useState(false);
  const hasVibratedAtZeroRef = React.useRef(false);
  const lastPointerActionRef = React.useRef(null);

  React.useEffect(() => {
    setTimerStartSeconds(safeInitialSeconds);
    setSeconds(safeInitialSeconds);
    setIsRunning(false);
    setHasStarted(false);
    hasVibratedAtZeroRef.current = false;
  }, [isTimer, safeInitialSeconds]);

  React.useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setSeconds((currentSeconds) => {
        if (isTimer) {
          if (currentSeconds <= 1 && !hasVibratedAtZeroRef.current) {
            hasVibratedAtZeroRef.current = true;
            vibrate([180, 90, 180]);
            playTimerPing();
          }

          return currentSeconds - 1;
        }

        const nextSeconds = currentSeconds + 1;
        if (nextSeconds > 0 && nextSeconds % 60 === 0) {
          vibrate(120);
          playMinuteTick();
        }

        return nextSeconds;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning, isTimer]);

  const capturedSeconds = isTimer ? timerStartSeconds - seconds : seconds;
  const timerProgress = isTimer && timerStartSeconds > 0
    ? Math.max(0, Math.min(1, seconds / timerStartSeconds))
    : 0;
  const timerMinutes = Math.floor(timerStartSeconds / 60);
  const timerSeconds = timerStartSeconds % 60;
  const showTimerSetup = isTimer && !hasStarted;

  const updateTimerStart = (minutes, remainingSeconds) => {
    const nextSeconds = minutes * 60 + remainingSeconds;
    setTimerStartSeconds(nextSeconds);
    setSeconds(nextSeconds);
    hasVibratedAtZeroRef.current = false;
  };

  const handleStartPause = () => {
    setHasStarted(true);
    primeTimerAudio();
    if (isTimer && !isRunning && seconds <= 0 && !hasVibratedAtZeroRef.current) {
      hasVibratedAtZeroRef.current = true;
      vibrate([180, 90, 180]);
      playTimerPing();
    }
    setIsRunning((current) => !current);
  };

  const handleReset = () => {
    setIsRunning(false);
    setHasStarted(false);
    setSeconds(isTimer ? timerStartSeconds : 0);
    hasVibratedAtZeroRef.current = false;
  };

  const runActionOnPointerUp = (event, actionKey, action) => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const blockGhostClick = (clickEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      document.removeEventListener("click", blockGhostClick, true);
    };

    document.addEventListener("click", blockGhostClick, true);
    window.setTimeout(() => {
      document.removeEventListener("click", blockGhostClick, true);
    }, 400);

    lastPointerActionRef.current = actionKey;
    action();
  };

  const runActionOnClick = (actionKey, action) => {
    if (lastPointerActionRef.current === actionKey) {
      lastPointerActionRef.current = null;
      return;
    }

    action();
  };

  return (
    <div className="time-capture-backdrop" role="presentation">
      <div
        className={`time-capture-modal ${isTimer ? "is-timer" : "is-stopwatch"} ${isRunning ? "is-running" : ""}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="time-capture-title"
      >
        <button type="button" className="time-capture-close" onClick={onClose} aria-label="Close">
          x
        </button>

        <p className="time-capture-kicker">{isTimer ? "Timer" : "Stopwatch"}</p>
        <h2 id="time-capture-title">{isTimer ? "Countdown" : "Capture Time"}</h2>

        {isTimer && (
          <TimerDonut progress={timerProgress} />
        )}

        {showTimerSetup && (
          <div className="time-capture-picker" aria-label="Timer length">
            <div className="time-capture-wheel-field">
              <WheelPicker
                value={timerMinutes}
                options={minuteOptions}
                onChange={(nextMinutes) => updateTimerStart(nextMinutes, timerSeconds)}
                ariaLabel="Timer minutes"
              />
              <span>min</span>
            </div>
            <div className="time-capture-wheel-field">
              <WheelPicker
                value={timerSeconds}
                options={secondOptions}
                onChange={(nextSeconds) => updateTimerStart(timerMinutes, nextSeconds)}
                ariaLabel="Timer seconds"
              />
              <span>sec</span>
            </div>
          </div>
        )}

        <FallingTime value={formatSignedDuration(seconds)} />

        {isTimer && (
          <p className="time-capture-subcopy">
            Captured: {formatSignedDuration(capturedSeconds)}
          </p>
        )}

        <div className="time-capture-actions">
          <button
            type="button"
            onPointerUpCapture={(event) => runActionOnPointerUp(event, "start", handleStartPause)}
            onClick={() => runActionOnClick("start", handleStartPause)}
          >
            {isRunning ? "Pause" : "Start"}
          </button>
          <button
            type="button"
            onPointerUpCapture={(event) => runActionOnPointerUp(event, "reset", handleReset)}
            onClick={() => runActionOnClick("reset", handleReset)}
          >
            Reset
          </button>
          <button
            type="button"
            className="time-capture-confirm"
            onPointerUpCapture={(event) => runActionOnPointerUp(event, "confirm", () => onConfirm(Math.max(0, capturedSeconds)))}
            onClick={() => runActionOnClick("confirm", () => onConfirm(Math.max(0, capturedSeconds)))}
            aria-label="Use this time"
          >
            ✓
          </button>
        </div>
      </div>
    </div>
  );
}

function TimerDonut({ progress }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <svg className="time-capture-donut" viewBox="0 0 132 132" aria-hidden="true">
      <circle className="time-capture-donut-track" cx="66" cy="66" r={radius} />
      <circle
        className="time-capture-donut-fill"
        cx="66"
        cy="66"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
      />
    </svg>
  );
}

function FallingTime({ value }) {
  const previousValueRef = React.useRef(value);
  const previousValue = previousValueRef.current;

  React.useEffect(() => {
    previousValueRef.current = value;
  }, [value]);

  return (
    <div className="falling-time" aria-live="polite">
      {value.split("").map((character, index) => {
        const isSymbol = character === ":" || character === "-";
        const isChanging = previousValue[index] !== character || previousValue.length !== value.length;
        const classes = [
          isSymbol ? "is-symbol" : "",
          isChanging ? "is-changing" : "",
        ].filter(Boolean).join(" ");

        return (
          <span key={`${index}-${isSymbol ? "symbol" : character}`} className={classes}>
            {character}
          </span>
        );
      })}
    </div>
  );
}

function buildIntegerOptions(min, max) {
  return Array.from({ length: max - min + 1 }, (_, index) => {
    const value = min + index;
    return {
      value,
      label: String(value).padStart(2, "0"),
    };
  });
}

function formatSignedDuration(totalSeconds) {
  const prefix = totalSeconds < 0 ? "-" : "";
  const absoluteSeconds = Math.abs(Math.floor(totalSeconds));
  const minutes = Math.floor(absoluteSeconds / 60);
  const seconds = absoluteSeconds % 60;
  return `${prefix}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
