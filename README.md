# Box Revoke Session Action

Terminate all active sessions for a Box user, forcing them to re-authenticate. This action is commonly used for security incidents or when user access needs to be immediately revoked.

## Overview

This SGNL action integrates with Box's REST API to immediately terminate all active sessions for a specified user. When executed, the user will be logged out of all Box applications and will need to re-authenticate.

## Prerequisites

- Box API Bearer Token with appropriate permissions
- Target user's Box user ID
- Target user's Box login email

## Configuration

### Required Secrets

- `BEARER_AUTH_TOKEN` - Your Box API Bearer token

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADDRESS` | `https://api.box.com` | Box API base URL (can also be provided via `address` parameter) |

### Input Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `userId` | string | Yes | The Box user ID whose sessions should be terminated | `12345678` |
| `userLogin` | string | Yes | The Box user email/login whose sessions should be terminated | `user@example.com` |
| `address` | string | No | Box API base URL (defaults to `https://api.box.com`) | `https://api.box.com` |

### Output Structure

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | The user ID whose sessions were terminated |
| `userLogin` | string | The user login/email whose sessions were terminated |
| `sessionsTerminated` | boolean | Whether the sessions were successfully terminated |
| `terminatedAt` | datetime | When the termination completed (ISO 8601) |
| `message` | string | Response message from the Box API |

## Usage Example

### Job Request

```json
{
  "id": "revoke-session-001",
  "type": "nodejs-22",
  "script": {
    "repository": "github.com/sgnl-actions/box-revoke-session",
    "version": "v1.0.0",
    "type": "nodejs"
  },
  "script_inputs": {
    "userId": "12345678",
    "userLogin": "user@example.com",
    "address": "https://api.box.com"
  },
  "environment": {
    "LOG_LEVEL": "info"
  }
}
```

### Successful Response

```json
{
  "userId": "12345678",
  "userLogin": "user@example.com",
  "sessionsTerminated": true,
  "terminatedAt": "2024-01-15T10:30:00Z",
  "message": "Sessions successfully terminated"
}
```

## Error Handling

The action includes comprehensive error handling for common scenarios:

### Retryable Errors
- **429 Rate Limit**: Box API rate limit exceeded
- **500+ Server Errors**: Box API server errors

### Non-Retryable Errors
- **401 Unauthorized**: Invalid or expired authentication token
- **403 Forbidden**: Insufficient permissions to terminate sessions
- **404 Not Found**: User doesn't exist
- **400 Bad Request**: Invalid parameters

## Development

### Local Testing

```bash
# Install dependencies
npm install

# Run tests
npm test

# Test locally with mock data
npm run dev

# Build for production
npm run build
```

### Running Tests

The action includes comprehensive unit tests covering:
- Input validation (userId, userLogin)
- Email format validation
- Secret validation
- Error handling for missing parameters

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Check test coverage
npm run test:coverage
```

## Security Considerations

- **Token Protection**: Never log or expose the Box API Bearer token
- **Audit Logging**: All session terminations are logged with timestamps
- **Input Validation**: Email format and required parameters are validated
- **Error Messages**: Detailed error messages for troubleshooting

## Box API Reference

This action uses the following Box API endpoint:
- [Terminate User Sessions](https://developer.box.com/reference/post-users-terminate-sessions/)

## Troubleshooting

### Common Issues

1. **"Missing required secret: BEARER_AUTH_TOKEN"**
   - Ensure the `BEARER_AUTH_TOKEN` secret is configured in your SGNL environment

2. **"User not found"**
   - Verify the user ID exists in your Box organization
   - Check that the user ID format is correct

3. **"Invalid or expired authentication token"**
   - Confirm your API token is valid and hasn't expired
   - Verify the token has the necessary permissions

4. **"Invalid email format for userLogin"**
   - Ensure the userLogin parameter is a valid email address
   - Example: `user@example.com`

## Version History

### v1.0.0
- Initial release
- Support for session termination via Box API
- Comprehensive error handling and validation
- Integration with @sgnl-actions/utils package

## License

MIT

## Support

For issues or questions, please contact SGNL Engineering or create an issue in this repository.