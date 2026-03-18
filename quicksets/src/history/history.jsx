import React from 'react';
import "./history.css";

const WORKOUTS_KEY = "quicksets.workouts";

export function History() {
  const [workouts, setWorkouts] = React.useState([])
  const [expandedWorkoutId, setExpandedWorkoutId] = React.useState(null)
  React.useEffect(() => {
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
      })
      .catch((err) => {
        console.error('Error loading workouts:', err);
      });
  }, []);

  const handleRowClick = (id) => {
    setExpandedWorkoutId((current) =>
      current === id ? null : id
    )
  }
  return (
    <main>
      <section className="main-formatting">
        <table className="history-table table table-dark table-hover">
          <thead>
            <tr>
              <th>Date</th>
              <th>Workout</th>
              <th>Notes</th>
            </tr>

          </thead>
          <tbody>
            {workouts.map((workout) =>
              <React.Fragment key={workout.id}>
                <tr onClick={() => handleRowClick(workout.id)} className={workout.id === expandedWorkoutId ? "history-row-expanded history-row" : "history-row"} style={{ cursor: "pointer" }}>
                  <td>{workout.date}</td>
                  <td>{workout.exercise}</td>
                  <td>{workout.notes}</td>
                </tr>
                <tr className={expandedWorkoutId === workout.id ? "history-row-details is-open" : "history-row-details"}>
                  <td colSpan={3}>
                    <div className={expandedWorkoutId === workout.id ? "history-details-content is-open" : "history-details-content"}>
                      <div className="history-details-panel">
                        {Array.isArray(workout.sets) && workout.sets.length > 0 ? (
                          <table className="inner-sets-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Reps</th>
                                <th>Weight</th>
                                <th>Time</th>
                              </tr>
                            </thead>
                            <tbody>
                              {workout.sets.map((set, index) => (
                                <tr key={set.id ?? index}>
                                  <td>{set.id ?? index + 1}</td>
                                  <td>{set.reps}</td>
                                  <td>{set.weight}</td>
                                  <td>{set.duration}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="no-sets-message">
                            No sets saved for this workout.
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              </React.Fragment>
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
