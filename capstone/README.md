# FIREALERT capstone board

This folder is the whole monitoring board. It does not use XAMPP, and it does not need the old project folder.

Copy this directory to `D:\capstone`. After that copy, deleting the old XAMPP folder does not affect this app.

## Run on Windows

Install Node.js 20 or newer. Python 3 is only needed for the USB gateway bridge.

```powershell
cd D:\capstone
npm install
npm run dev
```

Open http://localhost:3000

Sign-in needs `D:\capstone\.env.local`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler/neondb?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
SESSION_SECRET=replace-with-a-long-random-string
```

Then, still in `D:\capstone`:

```powershell
npm run db:push
npm run db:seed
node --experimental-strip-types scripts/ensure-admin.ts
```

Demo sign-in is `admin` / `admin123`. Change that password before a real station deployment.

## Gateway bridge

XAMPP does not receive wearable packets. Plug in the gateway and, from this folder, run:

```powershell
npm run bridge
```

Leave that window open. It copies gateway serial JSON to http://127.0.0.1:3000/api/telemetry.

## What is inside this folder

- Next.js app, React, and the database client in `node_modules` after `npm install`
- `neon.ts` for the Neon project
- Board pages, API routes, and the serial bridge
- Logos in `public/`
- Sample motion CSVs in `datasets/mpu/`
