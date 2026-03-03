import React from 'react';
import "./profile.css";

export function Profile() {
  const [stats, setStats] = React.useState({
    total_workouts: null,
    total_sets: null,
    most_used: null,
  })

  React.useEffect(() => {
    handleUpdateStats();
  }, []);

  const WORKOUTS_KEY = "quicksets.workouts";

  const handleUpdateStats = () => {
    const workoutsRaw = localStorage.getItem(WORKOUTS_KEY)
    if (!workoutsRaw) {
      return;
    }

    const workouts = JSON.parse(workoutsRaw)

    const total_workouts = workouts.length;

    let total_sets = 0;

    workouts.forEach(workout => {
      if (Array.isArray(workout.sets)) {
        total_sets += workout.sets.length;
      }
    })

    const exerciseCount = {};
    workouts.forEach(workout => {
      const name = workout.exercise;

      if (!name) return;

      if (!exerciseCount[name]) {
        exerciseCount[name] = 1;
      } else {
        exerciseCount[name]++;
      }
    })

    let most_used = null;
    let highestCount = 0;

    for (const exercise in exerciseCount) {
      if (exerciseCount[exercise] > highestCount) {
        highestCount = exerciseCount[exercise];
        most_used = exercise;
      }
    }
    setStats({
      total_workouts,
      total_sets,
      most_used
    })
  }

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
