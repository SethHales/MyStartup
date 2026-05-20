import React from "react";

const MOBILE_BREAKPOINT = 700;

export function useIsMobile(maxWidth = MOBILE_BREAKPOINT) {
  const getMatches = React.useCallback(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia(`(max-width: ${maxWidth}px)`).matches;
  }, [maxWidth]);

  const [isMobile, setIsMobile] = React.useState(getMatches);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const updateMatches = () => setIsMobile(mediaQuery.matches);

    updateMatches();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateMatches);
      return () => mediaQuery.removeEventListener("change", updateMatches);
    }

    mediaQuery.addListener(updateMatches);
    return () => mediaQuery.removeListener(updateMatches);
  }, [maxWidth]);

  return isMobile;
}
