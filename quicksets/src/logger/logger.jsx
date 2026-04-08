import React from 'react';
import "./logger.css";
const WORKOUTS_KEY = "quicksets.workouts";

export function Logger({ current }) {
  const getTodayLocal = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [sets, setSets] = React.useState([]);
  const [date, setDate] = React.useState(getTodayLocal());
  const [exercise, setExercise] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [messages, setMessages] = React.useState([]);


  React.useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host =
      window.location.hostname === 'localhost'
        ? 'localhost:4000'
        : window.location.host;
    const socket = new WebSocket(`${protocol}://${host}`);

    socket.onopen = () => {
      console.log('WebSocket connected');
    };

    socket.onmessage = async (event) => {
      const text = typeof event.data === 'string' ? event.data : await event.data.text();
      const message = JSON.parse(text);

      if (message.type === 'notification' && message.sender != ) {
        setMessages((prev) => [message.message, ...prev]);
      }
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
    };

    socket.onerror = (error) => {
      console.log('WebSocket error:', error);
    };

    return () => {
      socket.close();
    };
  }, []);

  const handleAddSet = () => {
    console.log('adding set')
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
          ? { ...set, [field]: value }
          : set
      )
    ))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const workout = {
      date,
      exercise,
      notes,
      sets
    }
    console.log("Saving workout:\n", workout)

    try {

      const response = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(workout),
        credentials: 'include',
      });

      if (!response.ok) {
        const body = await response.json();
        alert(body.msg || 'Failed to save workout');
        return;
      }

      const savedWorkout = await response.json();
      console.log('Saved workout:', savedWorkout);

      setDate(getTodayLocal())
      setExercise("")
      setNotes("")
      setSets([])
    } catch (err) {
      console.error("Failed to update workouts in service:", err)
    }


  }


  return (
    <main>
      <div className="main-formatting">
        <section className="live-feed">
          <p className="feed-title">Live Feed</p>
          {messages.map((message, index) => (
            <p key={index}>
              {message}
            </p>
          ))}
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
              onChange={(e) => setExercise(e.target.value)} />
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
