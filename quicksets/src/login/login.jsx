import React from 'react';
import "./login.css";
import { useNavigate } from "react-router-dom";

export function Login({ setCurrentUser }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [mode, setMode] = React.useState("login");
  const [isLoading, setIsLoading] = React.useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/create";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = await response.json();
        alert(body.msg || "Something went wrong");
        return;
      }

      const user = await response.json();

      console.log(
        mode === "login" ? "Logged in:" : "Created user:",
        user
      );

      setCurrentUser(user);
      navigate("/logger");
    } catch (err) {
      console.error("Auth request failed:", err);
      alert("Unable to connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
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
            type="button"
            className="login-button"
            onClick={() => setMode("login")}
          >
            Log In Mode
          </button>

          <button
            type="button"
            className="signup-button"
            onClick={() => setMode("signup")}
          >
            Sign Up Mode
          </button>
        </div>

        <button type="submit" className="submit-button" disabled={isLoading}>
          {isLoading
            ? "Please wait..."
            : mode === "login"
            ? "Log In"
            : "Sign Up"}
        </button>
      </form>

      <a className="github-link" href="https://github.com/SethHales/MyStartup">
        GitHub
      </a>
    </main>
  );
}