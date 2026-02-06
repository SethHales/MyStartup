import React from 'react';
import "./logger.css";

export function Logger() {
  return (
    <main>
      <div className="main-formatting">
        <section className="live-feed">
          <p className="feed-title">This is where websocket data will appear. I have included some placeholders for reference</p>
          <p>Joe Bob just started a workout!</p>
          <p>Harry Potter sent a connection request!</p>
        </section>
        <form className="workout-form">
          <label>
            Date
            <input type="date" required />
          </label>

          <label>
            Exercise
            <input type="text" placeholder="Bench Press" />
          </label>
          <section>
            <h3>Sets</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Reps</th>
                  <th>Weight</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
              </tbody>
            </table>

            <button type="button" className="btn btn-outline-secondary btn-sm">+ Add Set</button>
          </section>
          <label>
            Notes
            <textarea rows="3"></textarea>
          </label>

          <button type="submit" className="btn btn-primary">Save Workout</button>
        </form>
        <a className="github-link" href="https://github.com/SethHales/MyStartup">GitHub</a>
      </div>
    </main>
  );
}
