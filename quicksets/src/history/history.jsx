import React from 'react';
import "./history.css";

export function History() {
  const [workouts, setWorkouts] = React.useState([
    {
      id: 1,
      date: "07/11/2007",
      workout: "Bench Press",
      notes: "New Max!",
    },
    {
      id: 2,
      date: "07/11/2007",
      workout: "Dumbbell Shoulder Press",
      notes: "I'm weak...",
    },
    {
      id: 3,
      date: "07/11/2007",
      workout: "Dumbbell Bicep Curls",
      notes: "",
    }
  ])
  return (
    <main>
      <section className="main-formatting">

        <p>This tab will allow you to see all of your past workout entries (which would be stored in the database.
          For
          now these are just placeholders). You will be able to click each one to see sets, weight, duration,
          reps,
          etc.</p>
        <table className="table table-dark table-hover">
          <thead>
            <tr>
              <th>Date</th>
              <th>Workout</th>
              <th>Notes</th>
            </tr>

          </thead>
          <tbody>
            {workouts.map((workout) =>
              <tr key={workout.id}>
                <td>{workout.date}</td>
                <td>{workout.workout}</td>
                <td>{workout.notes}</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="import-actions">
          <button type="button" className="btn btn-outline-primary">
            Import from Garmin
          </button>
          <p className="import-hint">
            Import workouts directly from Garmin
          </p>
        </div>
        <a href="https://github.com/SethHales/MyStartup">GitHub</a>
      </section>
    </main>
  );
}
