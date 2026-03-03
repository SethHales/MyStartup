import React from 'react';
import "./logger.css";
const WORKOUTS_KEY = "quicksets.workouts";

export function Logger() {
  const [sets, setSets] = React.useState([]);
  const [date, setDate] = React.useState([]);
  const [exercise, setExercise] = React.useState([]);
  const [notes, setNotes] = React.useState([]);
  const handleAddSet = () => {
    setSets(prevSets => {
      const nextId = prevSets.length + 1;

      const newSet = {
        id: nextId,
        reps: "",
        weight: "",
        duration: "",
      }
      
      return [...prevSets, newSet];
    })
  }
  const handleSetChange = (id, field, value) => {
    (setSets(prevSets =>
      prevSets.map(set => 
        set.id === id
          ? {...set, [field]: value}
          : set
      )
    ))
  }
  const handleSubmit = (event) => {
    event.preventDefault()

    const workout = {
      id: Date.now(),
      date,
      exercise,
      notes,
      sets
    }
    console.log("Saving workout:\n", workout)

    try {
      const existingRaw = localStorage.getItem(WORKOUTS_KEY)
      const existing = existingRaw ? JSON.parse(existingRaw) : []

      const updated = [...existing, workout]

      localStorage.setItem(WORKOUTS_KEY, JSON.stringify(updated))

      console.log("Updated workouts in local storage:", updated)

    } catch (err) {
      console.error("Failed to update workouts in local storage:", err)
    }

    setDate("")
    setExercise("")
    setNotes("")
    setSets([])
  }


  return (
    <main>
      <div className="main-formatting">
        <section className="live-feed">
          <p className="feed-title">This is where websocket data will appear. I have included some placeholders for reference</p>
          <p>Joe Bob just started a workout!</p>
          <p>Harry Potter sent a connection request!</p>
        </section>
        <form className="workout-form" onSubmit={handleSubmit}>
          <label>
            Date
            <input 
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required 
            />
          </label>

          <label>
            Exercise
            <input 
              type="text" 
              placeholder="Bench Press"
              value={exercise}
              onChange={(e) => setExercise(e.target.value)}/>
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
                {sets.map((set) => (
                  <tr key={set.id}>
                    <td>{set.id}</td>
                    <td>
                      <input
                        type="number"
                        value={set.reps}
                        placeholder="10"
                        onChange={(e) => 
                          handleSetChange(set.id, "reps", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={set.weight}
                        placeholder="135"
                        onChange={(e) => 
                          handleSetChange(set.id, "weight", e.target.value)
                        }
                        />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={set.duration}
                        placeholder="00:30"
                        onChange={(e) => 
                          handleSetChange(set.id, "duration", e.target.value)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleAddSet}>+ Add Set</button>
          </section>
          <label>
            Notes
            <textarea rows="3" value={notes} onChange={(e) => setNotes(e.target.value)}></textarea>
          </label>

          <button type="submit" className="btn btn-primary">Save Workout</button>
        </form>
        <a className="github-link" href="https://github.com/SethHales/MyStartup">GitHub</a>
      </div>
    </main>
  );
}
