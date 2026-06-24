import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.css';

import { BrowserRouter, NavLink, Route, Routes, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Login } from './login/login';
import { History } from './history/history';
import { Logger } from './logger/logger';
import { Analytics } from './analytics/analytics';
import { Account } from './account/account';
import { BrandMark } from './components/brandMark';
import { useIsMobile } from './hooks/useIsMobile';
import { formatDuration } from './utils/workoutDomain';
import { AUTH_EXPIRED_EVENT } from './utils/apiFetch';

const THEME_STORAGE_KEY = "quicksets.theme";
const REST_STOPWATCH_STORAGE_KEY_PREFIX = "quicksets.restStopwatchStartedAt";

function getRestStopwatchStorageKey(currentUser) {
    const userKey = currentUser?.id || currentUser?._id || currentUser?.email;
    return userKey ? `${REST_STOPWATCH_STORAGE_KEY_PREFIX}:${userKey}` : null;
}

function readStoredRestStopwatch(storageKey) {
    if (!storageKey || typeof window === "undefined") {
        return null;
    }

    const storedValue = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(storedValue) && storedValue > 0 ? storedValue : null;
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

        const handleViewportChange = () => {
            setShowAccountMenu(false);
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("touchstart", handlePointerDown);
        window.addEventListener("scroll", handleViewportChange, true);
        window.addEventListener("resize", handleViewportChange);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("touchstart", handlePointerDown);
            window.removeEventListener("scroll", handleViewportChange, true);
            window.removeEventListener("resize", handleViewportChange);
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
    let title = "";
    const isAuthPage = location.pathname === "/" || location.pathname === "/signup";
    switch (location.pathname) {
        case "/":
            title = "LOGIN";
            break;
        case "/signup":
            title = "SIGN UP";
            break;
        case "/history":
            title = "HISTORY";
            break;
        case "/logger":
            title = "LOGGER";
            break;
        case "/analytics":
            title = "ANALYTICS";
            break;
        case "/account":
            title = "ACCOUNT";
            break;
        default:
            title = "QuickSets";
    }

    const showBrandTitle = isMobile && !isAuthPage;



    return (
        <header>
            <BrandMark className="logo" />
            <h1 className={showBrandTitle ? "header-brand-title" : ""}>
                {showBrandTitle ? (
                    <>
                        <span className="header-brand-title-quick">Quick</span>
                        <span className="header-brand-title-sets">Sets</span>
                    </>
                ) : (
                    title
                )}
            </h1>

            {currentUser && !isAuthPage && (
                <div className="user-section" ref={accountMenuRef}>
                    <p className="user-email">{displayName}</p>
                    <button
                        type="button"
                        className="theme-toggle"
                        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                        onClick={toggleTheme}
                    >
                        <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
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
            )}

            {!currentUser && (
                <div className="user-section">
                    <button
                        type="button"
                        className="theme-toggle"
                        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                        onClick={toggleTheme}
                    >
                        <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
                    </button>
                </div>
            )}
        </header>
    );
}

function RestStopwatchPopover({ startedAt, now, onClose }) {
    const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));

    return (
        <aside className="rest-stopwatch-popover" aria-live="polite" aria-label="Rest stopwatch">
            <div>
                <p className="rest-stopwatch-kicker">Rest Stopwatch</p>
                <strong>{formatDuration(elapsedSeconds)}</strong>
                <span>since your last set</span>
            </div>
            <button type="button" className="rest-stopwatch-close" onClick={onClose} aria-label="Hide rest stopwatch">
                &times;
            </button>
        </aside>
    );
}

function AppShell({
    currentUser,
    setCurrentUser,
    isAuthChecked,
    theme,
    toggleTheme,
    restStopwatchStartedAt,
    restStopwatchNow,
    onSetLogged,
    onClearRestStopwatch,
}) {
    const location = useLocation();
    const navigate = useNavigate();
    const showFooterNav = Boolean(currentUser)
        && location.pathname !== "/"
        && location.pathname !== "/signup";

    React.useEffect(() => {
        const handleAuthExpired = () => {
            setCurrentUser(null);
            navigate("/", { replace: true });
        };

        window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
        return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    }, [navigate, setCurrentUser]);

    return (
        <div className="app">
            <Header currentUser={currentUser} setCurrentUser={setCurrentUser} theme={theme} toggleTheme={toggleTheme} />

            <Routes>
                <Route
                    path="/"
                    element={
                        isAuthChecked && currentUser
                            ? <Navigate to="/logger" replace />
                            : <Login setCurrentUser={setCurrentUser} mode="login" />
                    }
                />

                <Route
                    path="/signup"
                    element={
                        isAuthChecked && currentUser
                            ? <Navigate to="/logger" replace />
                            : <Login setCurrentUser={setCurrentUser} mode="signup" />
                    }
                />

                <Route
                    path="/logger"
                    element={
                        <ProtectedRoute currentUser={currentUser} isAuthChecked={isAuthChecked}>
                            <Logger
                                currentUser={currentUser}
                                setCurrentUser={setCurrentUser}
                                onSetLogged={onSetLogged}
                                onClearRestStopwatch={onClearRestStopwatch}
                            />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/history"
                    element={
                        <ProtectedRoute currentUser={currentUser} isAuthChecked={isAuthChecked}>
                            <History currentUser={currentUser} setCurrentUser={setCurrentUser} />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/analytics"
                    element={
                        <ProtectedRoute currentUser={currentUser} isAuthChecked={isAuthChecked}>
                            <Analytics currentUser={currentUser} />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/account"
                    element={
                        <ProtectedRoute currentUser={currentUser} isAuthChecked={isAuthChecked}>
                            <Account currentUser={currentUser} setCurrentUser={setCurrentUser} />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="*"
                    element={
                        <NotFound />
                    }
                />
            </Routes>

            {showFooterNav && (
                <footer>
                    <nav className="tab-menu">
                        <NavLink to="/logger" className="tab">
                            Logger
                        </NavLink>

                        <NavLink to="/history" className="tab">
                            History
                        </NavLink>

                        <NavLink to="/analytics" className="tab">
                            Analytics
                        </NavLink>
                    </nav>
                </footer>
            )}

            {showFooterNav && restStopwatchStartedAt && (
                <RestStopwatchPopover
                    startedAt={restStopwatchStartedAt}
                    now={restStopwatchNow}
                    onClose={onClearRestStopwatch}
                />
            )}
        </div>
    );
}

export default function App() {
    const [currentUser, setCurrentUser] = React.useState(null);
    const [isAuthChecked, setIsAuthChecked] = React.useState(false);
    const [theme, setTheme] = React.useState(() => {
        const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        return storedTheme === "light" ? "light" : "dark";
    });
    const restStopwatchStorageKey = React.useMemo(
        () => getRestStopwatchStorageKey(currentUser),
        [currentUser]
    );
    const [restStopwatchStartedAt, setRestStopwatchStartedAt] = React.useState(null);
    const [restStopwatchNow, setRestStopwatchNow] = React.useState(Date.now());

    React.useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);

        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (themeColorMeta) {
            themeColorMeta.setAttribute("content", theme === "light" ? "#f4f7fb" : "#101114");
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

    React.useEffect(() => {
        setRestStopwatchStartedAt(readStoredRestStopwatch(restStopwatchStorageKey));
        setRestStopwatchNow(Date.now());
    }, [restStopwatchStorageKey]);

    React.useEffect(() => {
        if (!restStopwatchStartedAt) {
            return undefined;
        }

        setRestStopwatchNow(Date.now());
        const intervalId = window.setInterval(() => {
            setRestStopwatchNow(Date.now());
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [restStopwatchStartedAt]);

    React.useEffect(() => {
        if (!restStopwatchStorageKey) {
            return undefined;
        }

        const handleStorage = (event) => {
            if (event.key === restStopwatchStorageKey) {
                setRestStopwatchStartedAt(readStoredRestStopwatch(restStopwatchStorageKey));
                setRestStopwatchNow(Date.now());
            }
        };

        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [restStopwatchStorageKey]);

    const startRestStopwatch = React.useCallback(() => {
        const now = Date.now();

        if (restStopwatchStorageKey) {
            window.localStorage.setItem(restStopwatchStorageKey, String(now));
        }

        setRestStopwatchStartedAt(now);
        setRestStopwatchNow(now);
    }, [restStopwatchStorageKey]);

    const clearRestStopwatch = React.useCallback(() => {
        if (restStopwatchStorageKey) {
            window.localStorage.removeItem(restStopwatchStorageKey);
        }

        setRestStopwatchStartedAt(null);
    }, [restStopwatchStorageKey]);

    return (
        <BrowserRouter>
            <AppShell
                currentUser={currentUser}
                setCurrentUser={setCurrentUser}
                isAuthChecked={isAuthChecked}
                theme={theme}
                toggleTheme={() => setTheme((currentTheme) => currentTheme === "dark" ? "light" : "dark")}
                restStopwatchStartedAt={restStopwatchStartedAt}
                restStopwatchNow={restStopwatchNow}
                onSetLogged={startRestStopwatch}
                onClearRestStopwatch={clearRestStopwatch}
            />
        </BrowserRouter>
    );
}

function NotFound() {
    return <main className="container-fluid bg-secondary text-center">404: Return to sender. Address unknown.</main>;
}
