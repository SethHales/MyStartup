import React from 'react';
import "./login.css";
import {useNavigate} from "react-router-dom";

export function Login({ setCurrentUser }) {
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [mode, setMode] = React.useState("login")

  const USERS_KEY = "quicksets.users"
  const CURRENT_USER_KEY = "quicksets.currentUser"

  const navigate = useNavigate();

  function getUsers() {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const userInfo = {
      email,
      password
    }

    if (mode === "login") {
      const users = getUsers()

      const user = users.find(u => u.email === email && u.password === password)

      if (!user) {
        alert("Invalid email or password")
        return
      }

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
      
      console.log("Logged in:", user)
      
      setCurrentUser(user)
      navigate("/logger")
    } else if (mode === "signup") {
      const users = getUsers();

      const existingUser = users.find(u => u.email === email)

      if (existingUser) {
        alert("User already exists.")
        return;
      }

      const newUser = {
        id: Date.now(),
        email,
        password,
      }

      saveUsers([...users, newUser])

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser))

      console.log("Created user:", newUser)
     
      setCurrentUser(newUser)
      navigate("/logger")
    }

    // try {
    //   const existingRaw = localStorage.getItem(WORKOUTS_KEY)
    //   const existing = existingRaw ? JSON.parse(existingRaw) : []

    //   const updated = [...existing, workout]

    //   localStorage.setItem(WORKOUTS_KEY, JSON.stringify(updated))

    //   console.log("Updated workouts in local storage:", updated)

    // } catch (err) {
    //   console.error("Failed to update workouts in local storage:", err)
    // }

  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            required />
        </label>
        <div className="button-options">
          <button onClick={() => setMode("login")} type="submit" className="login-button">Log In</button>
          <button onClick={() => setMode("signup")} type="submit" className="signup-button">Sign Up</button>
        </div>
      </form>
      <a className="github-link" href="https://github.com/SethHales/MyStartup">GitHub</a>
    </main>
  );
}
