#!/bin/sh
pg_dump -Fc --no-owner --dbname="$DATABASE_URL" -f /backups/pg_$(date +%F_%H%M).dump
find /backups -type f -mtime +7 -delete   # keep 7 days
