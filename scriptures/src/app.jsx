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
const THEMES = ["dark", "light", "red", "blue", "green"];
const THEME_ICONS = {
  dark: "☀",
  light: "◐",
  red: "●",
  blue: "◆",
  green: "▲",
};

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
  const currentThemeIndex = THEMES.indexOf(theme);
  const nextTheme = THEMES[(currentThemeIndex + 1 + THEMES.length) % THEMES.length];
  const themeIcon = THEME_ICONS[theme] || THEME_ICONS.dark;

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
  const title = location.pathname === "/history"
    ? "History"
    : location.pathname === "/logger"
      ? "Logger"
      : location.pathname === "/account"
        ? "Account"
        : location.pathname === "/signup"
          ? "Sign Up"
          : location.pathname === "/"
            ? "Login"
            : "Scriptures";

  return (
    <header>
      <BrandMark className="logo" />
      <h1 className={showBrandTitle ? "header-brand-title" : ""}>
        {showBrandTitle ? (
          <>
            <span className="header-brand-title-quick">Script</span>
            <span className="header-brand-title-sets">ures</span>
          </>
        ) : (
          title
        )}
      </h1>

      {currentUser && !isAuthPage ? (
        <div className="user-section" ref={accountMenuRef}>
          <p className="user-email">{displayName}</p>
          <button
            type="button"
            className="theme-toggle"
            aria-label={`Switch to ${nextTheme} theme`}
            onClick={toggleTheme}
          >
            <span aria-hidden="true">{themeIcon}</span>
          </button>
          <button
            type="button"
            className="account-menu-trigger"
            aria-label="Account menu"
            aria-expanded={showAccountMenu}
            onClick={() => setShowAccountMenu((current) => !current)}
          >
            <span aria-hidden="true">•••</span>
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
          <button
            type="button"
            className="theme-toggle"
            aria-label={`Switch to ${nextTheme} theme`}
            onClick={toggleTheme}
          >
            <span aria-hidden="true">{themeIcon}</span>
          </button>
        </div>
      )}
    </header>
  );
}

function AppShell({ currentUser, setCurrentUser, isAuthChecked, theme, toggleTheme }) {
  return (
    <div className="app">
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
      const themeColorMap = {
        dark: "#3a3728",
        light: "#f5ecd8",
        red: "#f0dccb",
        blue: "#d9e7ea",
        green: "#e0ead6",
      };
      themeColorMeta.setAttribute("content", themeColorMap[theme] || "#101114");
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
        toggleTheme={() => setTheme((currentTheme) => THEMES[(THEMES.indexOf(currentTheme) + 1 + THEMES.length) % THEMES.length])}
      />
    </BrowserRouter>
  );
}
