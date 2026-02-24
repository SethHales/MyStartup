import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.css';

import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Login } from './login/login';
import { History } from './history/history';
import { Logger } from './logger/logger';
import { Profile } from './profile/profile';

function Header() {
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
            <p>Ronald Weasley</p>
        </header>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <div className="app">
                <Header />

                <Routes>
                    <Route path='/' element={<Login />} />
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