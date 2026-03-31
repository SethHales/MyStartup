import React from 'react';
import "./login.css";
import { useNavigate } from "react-router-dom";

export function Login({ setCurrentUser }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  const navigate = useNavigate();

  // -------- LOGIN --------
  const handleLogin = async (event) => {
    event?.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = await response.json();
        alert(body.msg || "Login failed");
        return;
      }

      const user = await response.json();

      console.log("Logged in:", user);

      setCurrentUser(user);
      navigate("/logger");
    } catch (err) {
      console.error("Login failed:", err);
      alert("Unable to connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  // -------- SIGNUP --------
  const handleSignup = async () => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/create', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = await response.json();
        alert(body.msg || "Signup failed");
        return;
      }

      const user = await response.json();

      console.log("Created user:", user);

      setCurrentUser(user);
      navigate("/logger");
    } catch (err) {
      console.error("Signup failed:", err);
      alert("Unable to connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-hero">
        <p className="login-kicker">QuickSets</p>
        <h2>Train with clarity.</h2>
      </section>

      <form className="login-card" onSubmit={handleLogin}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <div className="button-options">
          <button
            className="login-button"
            type="submit"
            disabled={isLoading || !email || !password}
          >
            Log In
          </button>

          <button
            className="signup-button"
            type="button"
            onClick={handleSignup}
            disabled={isLoading || !email || !password}
          >
            Sign Up
          </button>
        </div>
      </form>

      <a className="github-link" href="https://github.com/SethHales/MyStartup">
        GitHub
      </a>
    </main>
  );
}
