import React from "react";

export function ExplorerPreferenceCard({
  label,
  active,
  onClick,
  children,
  cardRef = undefined,
  onHandlePointerDown = undefined,
  isDragging = false,
  isDropTarget = false,
  isGhost = false,
}) {
  return (
    <div
      ref={cardRef}
      className={[
        active ? "explorer-toggle-chip is-active" : "explorer-toggle-chip",
        isDragging ? "is-dragging" : "",
        isDropTarget ? "is-drop-target" : "",
        isGhost ? "is-ghost" : "",
      ].filter(Boolean).join(" ")}
    >
      <div className="explorer-toggle-shell">
        <div
          className="explorer-toggle-main"
          role={isGhost ? undefined : "button"}
          tabIndex={isGhost ? undefined : 0}
          onClick={onClick}
          onKeyDown={(event) => {
            if (!onClick || event.defaultPrevented) {
              return;
            }

            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onClick(event);
            }
          }}
        >
          <div className="explorer-toggle-header">
            <span>{label}</span>
            <button
              type="button"
              className={onHandlePointerDown ? "explorer-toggle-drag-handle is-draggable" : "explorer-toggle-drag-handle"}
              onPointerDown={onHandlePointerDown}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              aria-label={`Drag to reorder ${label}`}
              title="Drag to reorder"
              disabled={!onHandlePointerDown}
            >
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </button>
          </div>
          <div className="explorer-toggle-preview">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
