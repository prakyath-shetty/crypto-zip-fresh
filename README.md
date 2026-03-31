# Crypto ZIP Fresh

This project is a fresh deployment-ready copy of the original ZIP app you shared.

## Structure

- `frontend/`: static HTML/CSS/JS app with the same pages and visual design from the ZIP frontend
- `backend/`: Express + Postgres API with the same route structure from the ZIP backend

## Deploy frontend to Vercel

- Root directory: `frontend`
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

Environment variables:

- `FRONTEND_API_ORIGIN=https://your-render-app.onrender.com`
- `FRONTEND_PUBLIC_URL=https://your-vercel-app.vercel.app`

## Deploy backend to Render

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`

Environment variables:

- `PORT=10000`
- `DATABASE_URL=...`
- `JWT_SECRET=...`
- `JWT_EXPIRE=7d`
- `FRONTEND_URL=https://your-vercel-app.vercel.app`
- `CLIENT_URLS=https://your-vercel-app.vercel.app,http://localhost:5500,http://127.0.0.1:5500`
- `RESEND_API_KEY=...`
- `RESEND_FROM_EMAIL=Crypto Portfolio <onboarding@resend.dev>`
- `NEWSDATA_API_KEY=...`
