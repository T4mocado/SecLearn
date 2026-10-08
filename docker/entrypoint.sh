#!/bin/sh
set -e
echo "Waiting for database..."
npx prisma db push --skip-generate
npx tsx prisma/seed.ts || node -e "console.log('seed skipped')"
exec node server.js
