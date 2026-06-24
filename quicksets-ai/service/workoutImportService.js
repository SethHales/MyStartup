function createWorkoutImportService({
  workoutTemplateCollection,
  workoutCollection,
  uuid,
  openAiImportModel,
  openAiApiKey,
  importSourceCharacterLimit,
  importNotesCharacterLimit,
  importDuplicateContextCount,
  sanitizeFields,
  sanitizeMeasurements,
  sanitizeSetType,
  sanitizeSet,
  inferFieldsFromSets,
  normalizeStoredWorkoutColor,
  getFallbackWorkoutColor,
  generateUniqueWorkoutColor,
  existingTemplateColors,
}) {
  async function extractWorkoutImportSource(body) {
    const pastedText = `${body?.pastedText ?? ''}`.trim();
    const fileName = `${body?.fileName ?? ''}`.trim();
    const fileMimeType = `${body?.fileMimeType ?? ''}`.trim();
    const encodedFile = typeof body?.fileContent === 'string' ? body.fileContent : '';
    const hasFile = Boolean(fileName && encodedFile);

    if (!pastedText && !hasFile) {
      throw createHttpError(400, 'Attach a file or paste session text before importing');
    }

    const parts = [];
    const warnings = [];

    if (hasFile) {
      const fileText = await parseWorkoutImportFile({
        fileName,
        fileMimeType,
        encodedFile,
      });

      if (fileText) {
        parts.push(`File: ${fileName}\n${fileText}`);
      }
    }

    if (pastedText) {
      parts.push(`Pasted text:\n${pastedText}`);
    }

    const combinedText = parts.join('\n\n---\n\n').trim();
    const truncatedText = combinedText.length > importSourceCharacterLimit
      ? combinedText.slice(0, importSourceCharacterLimit)
      : combinedText;

    if (combinedText.length > importSourceCharacterLimit) {
      warnings.push(`Import source was truncated to ${importSourceCharacterLimit.toLocaleString()} characters before sending to AI.`);
    }

    return {
      fileName,
      fileMimeType,
      text: truncatedText,
      warnings,
    };
  }

  async function parseWorkoutImportFile({ fileName, fileMimeType, encodedFile }) {
    const extension = fileName.toLowerCase().split('.').pop();
    const buffer = Buffer.from(encodedFile, 'base64');

    if (extension === 'csv' || extension === 'txt' || fileMimeType.startsWith('text/')) {
      return buffer.toString('utf8');
    }

    if (extension === 'xlsx' || fileMimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      let xlsx;
      try {
        xlsx = require('xlsx');
      } catch (_err) {
        throw createHttpError(500, 'Excel import support is not installed on the service yet. Run npm install in quicksets-ai/service.');
      }

      const workbook = xlsx.read(buffer, { type: 'buffer' });
      return workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
        const renderedRows = rows
          .map((row) => Array.isArray(row) ? row.map((cell) => `${cell ?? ''}`).join('\t').trimEnd() : '')
          .filter(Boolean)
          .join('\n');
        return `Sheet: ${sheetName}\n${renderedRows}`;
      }).join('\n\n');
    }

    throw createHttpError(400, 'That file type is not supported yet. Use .csv, .xlsx, or pasted text.');
  }

  async function buildWorkoutImportDuplicateContext(userEmail) {
    const [templates, workouts] = await Promise.all([
      workoutTemplateCollection.find({ userEmail }).toArray(),
      workoutCollection.find({ userEmail }).toArray(),
    ]);

    const recentWorkouts = [...workouts]
      .sort(sortWorkoutsForImportContext)
      .slice(0, importDuplicateContextCount)
      .map((workout) => ({
        date: workout.date,
        templateName: workout.templateName || workout.exercise,
        notes: workout.notes || '',
        setCount: Array.isArray(workout.sets) ? workout.sets.length : 0,
        sets: Array.isArray(workout.sets)
          ? workout.sets.map((set) => ({
            setType: sanitizeSetType(set?.setType),
            reps: `${set?.reps ?? ''}`,
            weight: `${set?.weight ?? ''}`,
            duration: `${set?.duration ?? ''}`,
            distance: `${set?.distance ?? ''}`,
          }))
          : [],
      }));

    return {
      templates: templates
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((template) => ({
          name: template.name,
          fields: sanitizeFields(template.fields),
          measurements: sanitizeMeasurements(template.measurements),
        })),
      recentWorkouts,
    };
  }

  async function generateWorkoutImportPreview({ importSource, duplicateContext, notes }) {
    const client = getOpenAiClient();
    const trimmedNotes = `${notes ?? ''}`.trim().slice(0, importNotesCharacterLimit);
    const templateExamples = buildWorkoutTemplateImportExamples();
    const workoutExamples = buildWorkoutImportExamples();
    const response = await client.responses.create({
      model: openAiImportModel,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'You convert training logs into structured QuickSets exercise sessions.',
                'Return only valid JSON that matches the provided schema exactly.',
                'The top-level response must contain exactly four keys: templates, workouts, skipped, and warnings.',
                'templates must contain exercise template objects only.',
                'workouts must contain exercise session objects only. The key is named workouts for schema compatibility.',
                'skipped must contain skipped source items only, each with sourceReference and reason.',
                'warnings must contain plain strings only.',
                'Do not put skipped or uncertain sessions into workouts.',
                'Only return sessions that are new, meaning they are not obvious duplicates of sessions that have already been logged.',
                'Only return sessions that have enough detail to save confidently.',
                'Skip entries that are missing a date, missing an exercise name, or missing usable set detail.',
                'If a session already exists in the provided history, put it in skipped instead of workouts.',
                'Match existing exercise templates by name whenever possible.',
                'If a needed template does not exist, include it in templates.',
                'Do not return full/mixed workouts. If a source log combines multiple exercises on one day, split them into separate session objects by exercise.',
                'Use 00:MM or HH:MM:SS style durations when needed.',
                'Each object in workouts should represent one exercise session on one date.',
                'Each set object must always include setType, reps, weight, duration, and distance, using empty strings for fields that do not apply.',
                'Follow the example exercise template objects and exercise session objects closely.',
                'People track workouts differently. Sometimes they log by day instead of by exercise, but you should still output one exercise session per exercise.',
                'Some logs may require returning hundreds of sessions, and that is okay.',
                'Be decisive and structured. Prefer a confident skip over inventing missing data.',
              ].join(' '),
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'Return shape requirements:',
                '1. templates: an array of exercise template objects to create or match.',
                '2. workouts: an array of importable exercise session objects only.',
                '3. skipped: an array of skipped items only, each with sourceReference and reason.',
                '4. warnings: an array of plain warning strings.',
                'Never mix these categories together.',
                'Never put explanatory prose outside those arrays.',
                '',
                'Exercise template object requirements:',
                '- name',
                '- fields with boolean reps, weight, duration, distance',
                '- measurements with weight and distance units',
                '',
                'Exercise session object requirements:',
                '- date in YYYY-MM-DD',
                '- templateName',
                '- notes string',
                '- sets array',
                '- every set must include setType, reps, weight, duration, distance',
                '- use empty strings for fields that do not apply',
                '',
                'Skipped object requirements:',
                '- sourceReference should identify the skipped source item as clearly as possible',
                '- reason should explain exactly why it was skipped',
                '',
                'Current exercise templates:',
                JSON.stringify(duplicateContext.templates),
                '',
                'Example QuickSets exercise templates:',
                JSON.stringify(templateExamples),
                '',
                'Five examples of correctly structured QuickSets exercise session objects:',
                JSON.stringify(workoutExamples),
                '',
                `Last ${duplicateContext.recentWorkouts.length} sessions for duplicate checking:`,
                JSON.stringify(duplicateContext.recentWorkouts),
                '',
                trimmedNotes ? `Additional notes from the user:\n${trimmedNotes}\n` : '',
                'Import source:',
                importSource.text,
              ].join('\n'),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'quicksets_import_preview',
          strict: true,
          schema: getWorkoutImportPreviewSchema(),
        },
      },
    });

    const parsedPreview = JSON.parse(extractOpenAiTextResponse(response) || '{}');
    const normalizedPreview = sanitizeWorkoutImportPreviewPayload(parsedPreview);

    return {
      ...normalizedPreview,
      warnings: [
        ...importSource.warnings,
        ...normalizedPreview.warnings,
      ],
    };
  }

  function getOpenAiClient() {
    if (!openAiApiKey) {
      throw createHttpError(503, 'Set OPENAI_API_KEY on the service before importing sessions.');
    }

    let OpenAI;
    try {
      OpenAI = require('openai');
    } catch (_err) {
      throw createHttpError(500, 'OpenAI support is not installed on the service yet. Run npm install in quicksets-ai/service.');
    }

    return new OpenAI({
      apiKey: openAiApiKey,
    });
  }

  function extractOpenAiTextResponse(response) {
    if (typeof response?.output_text === 'string' && response.output_text) {
      return response.output_text;
    }

    const textContent = Array.isArray(response?.output)
      ? response.output
        .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
        .find((part) => typeof part?.text === 'string')
      : null;

    return textContent?.text || '';
  }

  function getWorkoutImportPreviewSchema() {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        templates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              fields: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  reps: { type: 'boolean' },
                  weight: { type: 'boolean' },
                  duration: { type: 'boolean' },
                  distance: { type: 'boolean' },
                },
                required: ['reps', 'weight', 'duration', 'distance'],
              },
              measurements: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  weight: { type: 'string', enum: ['lbs', 'kgs'] },
                  distance: { type: 'string', enum: ['miles', 'kms', 'meters', 'feet'] },
                },
                required: ['weight', 'distance'],
              },
            },
            required: ['name', 'fields', 'measurements'],
          },
        },
        workouts: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              date: { type: 'string' },
              templateName: { type: 'string' },
              notes: { type: 'string' },
              sets: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    setType: { type: 'string', enum: ['regular', 'warmup', 'max'] },
                    reps: { type: 'string' },
                    weight: { type: 'string' },
                    duration: { type: 'string' },
                    distance: { type: 'string' },
                  },
                  required: ['setType', 'reps', 'weight', 'duration', 'distance'],
                },
              },
            },
            required: ['date', 'templateName', 'notes', 'sets'],
          },
        },
        skipped: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sourceReference: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['sourceReference', 'reason'],
          },
        },
        warnings: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['templates', 'workouts', 'skipped', 'warnings'],
    };
  }

  function buildWorkoutTemplateImportExamples() {
    return [
      {
        name: 'Bench Press',
        fields: {
          reps: true,
          weight: true,
          duration: false,
          distance: false,
        },
        measurements: {
          weight: 'lbs',
          distance: 'miles',
        },
      },
      {
        name: 'Planks',
        fields: {
          reps: false,
          weight: false,
          duration: true,
          distance: false,
        },
        measurements: {
          weight: 'lbs',
          distance: 'miles',
        },
      },
      {
        name: 'Running',
        fields: {
          reps: false,
          weight: false,
          duration: true,
          distance: true,
        },
        measurements: {
          weight: 'lbs',
          distance: 'miles',
        },
      },
    ];
  }

  function buildWorkoutImportExamples() {
    return [
      {
        date: '2026-03-10',
        templateName: 'Bench Press',
        notes: '',
        sets: [
          { setType: 'regular', reps: '11', weight: '65', duration: '', distance: '' },
          { setType: 'regular', reps: '11', weight: '65', duration: '', distance: '' },
          { setType: 'regular', reps: '9', weight: '65', duration: '', distance: '' },
        ],
      },
      {
        date: '2026-01-07',
        templateName: 'Planks',
        notes: '',
        sets: [
          { setType: 'regular', reps: '', weight: '', duration: '01:00', distance: '' },
          { setType: 'regular', reps: '', weight: '', duration: '01:00', distance: '' },
          { setType: 'regular', reps: '', weight: '', duration: '02:30', distance: '' },
        ],
      },
      {
        date: '2026-04-09',
        templateName: 'Squats',
        notes: '',
        sets: [
          { setType: 'warmup', reps: '10', weight: '95', duration: '', distance: '' },
          { setType: 'regular', reps: '10', weight: '110', duration: '', distance: '' },
          { setType: 'regular', reps: '10', weight: '110', duration: '', distance: '' },
        ],
      },
      {
        date: '2026-02-20',
        templateName: 'Shrugs',
        notes: '',
        sets: [
          { setType: 'regular', reps: '30', weight: '20', duration: '', distance: '' },
          { setType: 'regular', reps: '30', weight: '25', duration: '', distance: '' },
          { setType: 'max', reps: '20', weight: '30', duration: '', distance: '' },
        ],
      },
      {
        date: '2026-05-02',
        templateName: 'Bodyweight Dips',
        notes: 'Imported from freeform session notes.',
        sets: [
          { setType: 'regular', reps: '9', weight: '', duration: '', distance: '' },
          { setType: 'regular', reps: '8', weight: '', duration: '', distance: '' },
          { setType: 'regular', reps: '6', weight: '', duration: '', distance: '' },
        ],
      },
    ];
  }

  function sanitizeWorkoutImportPreviewPayload(payload) {
    const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : {};

    const normalizedTemplates = Array.isArray(safePayload.templates)
      ? dedupeImportTemplates(
        safePayload.templates
          .map(sanitizeImportedTemplateDefinition)
          .filter(Boolean)
      )
      : [];
    const normalizedWorkouts = Array.isArray(safePayload.workouts)
      ? dedupeImportedWorkouts(
        safePayload.workouts
          .map(sanitizeImportedWorkoutDefinition)
          .filter(Boolean)
      )
      : [];
    const skipped = Array.isArray(safePayload.skipped)
      ? safePayload.skipped
        .map((entry) => ({
          sourceReference: `${entry?.sourceReference ?? ''}`.trim().slice(0, 160),
          reason: `${entry?.reason ?? ''}`.trim().slice(0, 240),
        }))
        .filter((entry) => entry.reason)
      : [];
    const warnings = Array.isArray(safePayload.warnings)
      ? safePayload.warnings
        .map((warning) => `${warning ?? ''}`.trim().slice(0, 240))
        .filter(Boolean)
      : [];

    return {
      templates: normalizedTemplates,
      workouts: normalizedWorkouts,
      skipped,
      warnings,
    };
  }

  function sanitizeImportedTemplateDefinition(template) {
    const name = `${template?.name ?? ''}`.trim().slice(0, 80);
    if (!name) {
      return null;
    }

    const fields = sanitizeFields(template.fields);
    if (!fields.reps && !fields.weight && !fields.duration && !fields.distance) {
      return null;
    }

    return {
      name,
      fields,
      measurements: sanitizeMeasurements(template.measurements),
    };
  }

  function sanitizeImportedWorkoutDefinition(workout) {
    const date = `${workout?.date ?? ''}`.trim();
    const templateName = `${workout?.templateName ?? ''}`.trim().slice(0, 80);
    const notes = `${workout?.notes ?? ''}`.trim().slice(0, 2000);
    const sets = Array.isArray(workout?.sets)
      ? workout.sets
        .map(sanitizeImportedSetDefinition)
        .filter(Boolean)
      : [];

    if (!isValidWorkoutImportDate(date) || !templateName || sets.length === 0) {
      return null;
    }

    return {
      date,
      templateName,
      notes,
      sets,
    };
  }

  function sanitizeImportedSetDefinition(set) {
    const sanitizedSet = {
      setType: sanitizeSetType(set?.setType),
      reps: `${set?.reps ?? ''}`.trim().slice(0, 40),
      weight: `${set?.weight ?? ''}`.trim().slice(0, 40),
      duration: `${set?.duration ?? ''}`.trim().slice(0, 40),
      distance: `${set?.distance ?? ''}`.trim().slice(0, 40),
    };

    if (!sanitizedSet.reps && !sanitizedSet.weight && !sanitizedSet.duration && !sanitizedSet.distance) {
      return null;
    }

    return sanitizedSet;
  }

  function dedupeImportTemplates(templates) {
    const seen = new Set();
    return templates.filter((template) => {
      const key = template.name.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function dedupeImportedWorkouts(workouts) {
    const seen = new Set();
    return workouts.filter((workout) => {
      const signature = buildImportedWorkoutSignature(workout);
      if (seen.has(signature)) {
        return false;
      }
      seen.add(signature);
      return true;
    });
  }

  async function commitWorkoutImportPreview(userEmail, preview) {
    const normalizedPreview = sanitizeWorkoutImportPreviewPayload(preview);
    const skipped = [...normalizedPreview.skipped];
    const normalizedTemplates = await buildFinalImportedTemplateDefinitions(userEmail, normalizedPreview);
    const existingTemplates = await workoutTemplateCollection.find({ userEmail }).toArray();
    const existingTemplateMap = new Map(existingTemplates.map((template) => [template.normalizedName, template]));
    const createdTemplates = [];
    const workingTemplates = [...existingTemplates];

    for (const templateDefinition of normalizedTemplates) {
      const normalizedName = templateDefinition.name.toLowerCase();
      if (existingTemplateMap.has(normalizedName)) {
        continue;
      }

      const createdTemplate = {
        id: uuid.v4(),
        userEmail,
        name: templateDefinition.name,
        normalizedName,
        color: generateUniqueWorkoutColor(existingTemplateColors(workingTemplates), templateDefinition.name),
        fields: sanitizeFields(templateDefinition.fields),
        measurements: sanitizeMeasurements(templateDefinition.measurements),
      };

      await workoutTemplateCollection.insertOne(createdTemplate);
      existingTemplateMap.set(normalizedName, createdTemplate);
      workingTemplates.push(createdTemplate);
      createdTemplates.push(createdTemplate);
    }

    const existingWorkouts = await workoutCollection.find({ userEmail }).toArray();
    const existingWorkoutSignatures = new Set(existingWorkouts.map(buildStoredWorkoutDuplicateSignature));
    const workoutsToInsert = [];

    for (const workoutDefinition of normalizedPreview.workouts) {
      const template = existingTemplateMap.get(workoutDefinition.templateName.toLowerCase());

      if (!template) {
        skipped.push({
          sourceReference: `${workoutDefinition.date} - ${workoutDefinition.templateName}`,
          reason: 'Skipped because no matching exercise could be created.',
        });
        continue;
      }

      const sanitizedSets = workoutDefinition.sets
        .map((set, index) => sanitizeSet(set, template.fields, index))
        .filter((set) => hasImportedSetValue(set, template.fields));

      if (sanitizedSets.length === 0) {
        skipped.push({
          sourceReference: `${workoutDefinition.date} - ${workoutDefinition.templateName}`,
          reason: 'Skipped because the session did not contain enough set detail to save.',
        });
        continue;
      }

      const newWorkout = {
        id: uuid.v4(),
        createdAt: new Date().toISOString(),
        userEmail,
        date: workoutDefinition.date,
        templateId: template.id,
        templateName: template.name,
        exercise: template.name,
        isMixed: false,
        color: normalizeStoredWorkoutColor(template.color, template.name) || getFallbackWorkoutColor(template.name),
        fields: template.fields,
        measurements: sanitizeMeasurements(template.measurements),
        notes: workoutDefinition.notes,
        starred: false,
        sets: sanitizedSets,
      };

      const signature = buildStoredWorkoutDuplicateSignature(newWorkout);
      if (existingWorkoutSignatures.has(signature)) {
        skipped.push({
          sourceReference: `${workoutDefinition.date} - ${workoutDefinition.templateName}`,
          reason: 'Skipped duplicate session.',
        });
        continue;
      }

      existingWorkoutSignatures.add(signature);
      workoutsToInsert.push(newWorkout);
    }

    if (workoutsToInsert.length > 0) {
      await workoutCollection.insertMany(workoutsToInsert);
    }

    return {
      importedTemplates: createdTemplates,
      importedWorkouts: workoutsToInsert,
      skipped,
    };
  }

  async function buildFinalImportedTemplateDefinitions(userEmail, preview) {
    const existingTemplates = await workoutTemplateCollection.find({ userEmail }).toArray();
    const templateMap = new Map(
      existingTemplates.map((template) => [template.normalizedName, {
        name: template.name,
        fields: sanitizeFields(template.fields),
        measurements: sanitizeMeasurements(template.measurements),
      }])
    );

    preview.templates.forEach((template) => {
      templateMap.set(template.name.toLowerCase(), template);
    });

    preview.workouts.forEach((workout) => {
      const normalizedName = workout.templateName.toLowerCase();
      if (templateMap.has(normalizedName)) {
        return;
      }

      templateMap.set(normalizedName, {
        name: workout.templateName,
        fields: inferFieldsFromSets(workout.sets),
        measurements: sanitizeMeasurements({}),
      });
    });

    return Array.from(templateMap.values())
      .filter(Boolean)
      .map(sanitizeImportedTemplateDefinition)
      .filter(Boolean);
  }

  function buildImportedWorkoutSignature(workout) {
    return [
      workout.date,
      workout.templateName.toLowerCase(),
      workout.sets
        .map((set) => [
          sanitizeSetType(set?.setType),
          `${set?.reps ?? ''}`.trim(),
          `${set?.weight ?? ''}`.trim(),
          `${set?.duration ?? ''}`.trim(),
          `${set?.distance ?? ''}`.trim(),
        ].join('|'))
        .join('||'),
    ].join('###');
  }

  function buildStoredWorkoutDuplicateSignature(workout) {
    return [
      `${workout?.date ?? ''}`.trim(),
      `${workout?.templateName || workout?.exercise || ''}`.trim().toLowerCase(),
      Array.isArray(workout?.sets)
        ? workout.sets.map((set) => [
          sanitizeSetType(set?.setType),
          `${set?.reps ?? ''}`.trim(),
          `${set?.weight ?? ''}`.trim(),
          `${set?.duration ?? ''}`.trim(),
          `${set?.distance ?? ''}`.trim(),
        ].join('|')).join('||')
        : '',
    ].join('###');
  }

  function hasImportedSetValue(set, fields) {
    return (
      (fields?.reps && hasValue(set?.reps))
      || (fields?.weight && hasValue(set?.weight))
      || (fields?.duration && hasValue(set?.duration))
      || (fields?.distance && hasValue(set?.distance))
    );
  }

  function isValidWorkoutImportDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function sortWorkoutsForImportContext(left, right) {
    const leftDate = parseDateForImportSort(left.date);
    const rightDate = parseDateForImportSort(right.date);

    if (rightDate !== leftDate) {
      return rightDate - leftDate;
    }

    const leftChronology = Date.parse(left?.createdAt || '') || 0;
    const rightChronology = Date.parse(right?.createdAt || '') || 0;
    return rightChronology - leftChronology;
  }

  function parseDateForImportSort(value) {
    const time = Date.parse(`${value}T00:00:00`);
    return Number.isNaN(time) ? 0 : time;
  }

  function createHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }

  function hasValue(value) {
    return value !== undefined && value !== null && `${value}` !== '';
  }

  return {
    extractWorkoutImportSource,
    buildWorkoutImportDuplicateContext,
    generateWorkoutImportPreview,
    sanitizeWorkoutImportPreviewPayload,
    commitWorkoutImportPreview,
  };
}

module.exports = {
  createWorkoutImportService,
};
