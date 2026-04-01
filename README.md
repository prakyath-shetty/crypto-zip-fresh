# CryptoTrack

CryptoTrack is a full-stack crypto portfolio platform for tracking holdings, monitoring markets, managing watchlists, syncing exchange activity, and following crypto news in one place.

The project includes a static frontend deployed on Vercel and a Node.js + PostgreSQL backend deployed on Render.

## Features

- Email/password authentication
- Firebase-based Google sign-in
- Exchange connection flow for portfolio sync
- Portfolio, holdings, and transaction history views
- Watchlist and live market monitoring
- Price alerts and crypto news feed
- Responsive dashboard with market overview and portfolio insights

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Database: PostgreSQL
- Authentication: JWT, Firebase Auth
- Email: Resend
- Deployment: Vercel, Render

## Project Structure

- `frontend/` frontend application and Vercel build output source
- `backend/` Express API, database access, auth, alerts, exchange routes

## Frontend Deployment

Deploy the frontend on Vercel with these settings:

- Root Directory: `frontend`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

Environment variables:

```env
FRONTEND_API_ORIGIN=https://your-render-app.onrender.com
FRONTEND_PUBLIC_URL=https://your-vercel-app.vercel.app
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_MEASUREMENT_ID=your_measurement_id
```

## Backend Deployment

Deploy the backend on Render with these settings:

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

Environment variables:

```env
PORT=10000
DATABASE_URL=your_database_url
JWT_SECRET=your_jwt_secret
JWT_EXPIRE=7d
FRONTEND_URL=https://your-vercel-app.vercel.app
CLIENT_URLS=https://your-vercel-app.vercel.app,http://localhost:5500,http://127.0.0.1:5500
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=Crypto Portfolio <onboarding@resend.dev>
NEWSDATA_API_KEY=your_newsdata_api_key
```

## Local Development

Frontend:

```bash
cd frontend
npm install
npm run build
```

Backend:

```bash
cd backend
npm install
npm start
```

## Production URLs

- Frontend: [https://crypto-zip-fresh-chi.vercel.app](https://crypto-zip-fresh-chi.vercel.app)
- Backend: [https://crypto-zip-fresh.onrender.com](https://crypto-zip-fresh.onrender.com)
