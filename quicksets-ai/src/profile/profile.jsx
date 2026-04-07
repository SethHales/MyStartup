import React from 'react';
import "./profile.css";
import { Dropdown } from "../components/dropdown";
import { useLocation, useNavigate } from 'react-router-dom';
import { getWorkoutColor } from "../utils/workoutColors";

const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];

export function Analytics({ currentUser }) {
  const [workouts, setWorkouts] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedBreakdownCategory, setSelectedBreakdownCategory] = React.useState("all");
  const [selectedWorkoutName, setSelectedWorkoutName] = React.useState("");

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
        const sortedWorkouts = sortWorkoutsAscending(userWorkouts);
        setWorkouts(sortedWorkouts);

        const workoutNames = getWorkoutNames(sortedWorkouts);
        if (workoutNames.length > 0) {
          setSelectedWorkoutName((currentName) => currentName || workoutNames[0]);
        }
      })
      .catch((err) => {
        console.error('Error loading workouts:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const analyticsWorkouts = React.useMemo(() => expandAnalyticsWorkouts(workouts), [workouts]);
  const workoutNames = React.useMemo(() => getWorkoutNames(analyticsWorkouts), [analyticsWorkouts]);
  const uniqueWorkoutDays = React.useMemo(() => getUniqueWorkoutDays(analyticsWorkouts), [analyticsWorkouts]);
  const dayCountMap = React.useMemo(() => getWorkoutDayCountMap(analyticsWorkouts), [analyticsWorkouts]);

  const profileIdentity = React.useMemo(
    () => buildProfileIdentity(analyticsWorkouts, currentUser),
    [analyticsWorkouts, currentUser]
  );

  const workoutBreakdown = React.useMemo(
    () => buildWorkoutBreakdown(analyticsWorkouts, selectedBreakdownCategory),
    [analyticsWorkouts, selectedBreakdownCategory]
  );

  const weeklySnapshot = React.useMemo(
    () => buildWeeklySnapshot(analyticsWorkouts, uniqueWorkoutDays),
    [analyticsWorkouts, uniqueWorkoutDays]
  );

  const consistencyStats = React.useMemo(
    () => buildConsistencyStats(analyticsWorkouts, uniqueWorkoutDays, dayCountMap),
    [analyticsWorkouts, uniqueWorkoutDays, dayCountMap]
  );

  const selectedWorkoutStats = React.useMemo(
    () => buildSelectedWorkoutStats(analyticsWorkouts, selectedWorkoutName),
    [analyticsWorkouts, selectedWorkoutName]
  );

  return (
    <main>
      <div className="main-formatting profile-layout">
        {isLoading ? (
          <section className="profile-loading-state" aria-live="polite">
            <div className="profile-loading-hero">
              <p className="profile-kicker">Analytics</p>
              <h2>Loading your dashboard...</h2>
              <p className="panel-muted">Crunching your training trends.</p>
            </div>
            <div className="profile-loading-grid">
              <div className="profile-loading-card profile-loading-card-wide" />
              <div className="profile-loading-card" />
              <div className="profile-loading-card" />
              <div className="profile-loading-card" />
            </div>
          </section>
        ) : (
          <>
        <section className="profile-hero">
          <div>
            <p className="profile-kicker">Analytics</p>
            <h2>{profileIdentity.displayName}</h2>
          </div>
          <div className="profile-meta-grid">
            <div className="profile-meta-card">
              <span>Member Since</span>
              <strong>{profileIdentity.memberSince}</strong>
            </div>
            <div className="profile-meta-card">
              <span>Last Workout</span>
              <strong>{profileIdentity.lastWorkout}</strong>
            </div>
            <div className="profile-meta-card">
              <span>Favorite Workout</span>
              <strong>{profileIdentity.favoriteWorkout}</strong>
            </div>
          </div>
        </section>

        <section className="profile-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Workout Breakdown</p>
              <h3>{workoutBreakdown.mode === "workouts" ? "Workout Split" : "How You Train"}</h3>
            </div>
            <button
              type="button"
              className={selectedBreakdownCategory === "all" ? "breakdown-filter active" : "breakdown-filter"}
              onClick={() => setSelectedBreakdownCategory("all")}
            >
              {selectedBreakdownCategory === "all"
                ? workoutBreakdown.mode === "workouts" ? "All workout splits" : "All workouts"
                : `Showing ${workoutBreakdown.activeCategoryLabel}`}
            </button>
          </div>

          <div className="breakdown-layout">
            <div className="breakdown-visual-card">
              <DonutBreakdownChart
                segments={workoutBreakdown.categories}
                total={workoutBreakdown.totalWorkouts}
                activeCategoryKey={workoutBreakdown.activeCategoryKey}
                onSelectCategory={(categoryKey) => {
                  setSelectedBreakdownCategory((currentKey) => (
                    currentKey === categoryKey ? "all" : categoryKey
                  ));
                }}
              />
            </div>

            <div className="breakdown-details">
              <div className="breakdown-legend">
                {workoutBreakdown.categories.map((category) => (
                  <button
                    key={category.key}
                    type="button"
                    className={category.key === workoutBreakdown.activeCategoryKey ? "breakdown-legend-row active" : "breakdown-legend-row"}
                    onClick={() => {
                      setSelectedBreakdownCategory((currentKey) => (
                        currentKey === category.key ? "all" : category.key
                      ));
                    }}
                  >
                    <span
                      className={`breakdown-swatch ${category.swatchClass}`}
                      style={category.color ? { background: category.color } : undefined}
                      aria-hidden="true"
                    />
                    <span className="breakdown-legend-copy">
                      <strong>{category.label}</strong>
                      <span>{category.count} workouts</span>
                    </span>
                    <span className="breakdown-legend-percent">{category.percentage}%</span>
                  </button>
                ))}
              </div>

              <div className="breakdown-top-workouts">
                <div className="trend-card-header">
                  <h4>{workoutBreakdown.activeCategoryLabel}</h4>
                  <p>{workoutBreakdown.activeCategoryDescription}</p>
                </div>

                {workoutBreakdown.topWorkouts.length > 0 ? (
                  <div className="breakdown-workout-list">
                    {workoutBreakdown.topWorkouts.map((workout) => (
                      <button
                        key={workout.name}
                        type="button"
                        className={workout.name === selectedWorkoutName ? "breakdown-workout-row active" : "breakdown-workout-row"}
                        onClick={() => setSelectedWorkoutName(workout.name)}
                        >
                          <span className="breakdown-workout-rank">{workout.rank}</span>
                          <span className="breakdown-workout-copy">
                            <strong>
                              <span
                                className="breakdown-workout-dot"
                                style={{ backgroundColor: workout.color || getWorkoutColor(workout.name) }}
                                aria-hidden="true"
                              />
                              {workout.name}
                            </strong>
                            <span>{workout.count} sessions</span>
                          </span>
                        <span className="breakdown-workout-share">{workout.share}%</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="panel-empty">No workouts in this category yet.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="profile-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Weekly Snapshot</p>
              <h3>This Week</h3>
            </div>
            <p className="panel-muted">{weeklySnapshot.shortWeekRange}</p>
          </div>
          <div className="metric-grid">
            <MetricCard label="Workouts This Week" value={weeklySnapshot.workoutsThisWeek} />
            <MetricCard label="Sets This Week" value={weeklySnapshot.setsThisWeek} />
            <MetricCard label="Active Days" value={weeklySnapshot.activeDaysThisWeek} />
            <MetricCard label="Favorite Workout" value={profileIdentity.favoriteWorkout} accent />
          </div>
        </section>

        <section className="profile-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Workout Deep Dive</p>
              <h3>One Workout At A Time</h3>
            </div>
            <label className="workout-select">
              Workout
              <Dropdown
                value={selectedWorkoutName}
                onChange={setSelectedWorkoutName}
                options={workoutNames.map((name) => ({
                  value: name,
                  label: name,
                  color: getWorkoutColorByName(analyticsWorkouts, name),
                }))}
                ariaLabel="Profile workout selector"
              />
            </label>
          </div>

          {selectedWorkoutStats ? (
            <>
              <div className="metric-grid">
                <MetricCard label="Sessions Logged" value={selectedWorkoutStats.sessionsLogged} />
                <MetricCard label="Avg Sets / Session" value={selectedWorkoutStats.averageSetsPerSession} />
                <MetricCard label="Last Performed" value={selectedWorkoutStats.lastPerformed} />
                <MetricCard label={selectedWorkoutStats.bestMetricLabel} value={selectedWorkoutStats.bestMetricValue} accent />
              </div>

              <div className="trend-grid">
                <TrendCard
                  title={selectedWorkoutStats.performanceTrend.title}
                  subtitle={selectedWorkoutStats.performanceTrend.shortSubtitle || selectedWorkoutStats.performanceTrend.subtitle}
                >
                  <LineTrendChart points={selectedWorkoutStats.performanceTrend.points} />
                </TrendCard>
                <TrendCard
                  title="Set Volume Trend"
                  subtitle="Last 12 sessions"
                >
                  <BarTrendChart points={selectedWorkoutStats.setVolumeTrend} />
                </TrendCard>
                <TrendCard
                  title="Monthly Frequency"
                  subtitle="Recent months"
                >
                  <BarTrendChart points={selectedWorkoutStats.monthlyFrequency} />
                </TrendCard>
              </div>
            </>
          ) : (
            <p className="panel-empty">Select a workout to see trends and stats.</p>
          )}
        </section>

        <section className="profile-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Consistency</p>
              <h3>Consistency</h3>
            </div>
            <p className="panel-muted">26 weeks</p>
          </div>

          <div className="metric-grid">
            <MetricCard label="Current Streak" value={`${consistencyStats.currentStreak} day${consistencyStats.currentStreak === 1 ? "" : "s"}`} />
            <MetricCard label="Longest Streak" value={`${consistencyStats.longestStreak} day${consistencyStats.longestStreak === 1 ? "" : "s"}`} />
            <MetricCard label="Workout Days" value={consistencyStats.totalWorkoutDays} />
            <MetricCard label="Average / Week" value={consistencyStats.averageWorkoutDaysPerWeek} accent />
          </div>

          <div className="consistency-layout">
            <TrendCard title="Heatmap" subtitle="Daily training">
              <CalendarHeatmap weeks={consistencyStats.heatmapWeeks} />
            </TrendCard>
            <TrendCard title="Weekly Frequency" subtitle="Last 12 weeks">
              <BarTrendChart points={consistencyStats.weeklyFrequency} />
            </TrendCard>
          </div>
        </section>

        <a className="github-link" href="https://github.com/SethHales/MyStartup">GitHub</a>
          </>
        )}
      </div>
    </main>
  );
}

export function Account({ currentUser, setCurrentUser }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [workouts, setWorkouts] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [displayNameInput, setDisplayNameInput] = React.useState(currentUser?.name || "");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [accountStatus, setAccountStatus] = React.useState({ type: "", message: "" });
  const [isSavingAccount, setIsSavingAccount] = React.useState(false);

  React.useEffect(() => {
    setDisplayNameInput(currentUser?.name || "");
  }, [currentUser?.name]);

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
        setWorkouts(sortWorkoutsAscending(userWorkouts));
      })
      .catch((err) => {
        console.error('Error loading workouts:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const profileIdentity = React.useMemo(
    () => buildProfileIdentity(workouts, currentUser),
    [workouts, currentUser]
  );

  const searchParams = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isAccountModalOpen = searchParams.get("modal") === "account-settings";

  const openAccountModal = () => {
    const nextSearchParams = new URLSearchParams(location.search);
    nextSearchParams.set("modal", "account-settings");
    navigate(`${location.pathname}?${nextSearchParams.toString()}`);
  };

  const closeAccountModal = React.useCallback(() => {
    const nextSearchParams = new URLSearchParams(location.search);
    nextSearchParams.delete("modal");
    const nextSearch = nextSearchParams.toString();
    navigate(nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);

  React.useEffect(() => {
    if (!isAccountModalOpen) {
      return;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeAccountModal();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [closeAccountModal, isAccountModalOpen]);

  const handleAccountSubmit = async (event) => {
    event.preventDefault();

    setIsSavingAccount(true);
    setAccountStatus({ type: "", message: "" });

    try {
      const trimmedName = displayNameInput.trim();
      const shouldUpdateName = trimmedName && trimmedName !== (currentUser?.name || "");
      const shouldUpdatePassword = Boolean(currentPassword || newPassword || confirmPassword);

      if (!shouldUpdateName && !shouldUpdatePassword) {
        setAccountStatus({ type: "error", message: "Make a change before saving." });
        return;
      }

      if (shouldUpdateName) {
        const nameResponse = await fetch('/api/user/me', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: trimmedName }),
        });

        let nameBody = {};
        try {
          nameBody = await nameResponse.json();
        } catch (_err) {
          nameBody = {};
        }

        if (!nameResponse.ok) {
          setAccountStatus({ type: "error", message: nameBody.msg || "Couldn't update name." });
          return;
        }

        setCurrentUser((current) => current ? { ...current, name: nameBody.name || trimmedName } : current);
      }

      if (shouldUpdatePassword) {
        if (!currentPassword || !newPassword || !confirmPassword) {
          setAccountStatus({ type: "error", message: "Fill out all password fields to change your password." });
          return;
        }

        if (newPassword !== confirmPassword) {
          setAccountStatus({ type: "error", message: "New passwords do not match." });
          return;
        }

        const response = await fetch('/api/auth/password', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        });

        if (!response.ok) {
          let body = {};
          try {
            body = await response.json();
          } catch (_err) {
            body = {};
          }

          setAccountStatus({ type: "error", message: body.msg || "Couldn't update password." });
          return;
        }
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setAccountStatus({ type: "success", message: shouldUpdatePassword ? "Account updated." : "Name updated." });
    } catch (err) {
      console.error('Error updating account:', err);
      setAccountStatus({ type: "error", message: "Couldn't update account settings." });
    } finally {
      setIsSavingAccount(false);
    }
  };

  return (
    <main>
      <div className="main-formatting profile-layout">
        {isLoading ? (
          <section className="profile-loading-state" aria-live="polite">
            <div className="profile-loading-hero">
              <p className="profile-kicker">Account</p>
              <h2>Loading your profile...</h2>
              <p className="panel-muted">Gathering your account details.</p>
            </div>
            <div className="profile-loading-grid">
              <div className="profile-loading-card profile-loading-card-wide" />
              <div className="profile-loading-card" />
              <div className="profile-loading-card" />
            </div>
          </section>
        ) : (
          <>
            <section className="profile-hero">
              <div>
                <p className="profile-kicker">Account</p>
                <h2>{profileIdentity.displayName}</h2>
              </div>
              <div className="profile-meta-grid">
                <div className="profile-meta-card">
                  <span>Username</span>
                  <strong>{currentUser?.name || "Not set"}</strong>
                </div>
                <div className="profile-meta-card">
                  <span>Email</span>
                  <strong>{currentUser?.email || "Unknown"}</strong>
                </div>
                <div className="profile-meta-card">
                  <span>Member Since</span>
                  <strong>{profileIdentity.memberSince}</strong>
                </div>
              </div>
            </section>

            <section className="profile-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Profile</p>
                  <h3>Personal Information</h3>
                </div>
                <button type="button" className="btn btn-outline-light" onClick={openAccountModal}>
                  Edit account
                </button>
              </div>
              <div className="account-overview-grid">
                <div className="metric-card">
                  <span>Display name</span>
                  <strong>{currentUser?.name || "Not set"}</strong>
                </div>
                <div className="metric-card">
                  <span>Email</span>
                  <strong>{currentUser?.email || "Unknown"}</strong>
                </div>
                <div className="metric-card metric-card-accent">
                  <span>Favorite Workout</span>
                  <strong>{profileIdentity.favoriteWorkout}</strong>
                </div>
              </div>
            </section>

            <section className="profile-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Security</p>
                  <h3>Login & Password</h3>
                </div>
              </div>
              <p className="panel-muted">Manage your display name and password from one place.</p>
            </section>
          </>
        )}
      </div>

      {isAccountModalOpen && (
        <div className="password-modal-backdrop" role="presentation" onClick={closeAccountModal}>
          <div
            className="password-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="password-modal-header">
              <div>
                <p className="panel-kicker">Account</p>
                <h3 id="change-password-title">Account Settings</h3>
              </div>
              <button type="button" className="password-modal-close" onClick={closeAccountModal}>
                Close
              </button>
            </div>

            <form className="password-form" onSubmit={handleAccountSubmit}>
              <label className="password-field">
                Display name
                <input
                  type="text"
                  value={displayNameInput}
                  onChange={(event) => setDisplayNameInput(event.target.value)}
                  autoComplete="name"
                />
              </label>
              <div className="password-section-label">Change password</div>
              <label className="password-field">
                Current password
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <label className="password-field">
                New password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label className="password-field">
                Confirm new password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </label>
              {accountStatus.message && (
                <p className={accountStatus.type === "success" ? "password-status success" : "password-status error"}>
                  {accountStatus.message}
                </p>
              )}
              <div className="password-form-actions">
                <button type="button" className="btn btn-outline-light" onClick={closeAccountModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSavingAccount}>
                  {isSavingAccount ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function MetricCard({ label, value, accent = false }) {
  return (
    <div className={accent ? "metric-card metric-card-accent" : "metric-card"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TrendCard({ title, subtitle, children }) {
  return (
    <div className="trend-card">
      <div className="trend-card-header">
        <h4>{title}</h4>
        <p>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function DonutBreakdownChart({ segments, total, activeCategoryKey, onSelectCategory }) {
  if (!total) {
    return (
      <div className="breakdown-donut-empty">
        <div className="breakdown-donut-center">
          <strong>0</strong>
          <span>No workouts yet</span>
        </div>
      </div>
    );
  }

  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="breakdown-donut-wrap">
      <svg viewBox="0 0 220 220" className="breakdown-donut" role="img" aria-label="Workout breakdown donut chart">
        <circle className="breakdown-donut-track" cx="110" cy="110" r={radius} />
        {segments.map((segment) => {
          const segmentLength = (segment.count / total) * circumference;
          const dashArray = `${segmentLength} ${circumference - segmentLength}`;
          const dashOffset = -offset;
          offset += segmentLength;

            return (
              <circle
                key={segment.key}
                className={segment.key === activeCategoryKey ? `breakdown-donut-segment ${segment.segmentClass} is-active` : `breakdown-donut-segment ${segment.segmentClass}`}
                cx="110"
                cy="110"
                r={radius}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                style={segment.color ? { stroke: segment.color } : undefined}
                onClick={() => onSelectCategory(segment.key)}
                role="button"
                tabIndex={0}
              aria-label={`${segment.label}: ${segment.count} workouts`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectCategory(segment.key);
                }
              }}
            />
          );
        })}
      </svg>

      <div className="breakdown-donut-center">
        <strong>{total}</strong>
        <span>sessions</span>
      </div>
    </div>
  );
}

function LineTrendChart({ points }) {
  if (!points || points.length === 0) {
    return <p className="chart-empty">Not enough data yet.</p>;
  }

  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const width = 320;
  const height = 140;
  const padding = 14;
  const valueRange = maxValue - minValue || 1;

  const path = points.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
    const y = height - padding - ((point.value - minValue) / valueRange) * (height - padding * 2);
    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");

  return (
    <div className="line-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" role="img" aria-label="Workout trend line">
        <path d={path} className="line-chart-path" />
      </svg>
      <div className="chart-axis-labels">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}

function BarTrendChart({ points }) {
  if (!points || points.length === 0) {
    return <p className="chart-empty">Not enough data yet.</p>;
  }

  const maxValue = Math.max(...points.map((point) => point.value), 1);

  return (
    <div className="bar-chart">
      {points.map((point) => (
        <div key={point.label} className="bar-chart-column">
          <span className="bar-chart-value">{point.value}</span>
          <div className="bar-chart-track">
            <div
              className="bar-chart-fill"
              style={{ height: `${(point.value / maxValue) * 100}%` }}
            />
          </div>
          <span className="bar-chart-label">{point.label}</span>
        </div>
      ))}
    </div>
  );
}

function CalendarHeatmap({ weeks }) {
  return (
    <div className="heatmap">
      <div className="heatmap-days">
        {weekdayLabels.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="heatmap-weeks">
        {weeks.map((week) => (
          <div key={week.key} className="heatmap-week">
            {week.days.map((day) => (
              <div
                key={day.date}
                className={`heatmap-cell intensity-${day.intensity}`}
                title={`${day.date}: ${day.count} workout${day.count === 1 ? "" : "s"}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildProfileIdentity(workouts, currentUser) {
  const favoriteWorkout = getMostUsedWorkoutName(workouts);
  const firstWorkout = workouts[0];
  const lastWorkout = workouts[workouts.length - 1];
  const displayName = currentUser?.name || currentUser?.email || "QuickSets Athlete";

  return {
    displayName,
    summary: `${workouts.length} workouts logged.`,
    memberSince: firstWorkout ? formatMonthYear(firstWorkout.date) : "No workouts yet",
    lastWorkout: lastWorkout ? formatReadableDate(lastWorkout.date) : "No workouts yet",
    favoriteWorkout,
  };
}

function expandAnalyticsWorkouts(workouts) {
  return workouts.flatMap((workout) => {
    if (!workout?.isMixed || !Array.isArray(workout.sets)) {
      return [workout];
    }

    const groupedSets = new Map();
    workout.sets.forEach((set, index) => {
      const key = set.templateId || set.templateName || `mixed-${index}`;
      const existing = groupedSets.get(key) || {
        ...workout,
        id: `${workout.id}-${key}`,
        templateId: set.templateId || workout.templateId,
        templateName: set.templateName || workout.templateName,
        exercise: set.templateName || workout.exercise,
        fields: set.fields || {},
        measurements: set.measurements || workout.measurements,
        sets: [],
      };

      existing.sets.push({
        ...set,
        id: existing.sets.length + 1,
      });
      groupedSets.set(key, existing);
    });

    return Array.from(groupedSets.values());
  });
}

function buildWeeklySnapshot(workouts, uniqueWorkoutDays) {
  const today = stripTime(new Date());
  const weekStart = getWeekStart(today);
  const weekEnd = addDays(weekStart, 6);
  const weekWorkouts = workouts.filter((workout) => {
    const workoutDate = parseLocalDate(workout.date);
    return workoutDate >= weekStart && workoutDate <= weekEnd;
  });

  return {
    workoutsThisWeek: weekWorkouts.length,
    setsThisWeek: weekWorkouts.reduce((count, workout) => count + (workout.sets?.length || 0), 0),
    activeDaysThisWeek: uniqueWorkoutDays.filter((date) => {
      const workoutDate = parseLocalDate(date);
      return workoutDate >= weekStart && workoutDate <= weekEnd;
    }).length,
    weekRange: `${formatReadableDate(formatDateValue(weekStart))} to ${formatReadableDate(formatDateValue(weekEnd))}`,
    shortWeekRange: `${formatShortMonthDay(weekStart)}-${formatShortMonthDay(weekEnd)}`,
  };
}

function buildWorkoutBreakdown(workouts, selectedCategoryKey) {
  const totalWorkouts = workouts.length;
  const workoutPalette = [
    "#4da3ff",
    "#27d7c3",
    "#ffba49",
    "#ff7a67",
    "#c084fc",
    "#7dd3fc",
    "#a3e635",
    "#fb7185",
    "#f59e0b",
    "#22c55e",
  ];
  const categoryMeta = [
    {
      key: "strength",
      label: "Strength",
      description: "Weight or reps-driven workouts.",
      swatchClass: "is-strength",
      segmentClass: "is-strength",
    },
    {
      key: "strength-duration",
      label: "Strength Duration",
      description: "Timed holds or weighted efforts over time.",
      swatchClass: "is-strength-duration",
      segmentClass: "is-strength-duration",
    },
    {
      key: "cardio",
      label: "Cardio",
      description: "Distance-focused movement and endurance sessions.",
      swatchClass: "is-cardio",
      segmentClass: "is-cardio",
    },
    {
      key: "mixed",
      label: "Mixed",
      description: "Workouts blending strength and cardio signals.",
      swatchClass: "is-mixed",
      segmentClass: "is-mixed",
    },
    {
      key: "other",
      label: "Other",
      description: "Anything that does not fit the main buckets.",
      swatchClass: "is-other",
      segmentClass: "is-other",
    },
  ];

  const counts = new Map(categoryMeta.map((category) => [category.key, 0]));
  const workoutsByCategory = new Map(categoryMeta.map((category) => [category.key, []]));

  workouts.forEach((workout) => {
    const categoryKey = classifyWorkout(workout);
    counts.set(categoryKey, (counts.get(categoryKey) || 0) + 1);
    workoutsByCategory.get(categoryKey)?.push(workout);
  });

  const categories = categoryMeta
    .map((category) => ({
      ...category,
      count: counts.get(category.key) || 0,
      percentage: totalWorkouts ? Math.round(((counts.get(category.key) || 0) / totalWorkouts) * 100) : 0,
    }))
    .filter((category) => category.count > 0);

  const sortedCategories = [...categories].sort((left, right) => right.count - left.count);
  const topCategoryShare = totalWorkouts ? (sortedCategories[0]?.count || 0) / totalWorkouts : 0;
  const meaningfulCategories = categories.filter((category) => {
    if (!totalWorkouts) {
      return false;
    }

    return category.count / totalWorkouts >= 0.1;
  }).length;
  const shouldShowWorkoutSplit = categories.length <= 1 || topCategoryShare >= 0.8 || meaningfulCategories < 2;
  const breakdownMode = shouldShowWorkoutSplit ? "workouts" : "categories";

  const workoutSummaryMap = new Map();
  workouts.forEach((workout) => {
    const name = workout.templateName || workout.exercise;
    if (!name) {
      return;
    }

    const existing = workoutSummaryMap.get(name) || {
      key: `workout-${name}`,
      label: name,
      name,
      count: 0,
      categoryKey: classifyWorkout(workout),
      color: getWorkoutColor(workout),
    };
    existing.count += 1;
    workoutSummaryMap.set(name, existing);
  });

  const workoutSegments = Array.from(workoutSummaryMap.values())
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .map((segment, index) => ({
      ...segment,
      percentage: totalWorkouts ? Math.round((segment.count / totalWorkouts) * 100) : 0,
      swatchClass: "is-custom",
      segmentClass: "is-custom",
      color: segment.color || workoutPalette[index % workoutPalette.length],
    }));

  const segments = breakdownMode === "workouts" ? workoutSegments : categories;
  const selectedSegment = segments.find((segment) => segment.key === selectedCategoryKey);
  const activeSegmentKey = selectedSegment ? selectedSegment.key : "all";

  let filteredWorkouts = workouts;
  if (activeSegmentKey !== "all") {
    filteredWorkouts = breakdownMode === "workouts"
      ? workouts.filter((workout) => (workout.templateName || workout.exercise) === selectedSegment?.name)
      : workoutsByCategory.get(activeSegmentKey) || [];
  }

  const workoutCounts = new Map();
  filteredWorkouts.forEach((workout) => {
    const name = workout.templateName || workout.exercise;
    if (!name) {
      return;
    }

    workoutCounts.set(name, (workoutCounts.get(name) || 0) + 1);
  });

  const topWorkouts = Array.from(workoutCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([name, count], index) => ({
      name,
      count,
      rank: index + 1,
      share: filteredWorkouts.length ? Math.round((count / filteredWorkouts.length) * 100) : 0,
      color: getWorkoutColorByName(filteredWorkouts, name),
    }));

  return {
    mode: breakdownMode,
    totalWorkouts,
    categories: segments,
    activeCategoryKey: activeSegmentKey,
    activeCategoryLabel: selectedSegment
      ? selectedSegment.label
      : breakdownMode === "workouts"
        ? "Workout Split"
        : "All Workouts",
    activeCategoryDescription: selectedSegment
      ? breakdownMode === "workouts"
        ? `${selectedSegment.count} sessions of ${selectedSegment.label}.`
        : selectedSegment.description
      : breakdownMode === "workouts"
        ? "One workout type dominates, so this view drills into your specific workouts."
        : "Your most-performed workouts across every category.",
    topWorkouts,
  };
}

function getCategoryStyleClass(categoryKey) {
  switch (categoryKey) {
    case "strength":
      return "is-strength";
    case "strength-duration":
      return "is-strength-duration";
    case "cardio":
      return "is-cardio";
    case "mixed":
      return "is-mixed";
    default:
      return "is-other";
  }
}

function getWorkoutColorByName(workouts, workoutName) {
  const matchedWorkout = workouts.find((workout) => (workout.templateName || workout.exercise) === workoutName);
  return matchedWorkout ? getWorkoutColor(matchedWorkout) : getWorkoutColor(workoutName);
}

function buildConsistencyStats(workouts, uniqueWorkoutDays, dayCountMap) {
  const today = stripTime(new Date());
  const heatmapStart = addDays(today, -181);
  const heatmapStartMonday = getWeekStart(heatmapStart);
  const heatmapWeeks = [];
  let currentWeekStart = new Date(heatmapStartMonday);

  while (currentWeekStart <= today) {
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const currentDay = addDays(currentWeekStart, index);
      const dateKey = formatDateValue(currentDay);
      const count = dayCountMap.get(dateKey) || 0;

      return {
        date: dateKey,
        count,
        intensity: getHeatIntensity(count),
      };
    });

    heatmapWeeks.push({
      key: formatDateValue(currentWeekStart),
      days: weekDays,
    });

    currentWeekStart = addDays(currentWeekStart, 7);
  }

  const weeklyFrequency = buildWeeklyFrequency(uniqueWorkoutDays);

  return {
    currentStreak: getCurrentStreak(uniqueWorkoutDays),
    longestStreak: getLongestStreak(uniqueWorkoutDays),
    totalWorkoutDays: uniqueWorkoutDays.length,
    averageWorkoutDaysPerWeek: (uniqueWorkoutDays.length / Math.max(getWeekSpan(uniqueWorkoutDays), 1)).toFixed(1),
    heatmapWeeks,
    weeklyFrequency,
  };
}

function buildSelectedWorkoutStats(workouts, selectedWorkoutName) {
  if (!selectedWorkoutName) {
    return null;
  }

  const selectedWorkouts = workouts.filter(
    (workout) => (workout.templateName || workout.exercise) === selectedWorkoutName
  );

  if (selectedWorkouts.length === 0) {
    return null;
  }

  const representativeWorkout = selectedWorkouts[selectedWorkouts.length - 1];
  const fields = representativeWorkout.fields || {};
  const measurements = normalizeMeasurements(representativeWorkout.measurements);
  const sessionsLogged = selectedWorkouts.length;
  const averageSetsPerSession = (
    selectedWorkouts.reduce((sum, workout) => sum + (workout.sets?.length || 0), 0) / sessionsLogged
  ).toFixed(1);
  const lastPerformed = formatReadableDate(selectedWorkouts[selectedWorkouts.length - 1].date);
  const bestMetric = getBestMetric(selectedWorkouts, fields, measurements);

  return {
    sessionsLogged,
    averageSetsPerSession,
    lastPerformed,
    bestMetricLabel: bestMetric.label,
    bestMetricValue: bestMetric.value,
    performanceTrend: buildPerformanceTrend(selectedWorkouts, fields, measurements),
    setVolumeTrend: selectedWorkouts.slice(-12).map((workout, index) => ({
      label: `S${index + 1}`,
      value: workout.sets?.length || 0,
    })),
    monthlyFrequency: buildMonthlyFrequency(selectedWorkouts),
  };
}

function classifyWorkout(workout) {
  const fields = workout.fields || {};
  const hasWeight = Boolean(fields.weight);
  const hasReps = Boolean(fields.reps);
  const hasDistance = Boolean(fields.distance);
  const hasDuration = Boolean(fields.duration);

  if (hasDistance && (hasWeight || hasReps)) {
    return "mixed";
  }

  if (hasDistance) {
    return "cardio";
  }

  if (hasDuration && (hasWeight || hasReps)) {
    return "strength-duration";
  }

  if (hasWeight || hasReps) {
    return "strength";
  }

  if (hasDuration) {
    return "strength-duration";
  }

  return "other";
}

function getBestMetric(workouts, fields, measurements) {
  if (fields.weight) {
    const bestWeight = Math.max(...workouts.flatMap((workout) => (workout.sets || []).map((set) => Number(set.weight) || 0)));
    return { label: "Best Weight", value: `${bestWeight || 0} ${formatMeasurementUnit(measurements.weight, "LBs")}` };
  }

  if (fields.distance && fields.duration) {
    const paceValues = workouts.flatMap((workout) => (workout.sets || []).map((set) => {
      const durationSeconds = parseDurationToSeconds(set.duration);
      const distance = Number(set.distance);
      if (!durationSeconds || !distance) {
        return null;
      }
      return durationSeconds / distance;
    }).filter(Boolean));
    const bestPace = paceValues.length > 0 ? Math.min(...paceValues) : 0;
    return { label: "Best Pace", value: formatPace(bestPace, measurements.distance) };
  }

  if (fields.distance) {
    const bestDistance = Math.max(...workouts.flatMap((workout) => (workout.sets || []).map((set) => Number(set.distance) || 0)));
    return { label: "Best Distance", value: `${bestDistance.toFixed(1)} ${formatMeasurementUnit(measurements.distance, "Miles")}` };
  }

  if (fields.duration) {
    const bestDuration = Math.min(...workouts.flatMap((workout) => (workout.sets || []).map((set) => parseDurationToSeconds(set.duration) || Number.MAX_SAFE_INTEGER)));
    return { label: "Best Duration", value: bestDuration === Number.MAX_SAFE_INTEGER ? "N/A" : formatSeconds(bestDuration) };
  }

  return { label: "Sessions", value: String(workouts.length) };
}

function buildPerformanceTrend(workouts, fields, measurements) {
  const recentWorkouts = workouts.slice(-12);

  if (fields.weight) {
    return {
      title: "Top Weight Trend",
      subtitle: "Best set from each recent session",
      shortSubtitle: "Best set",
      points: recentWorkouts.map((workout) => ({
        label: shortDateLabel(workout.date),
        value: Math.max(...(workout.sets || []).map((set) => Number(set.weight) || 0), 0),
      })),
    };
  }

  if (fields.distance && fields.duration) {
    return {
      title: "Pace Trend",
      subtitle: `Lower ${formatMeasurementUnit(measurements.distance, "Miles")} pace is better`,
      shortSubtitle: "Lower is better",
      points: recentWorkouts.map((workout) => ({
        label: shortDateLabel(workout.date),
        value: getWorkoutBestPace(workout),
      })).filter((point) => point.value > 0),
    };
  }

  if (fields.distance) {
    return {
      title: "Distance Trend",
      subtitle: "Longest distance per recent session",
      shortSubtitle: "Longest set",
      points: recentWorkouts.map((workout) => ({
        label: shortDateLabel(workout.date),
        value: Math.max(...(workout.sets || []).map((set) => Number(set.distance) || 0), 0),
      })),
    };
  }

  if (fields.duration) {
    return {
      title: "Duration Trend",
      subtitle: "Best time from recent sessions",
      shortSubtitle: "Best time",
      points: recentWorkouts.map((workout) => ({
        label: shortDateLabel(workout.date),
        value: Math.min(...(workout.sets || []).map((set) => parseDurationToSeconds(set.duration) || Number.MAX_SAFE_INTEGER)),
      })).filter((point) => point.value < Number.MAX_SAFE_INTEGER),
    };
  }

  return {
    title: "Session Trend",
    subtitle: "Workout frequency over time",
    points: [],
  };
}

function buildMonthlyFrequency(workouts) {
  const groups = new Map();

  workouts.forEach((workout) => {
    const date = parseLocalDate(workout.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleString("en-US", { month: "short" });
    const existing = groups.get(key) || { label, value: 0 };
    existing.value += 1;
    groups.set(key, existing);
  });

  return Array.from(groups.values()).slice(-6);
}

function buildWeeklyFrequency(uniqueWorkoutDays) {
  const today = stripTime(new Date());
  const currentWeekStart = getWeekStart(today);
  const weeklyPoints = [];

  for (let index = 11; index >= 0; index -= 1) {
    const weekStart = addDays(currentWeekStart, -index * 7);
    const weekEnd = addDays(weekStart, 6);
    const count = uniqueWorkoutDays.filter((date) => {
      const workoutDate = parseLocalDate(date);
      return workoutDate >= weekStart && workoutDate <= weekEnd;
    }).length;

    weeklyPoints.push({
      label: `${weekStart.toLocaleString("en-US", { month: "short" })} ${weekStart.getDate()}`,
      value: count,
    });
  }

  return weeklyPoints;
}

function getWorkoutNames(workouts) {
  return Array.from(new Set(workouts.map((workout) => workout.templateName || workout.exercise).filter(Boolean))).sort();
}

function getMostUsedWorkoutName(workouts) {
  const counts = new Map();

  workouts.forEach((workout) => {
    const name = workout.templateName || workout.exercise;
    if (!name) {
      return;
    }

    counts.set(name, (counts.get(name) || 0) + 1);
  });

  let bestName = "None yet";
  let bestCount = 0;

  counts.forEach((count, name) => {
    if (count > bestCount) {
      bestCount = count;
      bestName = name;
    }
  });

  return bestName;
}

function getUniqueWorkoutDays(workouts) {
  return Array.from(new Set(workouts.map((workout) => workout.date))).sort();
}

function getWorkoutDayCountMap(workouts) {
  const map = new Map();

  workouts.forEach((workout) => {
    map.set(workout.date, (map.get(workout.date) || 0) + 1);
  });

  return map;
}

function getCurrentStreak(uniqueWorkoutDays) {
  if (uniqueWorkoutDays.length === 0) {
    return 0;
  }

  let streak = 1;

  for (let index = uniqueWorkoutDays.length - 1; index > 0; index -= 1) {
    const current = parseLocalDate(uniqueWorkoutDays[index]);
    const previous = parseLocalDate(uniqueWorkoutDays[index - 1]);
    const difference = Math.round((current - previous) / (1000 * 60 * 60 * 24));

    if (difference === 1) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function getLongestStreak(uniqueWorkoutDays) {
  if (uniqueWorkoutDays.length === 0) {
    return 0;
  }

  let best = 1;
  let current = 1;

  for (let index = 1; index < uniqueWorkoutDays.length; index += 1) {
    const previous = parseLocalDate(uniqueWorkoutDays[index - 1]);
    const next = parseLocalDate(uniqueWorkoutDays[index]);
    const difference = Math.round((next - previous) / (1000 * 60 * 60 * 24));

    if (difference === 1) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }

  return best;
}

function getWeekSpan(uniqueWorkoutDays) {
  if (uniqueWorkoutDays.length === 0) {
    return 1;
  }

  const first = parseLocalDate(uniqueWorkoutDays[0]);
  const last = parseLocalDate(uniqueWorkoutDays[uniqueWorkoutDays.length - 1]);
  return Math.max(Math.ceil((last - first) / (1000 * 60 * 60 * 24 * 7)), 1);
}

function getWorkoutBestPace(workout) {
  const paces = (workout.sets || []).map((set) => {
    const distance = Number(set.distance);
    const durationSeconds = parseDurationToSeconds(set.duration);
    if (!distance || !durationSeconds) {
      return 0;
    }

    return durationSeconds / distance;
  }).filter(Boolean);

  return paces.length > 0 ? Math.min(...paces) : 0;
}

function getHeatIntensity(count) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

function sortWorkoutsAscending(workouts) {
  return [...workouts].sort((left, right) => parseLocalDate(left.date) - parseLocalDate(right.date));
}

function parseLocalDate(dateValue) {
  return new Date(`${dateValue}T00:00:00`);
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getWeekStart(date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function formatReadableDate(dateValue) {
  return parseLocalDate(dateValue).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonthYear(dateValue) {
  return parseLocalDate(dateValue).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatShortMonthDay(date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function shortDateLabel(dateValue) {
  return parseLocalDate(dateValue).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDurationToSeconds(duration) {
  if (!duration) {
    return 0;
  }

  const parts = `${duration}`.split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return 0;
}

function formatPace(secondsPerUnit, distanceMeasurement = 'miles') {
  if (!secondsPerUnit || !Number.isFinite(secondsPerUnit)) {
    return "N/A";
  }

  const minutes = Math.floor(secondsPerUnit / 60);
  const seconds = Math.round(secondsPerUnit % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")} / ${formatMeasurementUnit(distanceMeasurement, "Miles")}`;
}

function formatSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizeMeasurements(measurements) {
  return {
    weight: measurements?.weight || 'lbs',
    distance: measurements?.distance || 'miles',
  };
}

function formatMeasurementUnit(value, fallback) {
  switch (value) {
    case 'kgs':
      return 'kg';
    case 'kms':
      return 'km';
    case 'meters':
      return 'm';
    case 'feet':
      return 'ft';
    case 'miles':
      return 'mi';
    case 'lbs':
      return 'lbs';
    default:
      return fallback;
  }
}
