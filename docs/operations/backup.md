# Backup

Which data of Day is backed up, and how to restore it. The backup runs on the platform: [multi-app → operations/backup.md](https://github.com/nanoAtomi/multi-app/blob/master/docs/operations/backup.md).

## Database

The platform dumps `app-day-db` every night at 03:00 to `/opt/backups/app-day-<date>.sql.gz` (kept 14 days). Restore on the server:

```bash
gunzip -c app-day-<date>.sql.gz | docker exec -i app-day-db psql -U app -d app
```
