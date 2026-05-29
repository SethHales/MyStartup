# QuickSets Terminology

Use this terminology consistently in user-facing copy:

- **Workout** means a full training session. A workout often includes multiple exercises, takes roughly an hour, and may be represented in the app by the full/mixed workout flow.
- **Exercise** means a specific movement or activity, such as Bench Press, Shoulder Press, Bicep Curl, Dips, Pushups, or Pullups. The app's existing "workout template" data model is user-facing as an exercise.
- **Session** means one logged instance of an exercise. For example: "12 sessions of Bench Press last month" or "view stats for this Bench Press session."
- **Set** means one row inside an exercise session, such as `155 lbs x 8 reps`.

Implementation notes:

- Keep existing API routes, database collections, and data keys such as `/api/workouts`, `workoutCollection`, `workoutTemplateCollection`, and `templateName` unless there is an explicit migration plan. Those names are legacy/internal compatibility details.
- Prefer changing labels, helper text, alerts, headings, and AI prompts rather than renaming persisted fields.
- Use **Full Workout** for the mixed-workout option when the user is logging multiple exercises together.
- Use **Exercise Explorer** in analytics for the per-exercise stats area.
