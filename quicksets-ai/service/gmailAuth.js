const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
];

function resolveConfigPath(environmentKey, fallbackName) {
  const configuredPath = process.env[environmentKey];
  return configuredPath
    ? path.resolve(configuredPath)
    : path.join(__dirname, fallbackName);
}

function getGmailPaths() {
  return {
    credentialsPath: resolveConfigPath('GMAIL_CREDENTIALS_PATH', 'credentials.json'),
    tokenPath: resolveConfigPath('GMAIL_TOKEN_PATH', 'token.json'),
  };
}

function readJsonFile(filePath, description) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${description} was not found at ${filePath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${description} at ${filePath}: ${error.message}`);
  }
}

function loadOAuthClientConfig() {
  const { credentialsPath } = getGmailPaths();
  const credentials = readJsonFile(credentialsPath, 'Gmail OAuth credentials');
  const clientType = credentials.installed ? 'installed' : credentials.web ? 'web' : '';
  const clientConfig = credentials[clientType];

  if (!clientConfig?.client_id || !clientConfig?.client_secret) {
    throw new Error(
      `Gmail OAuth credentials at ${credentialsPath} must contain an "installed" or "web" client`
    );
  }

  return {
    clientId: clientConfig.client_id,
    clientSecret: clientConfig.client_secret,
    clientType,
    redirectUris: Array.isArray(clientConfig.redirect_uris) ? clientConfig.redirect_uris : [],
  };
}

function writeToken(token) {
  const { tokenPath } = getGmailPaths();
  fs.writeFileSync(tokenPath, `${JSON.stringify(token, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function createOAuthClient(redirectUri) {
  const { clientId, clientSecret, redirectUris } = loadOAuthClientConfig();
  const resolvedRedirectUri = redirectUri || redirectUris[0];

  return new google.auth.OAuth2(clientId, clientSecret, resolvedRedirectUri);
}

function loadAuthorizedGmailClient() {
  const { tokenPath } = getGmailPaths();
  const token = readJsonFile(tokenPath, 'Gmail OAuth token');
  const auth = createOAuthClient();

  auth.setCredentials(token);
  auth.on('tokens', (nextTokens) => {
    writeToken({ ...token, ...nextTokens });
  });

  return {
    auth,
    gmail: google.gmail({ version: 'v1', auth }),
  };
}

module.exports = {
  GMAIL_SCOPES,
  createOAuthClient,
  getGmailPaths,
  loadAuthorizedGmailClient,
  loadOAuthClientConfig,
  writeToken,
};
