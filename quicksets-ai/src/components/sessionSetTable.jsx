import React from "react";
import { createPortal } from "react-dom";
import { getSetDisplayLabel } from "../utils/workoutDomain";
import { getWorkoutColor } from "../utils/workoutColors";
import { getFieldLabel } from "../logger/loggerHelpers";

export function SessionSetTable({
  sets,
  fields,
  measurements,
  isMixed = false,
  emptyMessage = "No sets logged yet.",
  onEditSet,
  onDeleteSet,
}) {
  const [openSetMenu, setOpenSetMenu] = React.useState(null);
  const setMenuRef = React.useRef(null);
  const openSetMenuEntry = React.useMemo(() => {
    if (!openSetMenu) {
      return null;
    }

    return sets.find((set, index) => `${set.id}-${index}` === openSetMenu.rowKey) || null;
  }, [openSetMenu, sets]);

  React.useLayoutEffect(() => {
    if (!openSetMenu || !setMenuRef.current || !openSetMenu.anchorRect) {
      return;
    }

    const menuRect = setMenuRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const footerHeightValue = Number.parseFloat(
      window.getComputedStyle(document.documentElement).getPropertyValue("--footer-height")
    );
    const footerReserve = (Number.isFinite(footerHeightValue) ? footerHeightValue : 76) + 18;
    const maxTop = window.innerHeight - footerReserve - menuRect.height;
    const preferredTop = openSetMenu.anchorRect.bottom + 8;
    const fallbackTop = openSetMenu.anchorRect.top - menuRect.height - 8;
    const nextTop = preferredTop <= maxTop
      ? preferredTop
      : Math.max(viewportPadding, fallbackTop);
    const nextLeft = Math.max(
      viewportPadding,
      Math.min(
        openSetMenu.anchorRect.right - menuRect.width,
        window.innerWidth - menuRect.width - viewportPadding
      )
    );

    if (openSetMenu.top !== nextTop || openSetMenu.left !== nextLeft) {
      setOpenSetMenu((currentMenu) => (
        currentMenu
        && currentMenu.rowKey === openSetMenu.rowKey
        && currentMenu.anchorRect === openSetMenu.anchorRect
          ? { ...currentMenu, top: nextTop, left: nextLeft }
          : currentMenu
      ));
    }
  }, [openSetMenu]);

  React.useEffect(() => {
    if (!openSetMenu) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        setMenuRef.current?.contains(event.target)
        || event.target?.closest?.(".set-menu-trigger")
      ) {
        return;
      }

      setOpenSetMenu(null);
    };

    const closeMenu = () => setOpenSetMenu(null);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [openSetMenu]);

  const toggleSetMenu = (event, set, index) => {
    event.stopPropagation();

    const rowKey = `${set.id}-${index}`;
    setOpenSetMenu((currentMenu) => {
      if (currentMenu?.rowKey === rowKey) {
        return null;
      }

      const rect = event.currentTarget.getBoundingClientRect();

      return {
        rowKey,
        setId: set.id,
        anchorRect: {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
        top: rect.bottom + 8,
        left: rect.right,
      };
    });
  };

  if (!sets.length) {
    return (
      <div className="empty-sets-state">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <table className="session-set-table">
        <thead>
          <tr>
            <th>Set</th>
            {isMixed && <th>Exercise</th>}
            {fields.map((field) => (
              <th key={field.key}>{getFieldLabel(field, measurements)}</th>
            ))}
            <th className="set-actions-header"></th>
          </tr>
        </thead>
        <tbody>
          {sets.map((set, index) => (
            <tr key={set.id}>
              <td>{getSetDisplayLabel(set, sets, index)}</td>
              {isMixed && (
                <td className="logger-mixed-workout-cell">
                  <span
                    className="logger-inline-workout"
                    style={{ "--workout-color": getWorkoutColor(set) }}
                  >
                    <span className="logger-inline-workout-dot" aria-hidden="true" />
                    {set.templateName || "Exercise set"}
                  </span>
                </td>
              )}
              {fields.map((field) => (
                <td key={field.key}>{set[field.key] ?? ""}</td>
              ))}
              <td className="set-actions-cell">
                <div className="set-actions-menu">
                  <button
                    type="button"
                    className="set-menu-trigger"
                    aria-label={`Manage set ${set.id}`}
                    aria-expanded={openSetMenu?.rowKey === `${set.id}-${index}`}
                    onClick={(event) => toggleSetMenu(event, set, index)}
                  >
                    ...
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {openSetMenu && openSetMenuEntry && typeof document !== "undefined" && createPortal(
        <div
          ref={setMenuRef}
          className="set-menu-popover is-floating"
          style={{ top: `${openSetMenu.top}px`, left: `${openSetMenu.left}px` }}
        >
          <button
            type="button"
            className="set-menu-item"
            onClick={() => {
              setOpenSetMenu(null);
              onEditSet(openSetMenuEntry);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="set-menu-item delete"
            onClick={() => {
              setOpenSetMenu(null);
              onDeleteSet(openSetMenu.setId);
            }}
          >
            Delete
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
