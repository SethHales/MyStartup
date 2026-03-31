import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.css';

import { BrowserRouter, NavLink, Route, Routes, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Login } from './login/login';
import { History } from './history/history';
import { Logger } from './logger/logger';
import { Profile } from './profile/profile';
import { BrandMark } from './components/brandMark';
import { useIsMobile } from './hooks/useIsMobile';

function ProtectedRoute({ currentUser, isAuthChecked, children }) {
    if (!isAuthChecked) {
        return <p>Loading...</p>;
    }

    if (!currentUser) {
        return <Navigate to="/" replace />;
    }

    return children;
}

function Header({ currentUser, setCurrentUser }) {
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

    const handleChangePassword = () => {
        setShowAccountMenu(false);
        navigate("/profile?modal=account-settings");
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
        case "/profile":
            title = "PROFILE";
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
                            <button type="button" onClick={handleLogout}>Logout</button>
                            <button type="button" onClick={handleChangePassword}>Account settings</button>
                        </div>
                    )}
                </div>
            )}
        </header>
    );
}

function AppShell({ currentUser, setCurrentUser, isAuthChecked }) {
    const location = useLocation();
    const showFooterNav = Boolean(currentUser) && location.pathname !== "/" && location.pathname !== "/signup";

    return (
        <div className="app">
            <Header currentUser={currentUser} setCurrentUser={setCurrentUser} />

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
                            <Logger />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/history"
                    element={
                        <ProtectedRoute currentUser={currentUser} isAuthChecked={isAuthChecked}>
                            <History />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/profile"
                    element={
                        <ProtectedRoute currentUser={currentUser} isAuthChecked={isAuthChecked}>
                            <Profile currentUser={currentUser} setCurrentUser={setCurrentUser} />
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

                        <NavLink to="/profile" className="tab">
                            Profile
                        </NavLink>
                    </nav>
                </footer>
            )}
        </div>
    );
}

export default function App() {
    const [currentUser, setCurrentUser] = React.useState(null);
    const [isAuthChecked, setIsAuthChecked] = React.useState(false);
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
            <AppShell currentUser={currentUser} setCurrentUser={setCurrentUser} isAuthChecked={isAuthChecked} />
        </BrowserRouter>
    );
}

function NotFound() {
    return <main className="container-fluid bg-secondary text-center">404: Return to sender. Address unknown.</main>;
}
