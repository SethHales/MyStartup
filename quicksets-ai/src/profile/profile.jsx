import React from 'react';
import "./profile.css";

export function Profile() {
  const [workouts, setWorkouts] = React.useState([]);
  const [quote, setQuote] = React.useState('Loading...');
  const [quoteAuthor, setQuoteAuthor] = React.useState('unknown');

  const [stats, setStats] = React.useState({
    total_workouts: 0,
    total_sets: 0,
    most_used: "None",
  });

  React.useEffect(() => {
    handleUpdateStats();

    fetch('https://quote.cs260.click')
      .then((response) => response.json())
      .then((data) => {
        setQuote(data.quote);
        setQuoteAuthor(data.author);
      })
      .catch();
  }, []);

  const handleUpdateStats = () => {
    fetch('/api/workouts', {
      method: 'GET',
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) {
          if (response.status === 401) {
            return [];
          }
          throw new Error('Failed to fetch workouts');
        }
        return response.json();
      })
      .then((userWorkouts) => {
        setWorkouts(userWorkouts);

        const total_workouts = userWorkouts.length;

        let total_sets = 0;
        userWorkouts.forEach((workout) => {
          if (Array.isArray(workout.sets)) {
            total_sets += workout.sets.length;
          }
        });

        const exerciseCount = {};
        userWorkouts.forEach((workout) => {
          const name = workout.templateName || workout.exercise;
          if (!name) return;

          exerciseCount[name] = (exerciseCount[name] || 0) + 1;
        });

        let most_used = "None";
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
          most_used,
        });
      })
      .catch((err) => {
        console.error('Error loading workouts:', err);
      });
  };

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

        <section>
          <h3>Inspirational Quote</h3>
          <p>{quote}</p>
          <p>- {quoteAuthor}</p>
        </section>

        <a className="github-link" href="https://github.com/SethHales/MyStartup">GitHub</a>
      </div>
    </main>
  );
}
