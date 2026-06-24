const crypto = require('crypto');
const http = require('http');
const { spawn } = require('child_process');
const { google } = require('googleapis');
const {
  GMAIL_SCOPES,
  createOAuthClient,
  getGmailPaths,
  loadOAuthClientConfig,
  writeToken,
} = require('./gmailAuth');

const expectedAccount = (process.env.GMAIL_ACCOUNT_EMAIL || 'quicksetscoach@gmail.com').toLowerCase();
const authorizationTimeoutMs = 10 * 60 * 1000;

function openBrowser(url) {
  const commands = {
    win32: ['cmd.exe', ['/c', 'start', '', url]],
    darwin: ['open', [url]],
    linux: ['xdg-open', [url]],
  };
  const [command, args] = commands[process.platform] || commands.linux;

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  } catch (_error) {
    return false;
  }
}

function getWebRedirectConfig(redirectUris) {
  const loopbackUri = redirectUris.find((redirectUri) => {
    try {
      const parsedUri = new URL(redirectUri);
      return ['localhost', '127.0.0.1'].includes(parsedUri.hostname);
    } catch (_error) {
      return false;
    }
  });

  if (!loopbackUri) {
    throw new Error(
      'Web OAuth credentials need a localhost redirect URI. A Desktop app OAuth client is recommended.'
    );
  }

  const parsedUri = new URL(loopbackUri);
  return {
    hostname: parsedUri.hostname,
    port: Number(parsedUri.port || 80),
    callbackPath: parsedUri.pathname || '/',
    redirectUri: loopbackUri,
  };
}

async function authorizeGmail() {
  const { clientType, redirectUris } = loadOAuthClientConfig();
  const state = crypto.randomBytes(24).toString('hex');
  let oauthClient;
  let callbackPath = '/oauth2callback';
  let server;

  const authorizationResult = new Promise((resolve, reject) => {
    server = http.createServer(async (request, response) => {
      const requestUrl = new URL(request.url, 'http://localhost');

      if (requestUrl.pathname !== callbackPath) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      const authorizationError = requestUrl.searchParams.get('error');
      const returnedState = requestUrl.searchParams.get('state');
      const code = requestUrl.searchParams.get('code');

      if (authorizationError || returnedState !== state || !code) {
        const error = new Error(
          authorizationError
            ? `Google authorization failed: ${authorizationError}`
            : 'Google authorization returned an invalid callback'
        );
        response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        response.end(error.message);
        reject(error);
        return;
      }

      try {
        const { tokens } = await oauthClient.getToken(code);
        if (!tokens.refresh_token) {
          throw new Error(
            'Google did not return a refresh token. Revoke the existing app grant and authorize again.'
          );
        }
        oauthClient.setCredentials(tokens);

        const gmail = google.gmail({ version: 'v1', auth: oauthClient });
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const authorizedEmail = `${profile.data.emailAddress || ''}`.toLowerCase();

        if (expectedAccount && authorizedEmail !== expectedAccount) {
          throw new Error(
            `Authorized ${authorizedEmail || 'an unknown account'}, but expected ${expectedAccount}`
          );
        }

        writeToken(tokens);
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(
          '<h1>QuickSets Gmail authorization complete</h1>'
          + '<p>You can close this window and return to the terminal.</p>'
        );
        resolve(authorizedEmail);
      } catch (error) {
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        response.end(`Authorization could not be completed: ${error.message}`);
        reject(error);
      }
    });
  });

  let listenOptions;
  if (clientType === 'web') {
    const webRedirect = getWebRedirectConfig(redirectUris);
    callbackPath = webRedirect.callbackPath;
    listenOptions = {
      host: webRedirect.hostname,
      port: webRedirect.port,
      redirectUri: webRedirect.redirectUri,
    };
  } else {
    listenOptions = {
      host: '127.0.0.1',
      port: 0,
      redirectUri: '',
    };
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenOptions.port, listenOptions.host, resolve);
  });

  const address = server.address();
  const redirectUri = listenOptions.redirectUri
    || `http://${listenOptions.host}:${address.port}${callbackPath}`;
  oauthClient = createOAuthClient(redirectUri);

  const authorizationUrl = oauthClient.generateAuthUrl({
    access_type: 'offline',
    include_granted_scopes: true,
    login_hint: expectedAccount,
    prompt: 'consent',
    scope: GMAIL_SCOPES,
    state,
  });

  console.log(`Opening Google authorization for ${expectedAccount}...`);
  console.log(`If the browser does not open, visit:\n${authorizationUrl}\n`);
  openBrowser(authorizationUrl);

  let timeoutId;
  const authorizationTimeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Google authorization timed out before the callback was received'));
    }, authorizationTimeoutMs);
  });

  try {
    const authorizedEmail = await Promise.race([authorizationResult, authorizationTimeout]);
    const { tokenPath } = getGmailPaths();
    console.log(`Authorized ${authorizedEmail}. Token saved to ${tokenPath}`);
  } finally {
    clearTimeout(timeoutId);
    server.close();
  }
}

authorizeGmail().catch((error) => {
  console.error(`[Gmail authorization] ${error.message}`);
  process.exitCode = 1;
});
