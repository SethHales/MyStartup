import React from 'react';
import "./login.css";
import { Link, useNavigate } from "react-router-dom";

export function Login({ setCurrentUser, mode = "login" }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  const navigate = useNavigate();
  const isSignup = mode === "signup";

  const handleSubmit = async (event) => {
    event?.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(isSignup ? '/api/auth/create' : '/api/auth/login', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(isSignup ? { name, email, password } : { email, password }),
      });

      if (!response.ok) {
        const body = await response.json();
        alert(body.msg || (isSignup ? "Signup failed" : "Login failed"));
        return;
      }

      const user = await response.json();

      console.log(isSignup ? "Created user:" : "Logged in:", user);

      setCurrentUser(user);
      navigate("/logger");
    } catch (err) {
      console.error(isSignup ? "Signup failed:" : "Login failed:", err);
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
        <p className="login-hint">
          {isSignup ? "Create your account to start logging." : "Pick up where you left off."}
        </p>
      </section>

      <form className="login-card" onSubmit={handleSubmit}>
        <div className="auth-mode-copy">
          <h3>{isSignup ? "Sign Up" : "Log In"}</h3>
          <p>
            {isSignup ? "New here?" : "Welcome back."}
          </p>
        </div>

        {isSignup && (
          <label>
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        )}

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
            disabled={isLoading || !email || !password || (isSignup && !name.trim())}
          >
            {isSignup ? "Create account" : "Log In"}
          </button>
        </div>

        <p className="auth-switch-copy">
          {isSignup ? "Already have an account?" : "Need an account?"}{" "}
          <Link to={isSignup ? "/" : "/signup"}>
            {isSignup ? "Log in" : "Sign up"}
          </Link>
        </p>
      </form>

      <a className="github-link" href="https://github.com/SethHales/MyStartup">
        GitHub
      </a>
    </main>
  );
}
