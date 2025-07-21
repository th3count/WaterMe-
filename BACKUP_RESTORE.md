# WaterMe! Backup & Restore System

## Overview

The WaterMe! system now includes a comprehensive backup and restore functionality that allows you to save and restore all your configuration files, schedules, and data. This feature is essential for:

- **System Migration**: Moving your setup to new hardware
- **Configuration Backup**: Safeguarding your settings before major changes
- **Disaster Recovery**: Restoring your system after hardware failures
- **Testing**: Creating snapshots for testing new configurations

## What Gets Backed Up

The backup system includes all critical system files:

### Configuration Files
- `config/settings.cfg` - Garden settings, GPS coordinates, timezone, timer multiplier
- `config/gpio.cfg` - GPIO pin assignments and configuration

### Data Files
- `data/schedule.json` - All watering schedules and zone configurations
- `data/locations.json` - Garden locations and plant assignments
- `data/map.json` - Plant placement and mapping data
- `data/health_alerts.json` - System health alerts and ignored alerts
- `data/logs.json` - System logs and event history

### Library Files
- `library/custom.json` - Custom plant library entries
- `library/fruitbushes.json` - Built-in plant library

### Metadata
- `backup_metadata.json` - Backup creation date, version, and system information

## How to Use

### Creating a Backup

1. **Via Web UI**:
   - Navigate to **Settings** → **Backup & Restore** tab
   - Click **"📦 Create Backup"**
   - The backup will be automatically downloaded as a ZIP file
   - Filename format: `waterme_backup_YYYYMMDD_HHMMSS.zip`

2. **Via API**:
   ```bash
   curl -X POST http://127.0.0.1:5000/api/backup/create -o backup.zip
   ```

### Restoring a Backup

1. **Via Web UI**:
   - Navigate to **Settings** → **Backup & Restore** tab
   - Click **"Choose File"** and select your backup ZIP file
   - Click **"🔄 Restore Backup"**
   - The system will restore all files and restart services

2. **Via API**:
   ```bash
   curl -X POST http://127.0.0.1:5000/api/backup/restore \
     -F "backup_file=@your_backup.zip"
   ```

### Checking Backup Information

1. **Via Web UI**:
   - Navigate to **Settings** → **Backup & Restore** tab
   - View current system information and backup size

2. **Via API**:
   ```bash
   curl http://127.0.0.1:5000/api/backup/info
   ```

## Backup File Structure

```
waterme_backup_20241201_143022.zip
├── backup_metadata.json
├── config/
│   ├── settings.cfg
│   └── gpio.cfg
├── data/
│   ├── schedule.json
│   ├── locations.json
│   ├── map.json
│   ├── health_alerts.json
│   └── logs.json
└── library/
    ├── custom.json
    └── fruitbushes.json
```

## Safety Features

### Automatic Backup Creation
- Before restoring, the system automatically creates a backup of existing files
- Backup files are named with timestamps: `filename.backup.YYYYMMDD_HHMMSS`

### Validation
- Backup files are validated for integrity before restoration
- Metadata file ensures backup authenticity
- File structure is verified during restore

### Error Handling
- Comprehensive error messages for troubleshooting
- Graceful failure handling with rollback capabilities
- Logging of all backup/restore operations

## Testing

Run the test script to verify backup functionality:

```bash
python test_backup.py
```

This will:
1. Test the backup info endpoint
2. Create a test backup
3. Validate the backup file structure
4. Clean up test files

## Best Practices

### Regular Backups
- Create backups before major configuration changes
- Schedule regular backups (weekly/monthly)
- Store backups in multiple locations

### Backup Management
- Use descriptive filenames with dates
- Keep multiple backup versions
- Test restore functionality periodically

### System Migration
1. Create a backup on the old system
2. Install WaterMe! on the new system
3. Restore the backup
4. Verify all settings and schedules

## Troubleshooting

### Common Issues

**Backup Creation Fails**
- Check disk space availability
- Verify file permissions
- Ensure all configuration files exist

**Restore Fails**
- Verify backup file integrity
- Check backup file format (must be .zip)
- Ensure sufficient disk space for restore

**Partial Restore**
- Check error logs for specific file failures
- Verify file permissions on target directories
- Manually restore individual files if needed

### Log Files
- Backup/restore operations are logged to the system logs
- Check logs for detailed error information
- Use the Logs page in the web UI to view recent activity

## API Reference

### Endpoints

#### GET /api/backup/info
Returns information about backup functionality and current system state.

**Response:**
```json
{
  "status": "success",
  "files": {
    "config/settings.cfg": {
      "size": 1024,
      "size_mb": 0.001,
      "modified": "2024-12-01T14:30:22",
      "exists": true
    }
  },
  "total_size": 2048,
  "total_size_mb": 0.002,
  "backup_version": "1.0.0"
}
```

#### POST /api/backup/create
Creates and downloads a complete system backup.

**Response:** ZIP file download

#### POST /api/backup/restore
Restores system from backup file.

**Request:** Multipart form with `backup_file`

**Response:**
```json
{
  "status": "success",
  "restored_files": ["config/settings.cfg", "data/schedule.json"],
  "backup_date": "2024-12-01T14:30:22",
  "version": "1.0.0"
}
```

## Version History

- **v1.0.0**: Initial implementation with full backup/restore functionality
- Complete file backup including metadata
- Web UI integration
- API endpoints for programmatic access
- Validation and error handling
- Automatic backup creation before restore

---

**Note**: This backup system is designed for WaterMe! version 1.0.0 and later. Backups from earlier versions may not be compatible. 