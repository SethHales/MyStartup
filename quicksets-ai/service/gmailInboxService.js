const fs = require('fs');
const { getGmailPaths, loadAuthorizedGmailClient } = require('./gmailAuth');
const { createOpenAiClient, extractOpenAiTextResponse } = require('./openAiConfig');
const { processWorkoutLogEmail } = require('./gmailWorkoutLogService');

const processedLabelName = process.env.GMAIL_PROCESSED_LABEL || 'QuickSetsProcessed';
const logReplySubject = 'Re: Workout Logged';
const logReplyBody = 'Successfully received your workout.';
const chatReplySubject = 'Re: CHAT';
const chatModel = process.env.OPENAI_EMAIL_MODEL || process.env.OPENAI_IMPORT_MODEL || 'gpt-4o-mini';
const chatInputCharacterLimit = 30000;
const defaultNormalPollIntervalMs = 3 * 60 * 1000;
const defaultActivePollIntervalMs = 15 * 1000;
const defaultActiveWindowMs = 10 * 60 * 1000;
const defaultMaxMessagesPerPoll = 50;

function decodeBase64Url(value = '') {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function stripHtml(html = '') {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectBodyParts(part, bodies) {
  if (!part || part.filename) {
    return;
  }

  if (part.body?.data) {
    const decodedBody = decodeBase64Url(part.body.data);
    if (part.mimeType === 'text/plain') {
      bodies.plain.push(decodedBody);
    } else if (part.mimeType === 'text/html') {
      bodies.html.push(decodedBody);
    }
  }

  (part.parts || []).forEach((childPart) => collectBodyParts(childPart, bodies));
}

function extractMessageBody(payload) {
  const bodies = { plain: [], html: [] };
  collectBodyParts(payload, bodies);

  const plainBody = bodies.plain.join('\n').trim();
  if (plainBody) {
    return plainBody;
  }

  return stripHtml(bodies.html.join('\n'));
}

function getMessageHeaders(payload) {
  return (payload?.headers || []).reduce((headers, header) => {
    headers[`${header.name || ''}`.toLowerCase()] = `${header.value || ''}`;
    return headers;
  }, {});
}

function extractEmailAddress(headerValue = '') {
  const angleBracketMatch = headerValue.match(/<([^>]+)>/);
  const email = angleBracketMatch ? angleBracketMatch[1] : headerValue;
  return email.trim().replace(/^mailto:/i, '');
}

function sanitizeHeaderValue(value = '') {
  return `${value}`.replace(/[\r\n]+/g, ' ').trim();
}

function encodeRawMessage(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function normalizeEmailCommand(subject = '') {
  const normalizedSubject = `${subject}`
    .trim()
    .replace(/^((re|fw|fwd)\s*:\s*)+/i, '')
    .trim()
    .toUpperCase();

  if (normalizedSubject.startsWith('CHAT')) {
    return 'CHAT';
  }

  if (normalizedSubject.startsWith('LOG')) {
    return 'LOG';
  }

  return '';
}

function buildReplyMessage({ recipient, subject, body, messageId, references }) {
  const replyReferences = [references, messageId].filter(Boolean).join(' ');
  const headers = [
    `To: ${sanitizeHeaderValue(recipient)}`,
    `Subject: ${sanitizeHeaderValue(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];

  if (messageId) {
    headers.push(`In-Reply-To: ${sanitizeHeaderValue(messageId)}`);
  }

  if (replyReferences) {
    headers.push(`References: ${sanitizeHeaderValue(replyReferences)}`);
  }

  return encodeRawMessage(`${headers.join('\r\n')}\r\n\r\n${body.trim()}\r\n`);
}

async function getOrCreateProcessedLabel(gmail) {
  const labelResponse = await gmail.users.labels.list({ userId: 'me' });
  const existingLabel = (labelResponse.data.labels || []).find(
    (label) => label.name === processedLabelName
  );

  if (existingLabel) {
    return existingLabel;
  }

  const createResponse = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name: processedLabelName,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });

  return createResponse.data;
}

async function sendReply(gmail, message, headers, subject, body) {
  const recipient = extractEmailAddress(headers['reply-to'] || headers.from);
  if (!recipient) {
    throw new Error('Message has no reply address');
  }

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: buildReplyMessage({
        recipient,
        subject,
        body,
        messageId: headers['message-id'],
        references: headers.references,
      }),
      threadId: message.threadId,
    },
  });
}

async function generateChatReply(body) {
  const userMessage = `${body || ''}`.trim().slice(0, chatInputCharacterLimit);
  const client = createOpenAiClient();
  const response = await client.responses.create({
    model: chatModel,
    max_output_tokens: 2000,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: [
              'You are replying to a user through email.',
              'Answer the email body as a helpful, accurate conversational assistant.',
              'Use readable plain text without Markdown tables or a subject line.',
              'Be concise by default, but include enough detail to fully answer the request.',
              'Do not claim to have performed external actions unless the email provides proof that they occurred.',
              'If quoted prior email content is included, use it only as conversation context and focus on the newest request.',
            ].join(' '),
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: userMessage || 'The email body was empty. Ask the sender what they would like help with.',
          },
        ],
      },
    ],
  });
  const reply = extractOpenAiTextResponse(response);

  if (!reply) {
    throw new Error('OpenAI returned an empty email response');
  }

  return reply;
}

async function markMessageRead(gmail, messageId, processedLabelId = '') {
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      ...(processedLabelId ? { addLabelIds: [processedLabelId] } : {}),
      removeLabelIds: ['UNREAD'],
    },
  });
}

async function processMessage(gmail, messageReference, processedLabelId, mailboxEmail) {
  const messageResponse = await gmail.users.messages.get({
    userId: 'me',
    id: messageReference.id,
    format: 'full',
  });
  const message = messageResponse.data;
  const headers = getMessageHeaders(message.payload);
  const subject = headers.subject || '(No subject)';
  const body = extractMessageBody(message.payload) || '(No readable message body)';
  const sender = extractEmailAddress(headers['reply-to'] || headers.from).toLowerCase();
  const command = normalizeEmailCommand(headers.subject);

  console.log(`\n[Gmail] Subject: ${subject}`);

  if (!['LOG', 'CHAT'].includes(command)) {
    await markMessageRead(gmail, message.id);
    console.log(`[Gmail] Ignored unsupported subject "${subject}" and marked it read`);
    return { command: 'IGNORED', replySent: false };
  }

  if (command === 'CHAT') {
    console.log(`[Gmail] Body:\n${body}\n`);
  } else {
    console.log('[Gmail] LOG body hidden because it contains QuickSets credentials');
  }

  if (!sender || sender === mailboxEmail.toLowerCase()) {
    await markMessageRead(gmail, message.id, processedLabelId);
    console.log('[Gmail] Skipped reply because the message came from this mailbox');
    return { command, replySent: false };
  }

  if (command === 'LOG') {
    const logSummary = await processWorkoutLogEmail(body, message.id);
    await sendReply(gmail, message, headers, logReplySubject, logSummary || logReplyBody);
    console.log(`[Gmail] Sent workout log summary to ${sender}`);
  } else {
    const chatReply = await generateChatReply(body);
    await sendReply(gmail, message, headers, chatReplySubject, chatReply);
    console.log(`[Gmail] Sent AI chat response to ${sender}`);
  }

  await markMessageRead(gmail, message.id, processedLabelId);
  console.log(`[Gmail] Marked message ${message.id} as processed`);
  return { command, replySent: true };
}

async function pollGmailInboxOnce() {
  const { gmail } = loadAuthorizedGmailClient();
  const profileResponse = await gmail.users.getProfile({ userId: 'me' });
  const mailboxEmail = `${profileResponse.data.emailAddress || ''}`;
  const processedLabel = await getOrCreateProcessedLabel(gmail);
  const configuredLimit = Number(process.env.GMAIL_MAX_MESSAGES_PER_POLL);
  const maxResults = Number.isFinite(configuredLimit) && configuredLimit > 0
    ? Math.min(Math.floor(configuredLimit), 500)
    : defaultMaxMessagesPerPoll;
  const query = process.env.GMAIL_INBOX_QUERY
    || `in:inbox is:unread -label:${processedLabelName}`;
  const messageListResponse = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  });
  const messages = messageListResponse.data.messages || [];

  if (messages.length === 0) {
    console.log('[Gmail] No unread messages to process');
    return { processed: 0 };
  }

  let processed = 0;
  let latestReplyProcessedAt = 0;
  for (const messageReference of messages) {
    try {
      const result = await processMessage(gmail, messageReference, processedLabel.id, mailboxEmail);
      processed += 1;
      if (result.replySent && ['CHAT', 'LOG'].includes(result.command)) {
        latestReplyProcessedAt = Date.now();
      }
    } catch (error) {
      console.error(`[Gmail] Could not process message ${messageReference.id}: ${error.message}`);
    }
  }

  console.log(`[Gmail] Processed ${processed} of ${messages.length} unread messages`);
  return {
    processed,
    found: messages.length,
    latestReplyProcessedAt,
  };
}

function readIntervalEnvironmentValue(name, fallbackValue) {
  const configuredValue = Number(process.env[name]);
  return Number.isFinite(configuredValue) && configuredValue >= 1000
    ? Math.floor(configuredValue)
    : fallbackValue;
}

function formatPollingInterval(intervalMs) {
  if (intervalMs % 60000 === 0) {
    return `${intervalMs / 60000}m`;
  }

  if (intervalMs % 1000 === 0) {
    return `${intervalMs / 1000}s`;
  }

  return `${intervalMs}ms`;
}

function startGmailInboxPoller() {
  if (`${process.env.GMAIL_POLLING_ENABLED || ''}`.toLowerCase() === 'false') {
    console.log('[Gmail] Inbox polling is disabled by GMAIL_POLLING_ENABLED=false');
    return () => {};
  }

  const { credentialsPath, tokenPath } = getGmailPaths();
  if (!fs.existsSync(credentialsPath) || !fs.existsSync(tokenPath)) {
    console.log(
      '[Gmail] Inbox polling not started. Add credentials.json and run "npm run gmail:authorize".'
    );
    return () => {};
  }

  const normalPollIntervalMs = readIntervalEnvironmentValue(
    'GMAIL_NORMAL_POLL_INTERVAL_MS',
    defaultNormalPollIntervalMs
  );
  const activePollIntervalMs = readIntervalEnvironmentValue(
    'GMAIL_ACTIVE_POLL_INTERVAL_MS',
    defaultActivePollIntervalMs
  );
  const activeWindowMs = readIntervalEnvironmentValue(
    'GMAIL_ACTIVE_WINDOW_MS',
    defaultActiveWindowMs
  );

  // Polling state machine:
  // NORMAL checks every normalPollIntervalMs.
  // A successfully replied-to CHAT/LOG message sets activeUntil to ten minutes
  // from that message. ACTIVE checks every activePollIntervalMs until that
  // deadline, and later successful replies move the deadline forward.
  let pollingMode = 'NORMAL';
  let activeUntil = 0;
  let isPolling = false;
  let timeoutId = null;
  let isStopped = false;

  const logModeChange = () => {
    const interval = pollingMode === 'ACTIVE'
      ? activePollIntervalMs
      : normalPollIntervalMs;
    console.log(
      `Gmail polling switched to ${pollingMode} mode (${formatPollingInterval(interval)})`
    );
  };

  const updatePollingMode = () => {
    const nextMode = activeUntil > Date.now() ? 'ACTIVE' : 'NORMAL';
    if (nextMode !== pollingMode) {
      pollingMode = nextMode;
      logModeChange();
    }
  };

  const getNextPollDelay = () => {
    updatePollingMode();

    if (pollingMode === 'NORMAL') {
      return normalPollIntervalMs;
    }

    // Wake at the active deadline when it arrives before the next 15-second
    // poll, allowing the scheduler to switch back to NORMAL promptly.
    return Math.min(activePollIntervalMs, Math.max(0, activeUntil - Date.now()));
  };

  const scheduleNextPoll = (delayMs) => {
    if (isStopped) {
      return;
    }

    timeoutId = setTimeout(runPoll, delayMs);
  };

  const runPoll = async () => {
    timeoutId = null;

    if (isStopped) {
      return;
    }

    // Recursive setTimeout already serializes polls; the lock also protects
    // against an accidental second invocation while a Gmail request is active.
    if (isPolling) {
      console.log('[Gmail] Skipping poll because the previous check is still running');
      scheduleNextPoll(getNextPollDelay());
      return;
    }

    updatePollingMode();
    isPolling = true;
    try {
      const result = await pollGmailInboxOnce();
      if (result.latestReplyProcessedAt) {
        activeUntil = result.latestReplyProcessedAt + activeWindowMs;
        updatePollingMode();
      }
    } catch (error) {
      console.error(`[Gmail] Inbox poll failed: ${error.message}`);
    } finally {
      isPolling = false;
      scheduleNextPoll(getNextPollDelay());
    }
  };

  logModeChange();
  void runPoll();

  return () => {
    isStopped = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}

if (require.main === module) {
  pollGmailInboxOnce().catch((error) => {
    console.error(`[Gmail] Inbox check failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  normalizeEmailCommand,
  pollGmailInboxOnce,
  startGmailInboxPoller,
};
