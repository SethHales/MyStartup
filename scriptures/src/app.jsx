import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.css';

import { BrowserRouter, Route, Routes, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Login } from './login/login';
import { History } from './history/history';
import { Logger } from './logger/logger';
import { Account } from './account/account';
import { BrandMark } from './components/brandMark';
import { useIsMobile } from './hooks/useIsMobile';

const THEME_STORAGE_KEY = "scriptures.theme";
const THEMES = ["light", "green", "red", "blue", "dark"];
const THEME_LABELS = {
  light: "Meadow",
  green: "Sage",
  red: "Clay",
  blue: "River",
  dark: "Dusk",
};
const THEME_BACKGROUNDS = {
  light: "/images/scriptures-bg-meadow.png",
  green: "/images/scriptures-bg-sage.png",
  red: "/images/scriptures-bg-clay.png",
  blue: "/images/scriptures-bg-river.png",
  dark: "/images/scriptures-bg-dusk-library.png",
};
const THEME_WASHES = {
  light: "linear-gradient(180deg, rgba(245, 236, 216, 0.58) 0%, rgba(228, 210, 169, 0.36) 100%)",
  green: "linear-gradient(180deg, rgba(224, 234, 214, 0.58) 0%, rgba(148, 170, 133, 0.34) 100%)",
  red: "linear-gradient(180deg, rgba(240, 220, 203, 0.58) 0%, rgba(178, 116, 91, 0.32) 100%)",
  blue: "linear-gradient(180deg, rgba(217, 231, 234, 0.58) 0%, rgba(93, 131, 142, 0.32) 100%)",
  dark: "linear-gradient(180deg, rgba(89, 83, 55, 0.58) 0%, rgba(58, 55, 40, 0.46) 100%)",
};
const THEME_BROWSER_COLORS = {
  light: "#F7F3EA",
  green: "#E8EEE1",
  red: "#F2E1D3",
  blue: "#E7F0F1",
  dark: "#4B3F35",
};

function getNextTheme(theme) {
  const currentThemeIndex = THEMES.indexOf(theme);
  return THEMES[(currentThemeIndex + 1 + THEMES.length) % THEMES.length];
}

function ProtectedRoute({ currentUser, isAuthChecked, children }) {
  if (!isAuthChecked) {
    return <p>Loading...</p>;
  }

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function Header({ currentUser, setCurrentUser, theme, toggleTheme }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [showAccountMenu, setShowAccountMenu] = React.useState(false);
  const accountMenuRef = React.useRef(null);

  React.useEffect(() => {
    setShowAccountMenu(false);
  }, [location.pathname]);

  React.useEffect(() => {
    const handlePointerDown = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) {
        setShowAccountMenu(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch (err) {
      console.error("Logout failed:", err);
    }

    setCurrentUser(null);
    setShowAccountMenu(false);
    navigate("/");
  };

  const handleOpenAccount = () => {
    setShowAccountMenu(false);
    navigate("/account");
  };

  const displayName = currentUser?.name || currentUser?.email || "";
  const isAuthPage = location.pathname === "/" || location.pathname === "/signup";
  const showBrandTitle = isMobile && !isAuthPage;
  const title = location.pathname === "/account"
    ? "Account"
    : location.pathname === "/logger"
      ? "Study Entry"
      : location.pathname === "/signup"
        ? "Create Account"
        : location.pathname === "/"
          ? "Welcome"
          : "Study Journal";

  return (
    <header>
      <BrandMark className="logo" />
      <div className={showBrandTitle ? "header-brand-title" : "header-title-stack"}>
        {showBrandTitle ? (
          <>
            <span className="header-brand-title-sets">Scriptures</span>
          </>
        ) : (
          <>
            <h1>{title}</h1>
          </>
        )}
      </div>

      {currentUser && !isAuthPage ? (
        <div className="user-section" ref={accountMenuRef}>
          <p className="user-email">{displayName}</p>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button
            type="button"
            className="account-menu-trigger"
            aria-label="Account menu"
            aria-expanded={showAccountMenu}
            onClick={() => setShowAccountMenu((current) => !current)}
          >
            <span aria-hidden="true">...</span>
          </button>
          {showAccountMenu && (
            <div className="account-menu-popover">
              <p>{displayName}</p>
              <button type="button" onClick={handleOpenAccount}>Profile</button>
              <button type="button" onClick={handleLogout}>Logout</button>
            </div>
          )}
        </div>
      ) : (
        <div className="user-section">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      )}
    </header>
  );
}

function ThemeToggle({ theme, onToggle }) {
  const currentThemeLabel = THEME_LABELS[theme] || THEME_LABELS.light;
  const nextThemeLabel = THEME_LABELS[getNextTheme(theme)];

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${nextThemeLabel} theme`}
      onClick={onToggle}
    >
      <span aria-hidden="true">{currentThemeLabel}</span>
    </button>
  );
}

function ThemeBackdrop({ theme }) {
  const [previousTheme, setPreviousTheme] = React.useState(null);
  const [isTransitionReady, setIsTransitionReady] = React.useState(true);
  const lastThemeRef = React.useRef(theme);

  React.useLayoutEffect(() => {
    if (lastThemeRef.current === theme) {
      return undefined;
    }

    let frameId;
    setPreviousTheme(lastThemeRef.current);
    setIsTransitionReady(false);
    lastThemeRef.current = theme;

    frameId = window.requestAnimationFrame(() => {
      setIsTransitionReady(true);
    });

    const timeoutId = window.setTimeout(() => {
      setPreviousTheme(null);
    }, 1900);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [theme]);

  return (
    <div className="theme-backdrop" aria-hidden="true">
      {previousTheme && (
        <div
          className="theme-backdrop-layer is-previous"
          style={{
            "--theme-wash": THEME_WASHES[previousTheme],
            backgroundImage: `url("${THEME_BACKGROUNDS[previousTheme]}")`,
          }}
        />
      )}
      <div
        key={theme}
        className={`theme-backdrop-layer is-current ${isTransitionReady ? "is-ready" : ""}`}
        style={{
          "--theme-wash": THEME_WASHES[theme],
          backgroundImage: `url("${THEME_BACKGROUNDS[theme]}")`,
        }}
      />
    </div>
  );
}

function AppShell({ currentUser, setCurrentUser, isAuthChecked, theme, toggleTheme }) {
  return (
    <div className="app">
      <ThemeBackdrop theme={theme} />
      <Header
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      <Routes>
        <Route
          path="/"
          element={
            isAuthChecked && currentUser
              ? <Navigate to="/history" replace />
              : <Login setCurrentUser={setCurrentUser} mode="login" />
          }
        />
        <Route
          path="/signup"
          element={
            isAuthChecked && currentUser
              ? <Navigate to="/history" replace />
              : <Login setCurrentUser={setCurrentUser} mode="signup" />
          }
        />
        <Route
          path="/logger"
          element={(
            <ProtectedRoute currentUser={currentUser} isAuthChecked={isAuthChecked}>
              <Logger currentUser={currentUser} />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/account"
          element={(
            <ProtectedRoute currentUser={currentUser} isAuthChecked={isAuthChecked}>
              <Account currentUser={currentUser} setCurrentUser={setCurrentUser} />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/history"
          element={(
            <ProtectedRoute currentUser={currentUser} isAuthChecked={isAuthChecked}>
              <History />
            </ProtectedRoute>
          )}
        />
        <Route path="*" element={<Navigate to={currentUser ? "/history" : "/"} replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = React.useState(null);
  const [isAuthChecked, setIsAuthChecked] = React.useState(false);
  const [theme, setTheme] = React.useState(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(storedTheme) ? storedTheme : "light";
  });

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", THEME_BROWSER_COLORS[theme] || THEME_BROWSER_COLORS.light);
    }
  }, [theme]);

  React.useEffect(() => {
    async function loadUser() {
      try {
        const response = await fetch('/api/user/me', {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          const user = await response.json();
          setCurrentUser(user);
        } else {
          setCurrentUser(null);
        }
      } catch (err) {
        console.error('Failed to load current user:', err);
        setCurrentUser(null);
      } finally {
        setIsAuthChecked(true);
      }
    }

    loadUser();
  }, []);

  return (
    <BrowserRouter>
      <AppShell
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        isAuthChecked={isAuthChecked}
        theme={theme}
        toggleTheme={() => setTheme(getNextTheme)}
      />
    </BrowserRouter>
  );
}
