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

async function terminateSessions(userId, userLogin, token) {
  const url = 'https://api.box.com/2.0/users/terminate_sessions';
  
  const requestBody = {
    user_ids: [userId],
    user_logins: [userLogin]
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
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
  invoke: async (params, context) => {
    console.log('Starting Box Revoke Session action');
    
    try {
      validateInputs(params);
      
      const { userId, userLogin } = params;
      
      console.log(`Processing user ID: ${userId}, login: ${userLogin}`);
      
      if (!context.secrets?.BOX_TOKEN) {
        throw new FatalError('Missing required secret: BOX_TOKEN');
      }
      
      // Terminate all sessions for the user
      console.log(`Terminating sessions for user: ${userId}`);
      const terminateResult = await terminateSessions(userId, userLogin, context.secrets.BOX_TOKEN);
      
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

  error: async (params, _context) => {
    const { error } = params;
    console.error(`Error handler invoked: ${error?.message}`);
    
    // Re-throw to let framework handle retries
    throw error;
  },

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