# Automatic Credential Rotation System

This system provides automatic rotation of API keys, secrets, and credentials for various services integrated with CoinRuler.

## Features

- **Scheduled Rotation**: Automatically rotates credentials based on configurable policies
- **Grace Period**: Old credentials remain valid during a grace period to prevent service disruption
- **Audit Logging**: All rotation events are logged to MongoDB for compliance
- **Manual Control**: API endpoints and Discord commands for manual rotation
- **Multi-Service Support**: Supports rotation for Coinbase, Discord, MongoDB, OpenAI, and other services
- **Key Vault Integration**: Integrates with AWS Secrets Manager and Azure Key Vault

## Architecture

### Core Components

1. **credentialRotation.ts**: Core rotation logic
   - `rotateAPIKey()`: Rotate credentials for a specific service
   - `getRotationPolicy()`: Fetch rotation policy for a service
   - `updateRotationPolicy()`: Update rotation intervals and settings
   - `getRotationStatus()`: Check rotation status for all services

2. **rotationScheduler.ts**: Automated scheduling
   - `startRotationScheduler()`: Start background scheduler
   - `stopRotationScheduler()`: Stop scheduler
   - `forceRotationCheck()`: Manually trigger rotation check

3. **API Endpoints**: REST API for rotation management
   - `GET /rotation/status`: View rotation status for all services
   - `GET /rotation/policy/:service`: Get policy for specific service
   - `PUT /rotation/policy/:service`: Update rotation policy
   - `POST /rotation/rotate/:service`: Manually rotate credentials
   - `POST /rotation/scheduler/check`: Force rotation check

4. **Discord Commands**: Bot commands for rotation control
   - `/rotation-status`: View rotation status
   - `/rotate <service>`: Manually rotate credentials
   - `/rotation-check`: Force rotation check

## Rotation Policies

Default rotation intervals:

| Service      | Interval | Grace Period | Status      |
|--------------|----------|--------------|-------------|
| coinbase     | 90 days  | 24 hours     | ✅ Enabled  |
| discord      | 180 days | 12 hours     | ✅ Enabled  |
| mongodb      | 90 days  | 48 hours     | ✅ Enabled  |
| openai       | 60 days  | 6 hours      | ✅ Enabled  |
| newsapi      | 180 days | 24 hours     | ❌ Disabled |
| whalealert   | 180 days | 24 hours     | ❌ Disabled |
| tradingecon  | 180 days | 24 hours     | ❌ Disabled |
| twilio       | 120 days | 12 hours     | ❌ Disabled |

## Configuration

### Environment Variables

```bash
# Enable/disable rotation scheduler
ROTATION_SCHEDULER_ENABLED=true

# Key vault provider (AWS or Azure)
USE_AWS_SECRETS=true
AWS_REGION=us-east-1

# Or Azure Key Vault
USE_AZURE_KEYVAULT=true
AZURE_KEYVAULT_URL=https://your-vault.vault.azure.net/
```

### Rotation Policy Structure

```typescript
{
  service: 'coinbase',
  rotationIntervalDays: 90,
  gracePeriodHours: 24,
  enabled: true,
  lastRotation: Date,
  nextRotation: Date
}
```

## Usage

### Automatic Rotation

The scheduler runs automatically on startup and checks for credentials due for rotation every 24 hours (configurable).

```typescript
// In API startup (apps/api/src/index.ts)
await startRotationScheduler(db, {
  checkIntervalHours: 24,
  enabled: true,
  notifyOnRotation: true,
  notifyOnFailure: true,
});
```

### Manual Rotation via API

```bash
# Check rotation status
curl http://localhost:3001/rotation/status

# Rotate Coinbase credentials
curl -X POST http://localhost:3001/rotation/rotate/coinbase

# Update rotation policy
curl -X PUT http://localhost:3001/rotation/policy/coinbase \
  -H "Content-Type: application/json" \
  -d '{"rotationIntervalDays": 60, "gracePeriodHours": 12, "enabled": true}'

# Force rotation check
curl -X POST http://localhost:3001/rotation/scheduler/check
```

### Manual Rotation via Discord

```
/rotation-status
# Shows rotation status for all services

/rotate coinbase
# Manually rotate Coinbase credentials

/rotation-check
# Force immediate rotation check for all services
```

## Rotation Process

1. **Check**: Scheduler determines if credentials are due for rotation
2. **Generate**: New API keys are generated (service-specific implementation)
3. **Store**: New keys are stored in key vault
4. **Backup**: Old keys are stored with `_old` suffix during grace period
5. **Update**: Rotation timestamp is updated in database
6. **Notify**: Success/failure notifications sent via Discord
7. **Deactivate**: After grace period, old keys are deactivated
8. **Audit**: All actions are logged to `credential_rotation_audit` collection

## Database Collections

### credential_rotation_policies
Stores rotation policies for each service:
```json
{
  "service": "coinbase",
  "rotationIntervalDays": 90,
  "gracePeriodHours": 24,
  "enabled": true,
  "lastRotation": "2024-01-15T10:30:00Z",
  "nextRotation": "2024-04-15T10:30:00Z"
}
```

### credential_rotation_audit
Audit log of all rotation events:
```json
{
  "service": "coinbase",
  "action": "rotate",
  "success": true,
  "timestamp": "2024-01-15T10:30:00Z",
  "newKeyId": "coinbase_key_1234567890",
  "oldKeyId": "coinbase_key_0987654321",
  "initiatedBy": "scheduler"
}
```

## Security Considerations

1. **Grace Period**: Old credentials remain valid during grace period to prevent service disruption
2. **Key Vault**: Credentials are stored in AWS Secrets Manager or Azure Key Vault (not in code)
3. **Audit Trail**: All rotation events are logged with timestamps and results
4. **Access Control**: Only owner (OWNER_ID) can trigger manual rotations
5. **Notifications**: Team is notified of all rotation events and failures
6. **Automatic Cleanup**: Old credentials are automatically deactivated after grace period

## Implementation Notes

### Service-Specific Key Generation

The `generateNewKey()` function in `credentialRotation.ts` currently returns placeholders. For production use, implement actual key generation for each service:

**Coinbase**:
```typescript
// Use Coinbase API to create new API key
const response = await coinbaseAPI.createAPIKey({
  name: 'CoinRuler Bot',
  permissions: ['wallet:read', 'wallet:trade']
});
return { keyId: response.id, secret: response.secret };
```

**Discord**:
```typescript
// Regenerate bot token via Discord Developer Portal API
const response = await discordAPI.regenerateToken(botId);
return { keyId: botId, secret: response.token };
```

**MongoDB**:
```typescript
// Create new database user with rotated password
const newPassword = generateRandomSecret(32);
await db.admin().command({
  updateUser: 'coinruler_bot',
  pwd: newPassword
});
return { keyId: 'coinruler_bot', secret: newPassword };
```

### Service-Specific Key Deactivation

Implement `deactivateOldKey()` for each service to properly revoke old credentials after grace period.

## Testing

The rotation system can be tested in dry-run mode:

```typescript
// Without database connection
const result = await rotateAPIKey(null, 'coinbase');
// Returns: { status: 'dryrun' }

// With database but execution disabled
const result = await rotateAPIKey(db, 'coinbase');
// Logs actions but uses placeholder key generation
```

## Monitoring

Monitor rotation health via:

1. **Rotation Status Endpoint**: Check which services are due for rotation
2. **Scheduler Status**: Verify scheduler is running
3. **Audit Logs**: Review `credential_rotation_audit` collection
4. **Discord Notifications**: Team receives alerts on rotation success/failure

## Troubleshooting

### Rotation Failed

1. Check audit log for error details
2. Verify service API credentials are valid
3. Ensure key vault is accessible (AWS/Azure)
4. Check service-specific key generation implementation

### Grace Period Expired

If old keys are deactivated too soon:
1. Increase `gracePeriodHours` in rotation policy
2. Allow more time for systems to update to new credentials

### Rotation Not Running

1. Check `ROTATION_SCHEDULER_ENABLED` environment variable
2. Verify scheduler is started: `GET /rotation/scheduler`
3. Check database connection
4. Review application logs for scheduler errors

## Future Enhancements

- [ ] Add support for more services (AWS, Stripe, etc.)
- [ ] Implement automatic rollback on rotation failure
- [ ] Add Slack/PagerDuty integration for notifications
- [ ] Create UI dashboard for rotation management
- [ ] Implement certificate rotation for TLS/SSL
- [ ] Add compliance reporting (SOC2, PCI-DSS)
- [ ] Support multi-region key replication
- [ ] Implement rotation testing (verify new keys before deactivating old)

## References

- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [Azure Key Vault Rotation](https://learn.microsoft.com/en-us/azure/key-vault/secrets/tutorial-rotation)
- [NIST Key Management Guidelines](https://csrc.nist.gov/projects/key-management/key-management-guidelines)
