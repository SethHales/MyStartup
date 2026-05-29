import React from 'react';
import "./account.css";

export function Account({ currentUser, setCurrentUser }) {
  const [displayName, setDisplayName] = React.useState(currentUser?.name || "");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [status, setStatus] = React.useState({ type: "", message: "" });
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const [isSavingPassword, setIsSavingPassword] = React.useState(false);

  React.useEffect(() => {
    setDisplayName(currentUser?.name || "");
  }, [currentUser?.name]);

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setIsSavingProfile(true);
    setStatus({ type: "", message: "" });

    try {
      const response = await fetch('/api/user/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: displayName }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({ type: "error", message: body.msg || "Unable to update your profile." });
        return;
      }

      setCurrentUser(body);
      setStatus({ type: "success", message: "Profile updated." });
    } catch (err) {
      console.error('Failed to update profile:', err);
      setStatus({ type: "error", message: "Unable to update your profile." });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setStatus({ type: "", message: "" });

    if (!currentPassword || !newPassword || !confirmPassword) {
      setStatus({ type: "error", message: "Fill out all password fields." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus({ type: "error", message: "New passwords do not match." });
      return;
    }

    setIsSavingPassword(true);

    try {
      const response = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({ type: "error", message: body.msg || "Unable to change your password." });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus({ type: "success", message: "Password updated." });
    } catch (err) {
      console.error('Failed to change password:', err);
      setStatus({ type: "error", message: "Unable to change your password." });
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <main>
      <div className="main-formatting">
        <section className="account-hero-card">
          <p className="account-kicker">Account</p>
          <h2>{currentUser?.name || currentUser?.email || "Your account"}</h2>
          <p className="account-hero-copy">
            This is the same account used across QuickSets and Scriptures.
          </p>
        </section>

        <section className="account-panel">
          <div className="account-panel-header">
            <div>
              <p className="account-kicker">Profile</p>
              <h3>Account information</h3>
            </div>
          </div>

          <form className="account-form" onSubmit={handleSaveProfile}>
            <label className="account-input-block">
              <span>Name</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>

            <label className="account-input-block">
              <span>Email</span>
              <input
                type="email"
                value={currentUser?.email || ""}
                disabled
              />
            </label>

            <div className="account-actions">
              <button type="submit" className="btn btn-primary" disabled={isSavingProfile || !displayName.trim()}>
                {isSavingProfile ? "Saving..." : "Save profile"}
              </button>
            </div>
          </form>
        </section>

        <section className="account-panel">
          <div className="account-panel-header">
            <div>
              <p className="account-kicker">Security</p>
              <h3>Change password</h3>
            </div>
          </div>

          <form className="account-form" onSubmit={handleChangePassword}>
            <label className="account-input-block">
              <span>Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </label>

            <label className="account-input-block">
              <span>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </label>

            <label className="account-input-block">
              <span>Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>

            <div className="account-actions">
              <button type="submit" className="btn btn-primary" disabled={isSavingPassword}>
                {isSavingPassword ? "Saving..." : "Update password"}
              </button>
            </div>
          </form>
        </section>

        {status.message ? (
          <section className={status.type === "success" ? "account-status success" : "account-status error"}>
            {status.message}
          </section>
        ) : null}
      </div>
    </main>
  );
}
