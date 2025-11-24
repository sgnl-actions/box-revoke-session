import script from '../src/script.mjs';

describe('Box Revoke Session Script', () => {
  const mockContext = {
    env: {
      ENVIRONMENT: 'test'
    },
    secrets: {
      BEARER_AUTH_TOKEN: 'Bearer test-box-token-123456'
    },
    outputs: {}
  };

  beforeEach(() => {
    // Mock console to avoid noise in tests
    global.console.log = () => {};
    global.console.error = () => {};
  });

  describe('invoke handler', () => {
    test('should throw error for missing userId', async () => {
      const params = {
        userLogin: 'user@example.com'
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid or missing userId parameter');
    });

    test('should throw error for missing userLogin', async () => {
      const params = {
        userId: '12345'
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid or missing userLogin parameter');
    });

    test('should throw error for invalid email format', async () => {
      const params = {
        userId: '12345',
        userLogin: 'not-an-email'
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid email format for userLogin');
    });

    test('should throw error for missing BEARER_AUTH_TOKEN', async () => {
      const params = {
        userId: '12345',
        userLogin: 'user@example.com'
      };

      const contextWithoutToken = {
        ...mockContext,
        secrets: {}
      };

      await expect(script.invoke(params, contextWithoutToken))
        .rejects.toThrow('Missing required secret: BEARER_AUTH_TOKEN');
    });

    test('should validate empty userId', async () => {
      const params = {
        userId: '   ',
        userLogin: 'user@example.com'
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid or missing userId parameter');
    });

    test('should validate empty userLogin', async () => {
      const params = {
        userId: '12345',
        userLogin: '   '
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid or missing userLogin parameter');
    });

    // Note: Testing actual Box API calls would require mocking fetch
    // or integration tests with real Box credentials
  });

  describe('error handler', () => {
    test('should re-throw error for framework to handle', async () => {
      const params = {
        userId: '12345',
        userLogin: 'user@example.com',
        error: new Error('Network timeout')
      };

      await expect(script.error(params, mockContext))
        .rejects.toThrow('Network timeout');
    });
  });

  describe('halt handler', () => {
    test('should handle graceful shutdown', async () => {
      const params = {
        userId: '12345',
        userLogin: 'user@example.com',
        reason: 'timeout'
      };

      const result = await script.halt(params, mockContext);

      expect(result.userId).toBe('12345');
      expect(result.userLogin).toBe('user@example.com');
      expect(result.reason).toBe('timeout');
      expect(result.haltedAt).toBeDefined();
      expect(result.cleanupCompleted).toBe(true);
    });

    test('should handle halt with missing params', async () => {
      const params = {
        reason: 'system_shutdown'
      };

      const result = await script.halt(params, mockContext);

      expect(result.userId).toBe('unknown');
      expect(result.userLogin).toBe('unknown');
      expect(result.reason).toBe('system_shutdown');
      expect(result.cleanupCompleted).toBe(true);
    });
  });
});