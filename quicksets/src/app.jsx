import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.css';

import { BrowserRouter, NavLink, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { Login } from './login/login';
import { History } from './history/history';
import { Logger } from './logger/logger';
import { Profile } from './profile/profile';

function ProtectedRoute({ currentUser, isAuthChecked, children }) {
    if (!isAuthChecked) {
        return <p>Loading...</p>;
    }

    if (!currentUser) {
        return <Navigate to="/" replace />;
    }

    return children;
}

function Header({ currentUser }) {
    const location = useLocation();

    let title = "";

    switch (location.pathname) {
        case "/":
            title = "LOGIN";
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



    return (
        <header>
            <img src="/images/quicksets_logo.png" alt="QuickSets Logo" className="logo" />
            <h1>{title}</h1>
            <p>{currentUser ? `Welcome, ${currentUser.email}` : "UNKNOWN"}</p>
        </header>
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
            <div className="app">
                <Header currentUser={currentUser} />

                <Routes>
                    <Route
                        path="/"
                        element={<Login setCurrentUser={setCurrentUser} />}
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
                            <NotFound />
                        }
                    />
                    <Route
                        path="("
                        element={
                            <ProtectedRoute currentUser={currentUser} isAuthChecked={isAuthChecked}>
                                <Profile currentUser={currentUser} />
                            </ProtectedRoute>
                        }
                    />
                </Routes>

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
            </div>
        </BrowserRouter>
    );
}

function NotFound() {
    return <main className="container-fluid bg-secondary text-center">404: Return to sender. Address unknown.</main>;
}
