import React from 'react';
import "./history.css";

const WORKOUTS_KEY = "quicksets.workouts";

export function History() {
  const [workouts, setWorkouts] = React.useState([])
  const [expandedWorkoutId, setExpandedWorkoutId] = React.useState(null)
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(WORKOUTS_KEY)
      if (!stored) {
        return
      }

      const parsed = JSON.parse(stored)

      if (Array.isArray(parsed)) {
        setWorkouts(parsed)
      } else {
        console.warn("Stored workouts is not an array")
      }
    } catch (err) {
      console.error("Failed to load workouts from localStorage:", err)
    }
  }, [])
  const handleRowClick = (id) => {
    setExpandedWorkoutId((current) =>
      current === id ? null : id
    )
  }
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
              <React.Fragment>
                <tr key={workout.id} onClick={() => handleRowClick(workout.id)} className={workout.id === expandedWorkoutId ? "history-row-expanded" : "history-row"} style={{cursor: "pointer"}}>
                  <td>{workout.date}</td>
                  <td>{workout.exercise}</td>
                  <td>{workout.notes}</td>
                </tr>
                {expandedWorkoutId === workout.id && (
                  <tr className="history-row-details">
                    <td colSpan={3}>
                      {Array.isArray(workout.sets) && workout.sets.length > 0 ? (
                        <table className="table table-sm inner-sets-table">
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
                    </td>
                  </tr>
                )}
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