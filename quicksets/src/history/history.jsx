import React from 'react';
import "./history.css";

export function History() {
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
            <tr>
              <td>07/11/2007</td>
              <td>Bench Press</td>
              <td>New Max!</td>
            </tr>
            <tr>
              <td>07/11/2007</td>
              <td>Dumbbell Shoulder Press</td>
              <td>I'm weak...</td>
            </tr>
            <tr>
              <td>07/11/2007</td>
              <td>Dumbbell Bicep Curls</td>
              <td></td>
            </tr>
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
