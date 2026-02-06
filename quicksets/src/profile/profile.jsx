import React from 'react';
import "./profile.css";

export function Profile() {
  return (
    <main>
      <div className="main-formatting">
        <section className="user-stats">
          <h3>Your Stats</h3>
          <p>(These numbers will pull from the database. For now they are hardcoded examples.)</p>
          <ul>
            <li>Total workouts: <span>10</span></li>
            <li>Total sets logged: <span>34</span></li>
            <li>Most used exercise: <span>Bench Press</span></li>
          </ul>
        </section>

        <section>
          <h3>Trends</h3>
          <p>Relevant charts (eg. a chart showing workouts per week for the past 10 weeks) will go here.</p>
        </section>
        <a className="github-link" href="https://github.com/SethHales/MyStartup">GitHub</a>
      </div>
    </main>
  );
}
