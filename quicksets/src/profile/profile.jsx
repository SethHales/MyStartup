import React from 'react';
import "./profile.css";

export function Profile() {
  const [stats, setStats] = React.useState({
    total_workouts: null,
    total_sets: null,
    most_used: null,
  })

  handleSetStats

  return (
    <main>
      <div className="main-formatting">
        <section className="user-stats">
          <h3>Your Stats</h3>
          <p>(These numbers will pull from the database. For now they pull from localStorage.)</p>
          <ul>
            <li>Total workouts: <span>{stats.total_workouts}</span></li>
            <li>Total sets logged: <span>{stats.total_sets}</span></li>
            <li>Most used exercise: <span>{stats.most_used}</span></li>
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
