import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.css';

export default function App() {
    return (
        <div className="app bg-dark text-light">
            <header>
                <img src="images/quicksets_logo.png" alt="QuickSets Logo" className="logo" />
                <h1>History</h1>
                <p>Ronald Weasley</p>
            </header>

            <main>App components go here</main>

            <footer>
                <nav className="tab-menu">
                    <a href="log.html" className="tab">Logger</a>
                    <a href="history.html" className="tab" id="active">History</a>
                    <a href="profile.html" className="tab">Profile</a>
                </nav>
            </footer>
        </div>
    );
}