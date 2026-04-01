<div align="center">

# CryptoTrack

**A full-stack crypto portfolio platform for tracking holdings, monitoring live markets, syncing exchange activity, managing alerts, and following crypto news from one unified dashboard.**

[Explore the Live App](https://crypto-zip-fresh-chi.vercel.app)

[Live Frontend](https://crypto-zip-fresh-chi.vercel.app) · [Backend API](https://crypto-zip-fresh.onrender.com) · [Report Bug](https://github.com/prakyath-shetty/crypto-zip-fresh/issues) · [Request Feature](https://github.com/prakyath-shetty/crypto-zip-fresh/issues)

![License](https://img.shields.io/badge/License-MIT-9acd32?style=for-the-badge)
![Frontend](https://img.shields.io/badge/Frontend-Vercel-111111?style=for-the-badge&logo=vercel)
![Backend](https://img.shields.io/badge/Backend-Render-46e3b7?style=for-the-badge&logo=render&logoColor=111111)
![Database](https://img.shields.io/badge/Database-PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![Auth](https://img.shields.io/badge/Auth-Firebase-ffca28?style=for-the-badge&logo=firebase&logoColor=111111)

</div>

---

## Table of Contents

<details>
<summary>Click to expand</summary>

- [About The Project](#about-the-project)
- [Built With](#built-with)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [API Overview](#api-overview)
- [Contact](#contact)

</details>

---

## About The Project

Managing crypto assets across exchanges and tools often becomes fragmented. Holdings, transactions, watchlists, alerts, and market data usually live in separate products, which makes tracking portfolio performance harder than it should be.

CryptoTrack was built to bring these workflows together into a single product experience. The platform combines portfolio monitoring, exchange-aware history, watchlist tracking, market data, alerts, and crypto news in one place with a clean dashboard-first interface.

### Why this project stands out

- **Unified Portfolio Workflow:** Holdings, transactions, exchange sync, alerts, and market monitoring are accessible from one product.
- **Exchange-Aware Data Flow:** Portfolio and history views are designed around a selected exchange workflow rather than disconnected manual screens.
- **Resilient Market Data Layer:** CoinGecko requests are routed through a cached backend proxy to reduce direct rate-limit problems on the frontend.
- **Production Deployment Setup:** Frontend and backend are already structured for Vercel and Render deployment.

---

## Built With

This project uses a clean frontend-backend architecture designed for deployment and ongoing iteration.

### Frontend

- ![HTML](https://img.shields.io/badge/HTML-111111?style=for-the-badge&logo=html5&logoColor=e34f26)
- ![CSS](https://img.shields.io/badge/CSS-111111?style=for-the-badge&logo=css3&logoColor=1572b6)
- ![JavaScript](https://img.shields.io/badge/JavaScript-111111?style=for-the-badge&logo=javascript&logoColor=f7df1e)

### Backend

- ![Node.js](https://img.shields.io/badge/Node.js-111111?style=for-the-badge&logo=node.js&logoColor=5fa04e)
- ![Express](https://img.shields.io/badge/Express-111111?style=for-the-badge&logo=express&logoColor=white)
- ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-111111?style=for-the-badge&logo=postgresql&logoColor=336791)

### Cloud and Infrastructure

- ![Firebase](https://img.shields.io/badge/Firebase-111111?style=for-the-badge&logo=firebase&logoColor=ffca28)
- ![Resend](https://img.shields.io/badge/Resend-111111?style=for-the-badge)
- ![Vercel](https://img.shields.io/badge/Vercel-111111?style=for-the-badge&logo=vercel)
- ![Render](https://img.shields.io/badge/Render-111111?style=for-the-badge&logo=render&logoColor=46e3b7)

---

## Key Features

| Module | Capabilities |
| --- | --- |
| Dashboard | Portfolio overview, market metrics, allocation insights, recent transactions, performance widgets |
| Portfolio | Connect exchange accounts, fetch holdings, filter by selected exchange, review asset allocation |
| Transaction History | Sync exchange trades, filter history, export transaction data |
| Live Market | Monitor market stats, price movement, gainers and losers |
| Watchlist | Track selected coins with sparkline movement and quick actions |
| Alerts | Create and manage price alerts with backend-driven live checks |
| News | Browse crypto headlines and category-based market news |
| Authentication | Email/password auth, Firebase Google sign-in, profile and account settings |

Additional highlights:

- Cached backend market proxy for CoinGecko requests
- Resend-based email delivery for alert and account flows
- PostgreSQL-backed user, holdings, transactions, and alert storage

---

## System Architecture

```mermaid
flowchart LR
    A["User Browser"] --> B["Vercel Frontend"]
    B --> C["Render Backend API"]
    C --> D["PostgreSQL"]
    C --> E["Exchange APIs"]
    C --> F["CoinGecko Proxy Cache"]
    C --> G["Resend Email"]
    B --> H["Firebase Auth"]
```

---

## Getting Started

To run the project locally, set up the backend first and then the frontend.

### Prerequisites

- Node.js v18+
- PostgreSQL database
- Firebase project
- Resend account

### 1. Clone the repository

```bash
git clone https://github.com/prakyath-shetty/crypto-zip-fresh.git
cd crypto-zip-fresh
```

### 2. Backend setup

```bash
cd backend
npm install
```

Create a `.env` file in `backend/`:

```env
PORT=10000
DATABASE_URL=<your_postgresql_connection_string>
JWT_SECRET=<your_jwt_secret>
JWT_EXPIRE=7d
FRONTEND_URL=http://localhost:5500
CLIENT_URLS=http://localhost:5500,http://127.0.0.1:5500
RESEND_API_KEY=<your_resend_api_key>
RESEND_FROM_EMAIL=<your_verified_sender>
NEWSDATA_API_KEY=<your_newsdata_api_key>
```

Run the backend:

```bash
npm start
```

### 3. Frontend setup

```bash
cd ../frontend
npm install
npm run build
```

Set frontend environment values in your deployment setup:

```env
FRONTEND_API_ORIGIN=http://localhost:5000
FRONTEND_PUBLIC_URL=http://localhost:5500
FIREBASE_API_KEY=<your_firebase_api_key>
FIREBASE_AUTH_DOMAIN=<your_firebase_auth_domain>
FIREBASE_PROJECT_ID=<your_firebase_project_id>
FIREBASE_STORAGE_BUCKET=<your_firebase_storage_bucket>
FIREBASE_MESSAGING_SENDER_ID=<your_firebase_sender_id>
FIREBASE_APP_ID=<your_firebase_app_id>
FIREBASE_MEASUREMENT_ID=<your_firebase_measurement_id>
```

---

## Deployment

### Frontend on Vercel

- Root Directory: `frontend`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

Recommended environment variables:

```env
FRONTEND_API_ORIGIN=https://crypto-zip-fresh.onrender.com
FRONTEND_PUBLIC_URL=https://crypto-zip-fresh-chi.vercel.app
FIREBASE_API_KEY=<your_firebase_api_key>
FIREBASE_AUTH_DOMAIN=<your_firebase_auth_domain>
FIREBASE_PROJECT_ID=<your_firebase_project_id>
FIREBASE_STORAGE_BUCKET=<your_firebase_storage_bucket>
FIREBASE_MESSAGING_SENDER_ID=<your_firebase_sender_id>
FIREBASE_APP_ID=<your_firebase_app_id>
FIREBASE_MEASUREMENT_ID=<your_firebase_measurement_id>
```

### Backend on Render

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

Recommended environment variables:

```env
PORT=10000
DATABASE_URL=<your_postgresql_connection_string>
JWT_SECRET=<your_jwt_secret>
JWT_EXPIRE=7d
FRONTEND_URL=https://crypto-zip-fresh-chi.vercel.app
CLIENT_URLS=https://crypto-zip-fresh-chi.vercel.app,http://localhost:5500,http://127.0.0.1:5500
RESEND_API_KEY=<your_resend_api_key>
RESEND_FROM_EMAIL=<your_verified_sender>
NEWSDATA_API_KEY=<your_newsdata_api_key>
```

---

## API Overview

Main backend route groups:

- `/api/auth`
- `/api/profile`
- `/api/exchange`
- `/api/transactions`
- `/api/holdings`
- `/api/alerts`
- `/api/market`
- `/api/news`
- `/api/watchlist`
- `/api/wallet`

---

## Contact

Prakyath Shetty

- GitHub: [@prakyath-shetty](https://github.com/prakyath-shetty)
- Project Repository: [crypto-zip-fresh](https://github.com/prakyath-shetty/crypto-zip-fresh)
