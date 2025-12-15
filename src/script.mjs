import { getAuthorizationHeader, getBaseURL, resolveJSONPathTemplates} from '@sgnl-actions/utils';

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

export default {
  /**
   * Main execution handler - terminates all active sessions for a Box user
   * @param {Object} params - Job input parameters
   * @param {string} params.userId - The Box user ID whose sessions should be terminated (required)
   * @param {string} params.userLogin - The Box user email/login whose sessions should be terminated (required)
   * @param {string} params.address - Optional Box API base URL
   *
   * @param {Object} context - Execution context with secrets and environment
   * @param {string} context.environment.ADDRESS - Box API base URL
   *
   * The configured auth type will determine which of the following environment variables and secrets are available
   * @param {string} context.secrets.BEARER_AUTH_TOKEN
   *
   * @param {string} context.secrets.BASIC_USERNAME
   * @param {string} context.secrets.BASIC_PASSWORD
   *
   * @param {string} context.secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_AUDIENCE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_AUTH_STYLE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_CLIENT_ID
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_SCOPE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_TOKEN_URL
   *
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN
   *
   * @returns {Promise<Object>} Action result
   */
  invoke: async (params, context) => {
    console.log('Starting Box Revoke Session action');

    const jobContext = context.data || {};

    // Resolve JSONPath templates in params
    const { result: resolvedParams, errors } = resolveJSONPathTemplates(params, jobContext);
    if (errors.length > 0) {
     console.warn('Template resolution errors:', errors);
    }

    try {
      validateInputs(resolvedParams);

      const { userId, userLogin } = resolvedParams;

      console.log(`Processing user ID: ${userId}, login: ${userLogin}`);

      // Get base URL using utils (params.address or context.environment.ADDRESS)
      const baseUrl = getBaseURL(resolvedParams, context);

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