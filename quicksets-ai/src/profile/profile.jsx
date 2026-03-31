import React from 'react';
import "./profile.css";
import { Dropdown } from "../components/dropdown";
import { useLocation, useNavigate } from 'react-router-dom';

const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];

export function Profile({ currentUser }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [workouts, setWorkouts] = React.useState([]);
  const [selectedWorkoutName, setSelectedWorkoutName] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordStatus, setPasswordStatus] = React.useState({ type: "", message: "" });
  const [isSavingPassword, setIsSavingPassword] = React.useState(false);

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
      });
  }, []);

  const searchParams = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isPasswordModalOpen = searchParams.get("modal") === "change-password";

  const openPasswordModal = () => {
    const nextSearchParams = new URLSearchParams(location.search);
    nextSearchParams.set("modal", "change-password");
    navigate(`${location.pathname}?${nextSearchParams.toString()}`);
  };

  const closePasswordModal = React.useCallback(() => {
    const nextSearchParams = new URLSearchParams(location.search);
    nextSearchParams.delete("modal");
    const nextSearch = nextSearchParams.toString();
    navigate(nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);

  React.useEffect(() => {
    if (!isPasswordModalOpen) {
      return;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closePasswordModal();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [closePasswordModal, isPasswordModalOpen]);

  const workoutNames = React.useMemo(() => getWorkoutNames(workouts), [workouts]);
  const uniqueWorkoutDays = React.useMemo(() => getUniqueWorkoutDays(workouts), [workouts]);
  const dayCountMap = React.useMemo(() => getWorkoutDayCountMap(workouts), [workouts]);

  const profileIdentity = React.useMemo(
    () => buildProfileIdentity(workouts, currentUser),
    [workouts, currentUser]
  );

  const weeklySnapshot = React.useMemo(
    () => buildWeeklySnapshot(workouts, uniqueWorkoutDays),
    [workouts, uniqueWorkoutDays]
  );

  const consistencyStats = React.useMemo(
    () => buildConsistencyStats(workouts, uniqueWorkoutDays, dayCountMap),
    [workouts, uniqueWorkoutDays, dayCountMap]
  );

  const selectedWorkoutStats = React.useMemo(
    () => buildSelectedWorkoutStats(workouts, selectedWorkoutName),
    [workouts, selectedWorkoutName]
  );

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordStatus({ type: "error", message: "Fill out all password fields." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", message: "New passwords do not match." });
      return;
    }

    setIsSavingPassword(true);
    setPasswordStatus({ type: "", message: "" });

    try {
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

        setPasswordStatus({ type: "error", message: body.msg || "Couldn't update password." });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus({ type: "success", message: "Password updated." });
    } catch (err) {
      console.error('Error updating password:', err);
      setPasswordStatus({ type: "error", message: "Couldn't update password." });
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <main>
      <div className="main-formatting profile-layout">
        <section className="profile-hero">
          <div>
            <p className="profile-kicker">Profile</p>
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
              <p className="panel-kicker">Workout Breakdown</p>
              <h3>One Workout At A Time</h3>
            </div>
            <label className="workout-select">
              Workout
              <Dropdown
                value={selectedWorkoutName}
                onChange={setSelectedWorkoutName}
                options={workoutNames.map((name) => ({ value: name, label: name }))}
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

        <section className="profile-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Security</p>
              <h3>Password</h3>
            </div>
            <button type="button" className="btn btn-outline-light" onClick={openPasswordModal}>
              Change Password
            </button>
          </div>
          <p className="panel-muted">Open a quick modal to update your password.</p>
        </section>

        <a className="github-link" href="https://github.com/SethHales/MyStartup">GitHub</a>
      </div>

      {isPasswordModalOpen && (
        <div className="password-modal-backdrop" role="presentation" onClick={closePasswordModal}>
          <div
            className="password-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="password-modal-header">
              <div>
                <p className="panel-kicker">Security</p>
                <h3 id="change-password-title">Change Password</h3>
              </div>
              <button type="button" className="password-modal-close" onClick={closePasswordModal}>
                Close
              </button>
            </div>

            <form className="password-form" onSubmit={handlePasswordSubmit}>
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
              {passwordStatus.message && (
                <p className={passwordStatus.type === "success" ? "password-status success" : "password-status error"}>
                  {passwordStatus.message}
                </p>
              )}
              <div className="password-form-actions">
                <button type="button" className="btn btn-outline-light" onClick={closePasswordModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSavingPassword}>
                  {isSavingPassword ? "Saving..." : "Update Password"}
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
  const displayName = currentUser?.email || "QuickSets Athlete";

  return {
    displayName,
    summary: `${workouts.length} workouts logged.`,
    memberSince: firstWorkout ? formatMonthYear(firstWorkout.date) : "No workouts yet",
    lastWorkout: lastWorkout ? formatReadableDate(lastWorkout.date) : "No workouts yet",
    favoriteWorkout,
  };
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
