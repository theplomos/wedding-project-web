# 💍 Modern Wedding Web App & RSVP Platform

A full-stack, multilingual web application and interactive guest portal built with **Next.js (App Router)**, **React 19**, **Tailwind CSS v4**, **Prisma ORM**, and **PostgreSQL**.

Designed as a modern, responsive wedding platform featuring real-time RSVP management, intelligent fuzzy guest matching, Spotify playlist integration, Cloudinary media gallery, and a secure administration dashboard.

---

## ✨ Features

- **🌐 Multilingual by Design**: Seamless internationalization with 4 supported languages (**Spanish**, **German**, **Portuguese**, **English**).
- **🔒 Intelligent Guest Matching & RSVP**:
  - Multi-tiered fuzzy search with privacy safeguards (prevents guest enumeration).
  - Dietary requirements, attendance tracking, family group RSVPs, and personalized welcoming.
  - Secure signed session cookies (HMAC-SHA256).
- **🎵 Spotify Collaborative Playlist**:
  - Live Spotify Web API track search.
  - Guest song suggestions and upvoting system.
  - Admin approval pipeline that pushes approved songs directly to a Spotify playlist via OAuth 2.0.
- **📸 Media Gallery**:
  - Cloudinary-powered photo/video uploads from guests.
  - Admin media moderation, full-screen lightbox preview, and batch downloads.
- **🛡️ Enterprise-Grade Security**:
  - Strict **Content Security Policy (CSP)**, **HSTS**, and security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Permissions-Policy`).
  - Constant-time password verification (`crypto.timingSafeEqual`) against timing attacks.
  - In-memory sliding window rate limiting for public endpoints.
- **📊 Comprehensive Admin Dashboard (`/admin`)**:
  - Real-time RSVP analytics (confirmed adults, kids, dietary breakdown).
  - Anecdotes and guest wishes approval queue.
  - Automated WhatsApp reminder generator with multi-wave scheduling (`week`, `day`, `morning`).
- **🧪 100% Test-Covered Core Logic**: 266 unit and integration tests across 14 test suites covering security rules, phone normalization, session signing, and rate limiting.

---

## 🛠️ Tech Stack

- **Framework**: Next.js (App Router, Server Actions & API Routes)
- **Frontend**: React 19, Tailwind CSS v4, Lucide / Google Material Symbols
- **Database & ORM**: PostgreSQL, Prisma ORM with `@prisma/adapter-pg`
- **Integrations**: Spotify Web API, Cloudinary API, Google Drive API
- **Testing**: Vitest, `@types/node`

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/theplomos/wedding-project-web.git
cd wedding-project-web
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment configuration:

```bash
cp .env.example .env.local
```

Fill in the required credentials in `.env.local` (refer to `.env.example` for details):
- PostgreSQL connection strings (`POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`)
- Security secrets (`SESSION_SECRET`, `ADMIN_PASSWORD`, `GUEST_PASSCODE`)
- Cloudinary credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)
- Spotify API keys (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_PLAYLIST_ID`)

### 4. Database Setup & Seeding

```bash
# Generate Prisma Client
npx prisma generate

# Push schema to your database
npx prisma db push

# (Optional) Seed initial sample guest list
npm run seed # or: node prisma/seed.js
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

---

## 🔐 Authentication & Access Roles

The platform implements two distinct authentication levels configured via environment variables:

| Role | Environment Variable | Default / Example | Purpose & Access Route |
| :--- | :--- | :--- | :--- |
| **Guest Access** | `GUEST_PASSCODE` | `BODA2026` | **RSVP Portal (`/`)**: Distributed on invitations. Unlocks the interactive name-matching flow, dietary preferences, attendance confirmation, Spotify suggestions, and guestbook anecdotes. |
| **Admin Panel** | `ADMIN_PASSWORD` | `admin_secure_password_123` | **Dashboard (`/admin`)**: Grants wedding organizers access to real-time RSVP analytics, dietary stats, anecdote moderation, Spotify playlist curation, and WhatsApp reminder generation. |
| **Session Security** | `SESSION_SECRET` | *(32+ char random string)* | Used internally to HMAC-sign all `guest_session` and `admin_session` cookies with SHA-256 for tamper-proof session persistence. |

### Accessing the Portals:

1. **Guest Flow**:
   * Navigate to [http://localhost:3000](http://localhost:3000) and click **"Confirmar Asistencia / RSVP"**.
   * Enter the passcode defined in `GUEST_PASSCODE`.
   * Search for a sample guest name (e.g., `Max Mustermann`, `Juan Perez`, `Maria Garcia`).

2. **Admin Dashboard**:
   * Navigate to [http://localhost:3000/admin](http://localhost:3000/admin).
   * Enter the password defined in `ADMIN_PASSWORD`.
   * View live confirmation metrics, manage guest lists, and moderate song suggestions.

---

## 🧪 Testing

Run the automated test suite with Vitest:

```bash
npm run test
```

All 266 unit and integration tests will execute against security policies, rate limiters, session parsers, and normalization utilities.

---

## 📄 License

MIT License. Designed and crafted with ❤️ for modern event management.
