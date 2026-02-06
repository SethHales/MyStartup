import React from 'react';

export function Login() {
  return (
    <main className="login-page">
      <form className="login-card" action="app.html">
        <label>
          Email
          <input type="email" required />
        </label>
        <label>
          Password
          <input type="password" required />
        </label>
        <button type="submit">Log In</button>
      </form>
      <a className="github-link" href="https://github.com/SethHales/MyStartup">GitHub</a>
    </main>
  );
}
