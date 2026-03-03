import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.css';

import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Login } from './login/login';
import { History } from './history/history';
import { Logger } from './logger/logger';
import { Profile } from './profile/profile';

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
    const CURRENT_USER_KEY = "quicksets.currentUser"
    const [currentUser, setCurrentUser] = React.useState(() => {
        const stored = localStorage.getItem(CURRENT_USER_KEY)
        return stored ? JSON.parse(stored) : null
    })

    return (
        <BrowserRouter>
            <div className="app">
                <Header currentUser={currentUser} />

                <Routes>
                    <Route path='/' element={<Login setCurrentUser={setCurrentUser} />} />
                    <Route path='/history' element={<History />} />
                    <Route path='/logger' element={<Logger />} />
                    <Route path='/profile' element={<Profile />} />
                    <Route path='*' element={<NotFound />} />
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
