// SGNL Job Script - Auto-generated bundle
'use strict';

/**
 * SGNL Actions - Authentication Utilities
 *
 * Shared authentication utilities for SGNL actions.
 * Supports: Bearer Token, Basic Auth, OAuth2 Client Credentials, OAuth2 Authorization Code
 */

/**
 * Get OAuth2 access token using client credentials flow
 * @param {Object} config - OAuth2 configuration
 * @param {string} config.tokenUrl - Token endpoint URL
 * @param {string} config.clientId - Client ID
 * @param {string} config.clientSecret - Client secret
 * @param {string} [config.scope] - OAuth2 scope
 * @param {string} [config.audience] - OAuth2 audience
 * @param {string} [config.authStyle] - Auth style: 'InParams' or 'InHeader' (default)
 * @returns {Promise<string>} Access token
 */
async function getClientCredentialsToken(config) {
  const { tokenUrl, clientId, clientSecret, scope, audience, authStyle } = config;

  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error('OAuth2 Client Credentials flow requires tokenUrl, clientId, and clientSecret');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');

  if (scope) {
    params.append('scope', scope);
  }

  if (audience) {
    params.append('audience', audience);
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json'
  };

  if (authStyle === 'InParams') {
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
  } else {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: params.toString()
  });

  if (!response.ok) {
    let errorText;
    try {
      const errorData = await response.json();
      errorText = JSON.stringify(errorData);
    } catch {
      errorText = await response.text();
    }
    throw new Error(
      `OAuth2 token request failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('No access_token in OAuth2 response');
  }

  return data.access_token;
}

/**
 * Get the Authorization header value from context using available auth method.
 * Supports: Bearer Token, Basic Auth, OAuth2 Authorization Code, OAuth2 Client Credentials
 *
 * @param {Object} context - Execution context with environment and secrets
 * @param {Object} context.environment - Environment variables
 * @param {Object} context.secrets - Secret values
 * @returns {Promise<string>} Authorization header value (e.g., "Bearer xxx" or "Basic xxx")
 */
async function getAuthorizationHeader(context) {
  const env = context.environment || {};
  const secrets = context.secrets || {};

  // Method 1: Simple Bearer Token
  if (secrets.BEARER_AUTH_TOKEN) {
    const token = secrets.BEARER_AUTH_TOKEN;
    return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  // Method 2: Basic Auth (username + password)
  if (secrets.BASIC_PASSWORD && secrets.BASIC_USERNAME) {
    const credentials = Buffer.from(`${secrets.BASIC_USERNAME}:${secrets.BASIC_PASSWORD}`).toString('base64');
    return `Basic ${credentials}`;
  }

  // Method 3: OAuth2 Authorization Code - use pre-existing access token
  if (secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN) {
    const token = secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN;
    return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  // Method 4: OAuth2 Client Credentials - fetch new token
  if (secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET) {
    const tokenUrl = env.OAUTH2_CLIENT_CREDENTIALS_TOKEN_URL;
    const clientId = env.OAUTH2_CLIENT_CREDENTIALS_CLIENT_ID;
    const clientSecret = secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET;

    if (!tokenUrl || !clientId) {
      throw new Error('OAuth2 Client Credentials flow requires TOKEN_URL and CLIENT_ID in env');
    }

    const token = await getClientCredentialsToken({
      tokenUrl,
      clientId,
      clientSecret,
      scope: env.OAUTH2_CLIENT_CREDENTIALS_SCOPE,
      audience: env.OAUTH2_CLIENT_CREDENTIALS_AUDIENCE,
      authStyle: env.OAUTH2_CLIENT_CREDENTIALS_AUTH_STYLE
    });

    return `Bearer ${token}`;
  }

  throw new Error(
    'No authentication configured. Provide one of: ' +
    'BEARER_AUTH_TOKEN, BASIC_USERNAME/BASIC_PASSWORD, ' +
    'OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN, or OAUTH2_CLIENT_CREDENTIALS_*'
  );
}

/**
 * Get the base URL/address for API calls
 * @param {Object} params - Request parameters
 * @param {string} [params.address] - Address from params
 * @param {Object} context - Execution context
 * @returns {string} Base URL
 */
function getBaseUrl(params, context) {
  const env = context.environment || {};
  const address = params?.address || env.ADDRESS;

  if (!address) {
    throw new Error('No URL specified. Provide address parameter or ADDRESS environment variable');
  }

  // Remove trailing slash if present
  return address.endsWith('/') ? address.slice(0, -1) : address;
}

class RetryableError extends Error {
  constructor(message) {
    super(message);
    this.retryable = true;
  }
}

class FatalError extends Error {
  constructor(message) {
    super(message);
    this.retryable = false;
  }
}

function validateInputs(params) {
  if (!params.userId || typeof params.userId !== 'string' || params.userId.trim() === '') {
    throw new FatalError('Invalid or missing userId parameter');
  }

  if (!params.userLogin || typeof params.userLogin !== 'string' || params.userLogin.trim() === '') {
    throw new FatalError('Invalid or missing userLogin parameter');
  }

  // Basic email validation for userLogin
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(params.userLogin)) {
    throw new FatalError('Invalid email format for userLogin');
  }
}

async function terminateSessions(userId, userLogin, baseUrl, authHeader) {
  const url = `${baseUrl}/2.0/users/terminate_sessions`;

  const requestBody = {
    user_ids: [userId],
    user_logins: [userLogin]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const responseText = await response.text();

    if (response.status === 429) {
      throw new RetryableError('Box API rate limit exceeded');
    }

    if (response.status === 401) {
      throw new FatalError('Invalid or expired authentication token');
    }

    if (response.status === 403) {
      throw new FatalError('Insufficient permissions to terminate sessions');
    }

    if (response.status === 404) {
      throw new FatalError(`User not found: ${userId}`);
    }

    if (response.status >= 500) {
      throw new RetryableError(`Box API server error: ${response.status}`);
    }

    throw new FatalError(`Failed to terminate sessions: ${response.status} ${response.statusText} - ${responseText}`);
  }

  const data = await response.json();
  return data;
}

var script = {
  /**
   * Main execution handler - terminates all active sessions for a Box user
   * @param {Object} params - Job input parameters
   * @param {string} params.userId - The Box user ID whose sessions should be terminated
   * @param {string} params.userLogin - The Box user email/login whose sessions should be terminated
   * @param {string} params.address - Full URL to Box API (defaults to https://api.box.com if not provided)
   *
   * @param {Object} context - Execution context with secrets and environment
   * @param {string} context.secrets.BEARER_AUTH_TOKEN - Bearer token for Box API authentication
   * @param {string} context.environment.ADDRESS - Default Box API base URL
   *
   * @returns {Object} Job results
   */
  invoke: async (params, context) => {
    console.log('Starting Box Revoke Session action');

    try {
      validateInputs(params);

      const { userId, userLogin } = params;

      console.log(`Processing user ID: ${userId}, login: ${userLogin}`);

      if (!context.secrets?.BEARER_AUTH_TOKEN) {
        throw new FatalError('Missing required secret: BEARER_AUTH_TOKEN');
      }

      // Get base URL using utils (with default for Box API)
      // If no address is provided via params or environment, use default Box API URL
      let baseUrl;
      try {
        baseUrl = getBaseUrl(params, context);
      } catch (error) {
        // Default to standard Box API URL if not provided
        baseUrl = 'https://api.box.com';
      }

      // Get authorization header using utils
      const authHeader = await getAuthorizationHeader(context);

      // Terminate all sessions for the user
      console.log(`Terminating sessions for user: ${userId}`);
      const terminateResult = await terminateSessions(userId, userLogin, baseUrl, authHeader);

      const result = {
        userId,
        userLogin,
        sessionsTerminated: true,
        terminatedAt: new Date().toISOString(),
        message: terminateResult.message || 'Sessions successfully terminated'
      };

      console.log(`Successfully terminated sessions for user: ${userLogin}`);
      return result;

    } catch (error) {
      console.error(`Error revoking Box sessions: ${error.message}`);

      if (error instanceof RetryableError || error instanceof FatalError) {
        throw error;
      }

      throw new FatalError(`Unexpected error: ${error.message}`);
    }
  },

  /**
   * Error recovery handler - handles errors during session termination
   *
   * @param {Object} params - Original params plus error information
   * @param {Object} context - Execution context
   *
   * @returns {Object} Recovery results
   */
  error: async (params, _context) => {
    const { error } = params;
    console.error(`Error handler invoked: ${error?.message}`);

    // Re-throw to let framework handle retries
    throw error;
  },

  /**
   * Halt handler - handles graceful shutdown
   *
   * @param {Object} params - Halt parameters including reason
   * @param {Object} context - Execution context
   *
   * @returns {Object} Halt results
   */
  halt: async (params, _context) => {
    const { reason, userId, userLogin } = params;
    console.log(`Job is being halted (${reason})`);

    return {
      userId: userId || 'unknown',
      userLogin: userLogin || 'unknown',
      reason: reason || 'unknown',
      haltedAt: new Date().toISOString(),
      cleanupCompleted: true
    };
  }
};

module.exports = script;
