# 🛡️ Courier Fraud Check by WebCraft

Standalone **Express + TypeScript** service that checks a Bangladeshi mobile
number's delivery history across Steadfast, Pathao, RedX, Paperfly, and
Carrybee, and returns per-courier stats plus a combined aggregate.

## Requirements

- Node.js >= 18

## Install & run

```bash
npm install
cp .env.example .env      # add credentials
npm run dev               # dev (ts-node-dev, hot reload)
# or
npm run build && npm start
```

Runs on `http://localhost:3000`.

## Scripts

- `npm run dev` — dev server with hot reload
- `npm run build` — compile to `dist/`
- `npm start` — run compiled output
- `npm run typecheck` — strict type check, no emit

## API

| Method | Path                         | Description                         |
| ------ | ---------------------------- | ----------------------------------- |
| GET    | `/api/couriers`              | List configured couriers            |
| GET    | `/api/check/:phone`          | Aggregate check across all couriers |
| GET    | `/api/check/:courier/:phone` | Single-courier check                |

Couriers: `steadfast`, `pathao`, `redx`, `paperfly`, `carrybee`.

### Sample response

```json
{
  "success": true,
  "phone": "01712345678",
  "data": {
    "steadfast": { "success": 3, "cancel": 1, "total": 4, "success_ratio": 75 },
    "pathao": { "success": 5, "cancel": 2, "total": 7, "success_ratio": 71.43 },
    "redx": { "success": 20, "cancel": 5, "total": 25, "success_ratio": 80 },
    "paperfly": { "success": 0, "cancel": 0, "total": 1, "success_ratio": 0 },
    "carrybee": {
      "success": 10,
      "cancel": 0,
      "total": 10,
      "success_ratio": 100
    },
    "aggregate": {
      "total_success": 38,
      "total_cancel": 8,
      "total_deliveries": 47,
      "success_ratio": 80.85,
      "cancel_ratio": 17.02
    }
  }
}
```

## Architecture

```
routes → controllers → managers → services
              ↑            ↑
        middleware    helpers / utils (cache, validator)
```

- **types/** — shared interfaces (`CourierStats`, `CourierResult`, `FraudReport`, …)
- **services/** — one class per courier, all implement `CourierService.getDeliveryStats(phone)`
- **managers/** — orchestrates all services, computes aggregate
- **controllers/** — HTTP glue
- **middleware/** — validation + error handling
- **helpers/** — shared validators
- **utils/** — in-memory cache (`node-cache`)

## Created by

**WebCraft**

<div align="center">

# 🛡️ Courier Fraud Check

**A unified fraud-signal aggregator for Bangladeshi courier services.**

Check a customer's delivery history across **Steadfast**, **Pathao**, **RedX**, **Paperfly**, and **Carrybee** — through one endpoint, one dashboard, one blended score.

[![Live](https://img.shields.io/badge/live-fraud--check.webcraft.com.bd-38bdf8?style=flat-square)](https://fraud-check.webcraft.com.bd/)
[![Made by WebCraft](https://img.shields.io/badge/made%20by-WebCraft-22c55e?style=flat-square)](https://webcraft.com.bd)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.5-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Live Demo](#-live-demo)
- [Features](#-features)
- [How the Aggregation Works](#-how-the-aggregation-works)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Running the App](#-running-the-app)
- [API Reference](#-api-reference)
- [Response Shapes](#-response-shapes)
- [Admin UI](#-admin-ui)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)
- [Acknowledgments](#-acknowledgments)

---

## 🎯 Overview

E-commerce businesses in Bangladesh lose money to fraudulent cash-on-delivery (COD) orders every day. Couriers like Steadfast, Pathao, RedX, Paperfly, and Carrybee each track their own delivery history, but no single one tells you the full picture.

**Courier Fraud Check** queries every courier's own API in parallel, normalizes their responses into a common currency, and produces a single blended fraud signal — plus the raw per-courier responses for full transparency.

Originally a Laravel package (`azmolla/fraud-checker-bd-courier-laravel`), it has been fully rewritten as a standalone **Express + TypeScript** service with a first-class web UI.

---

## 🌐 Live Demo

**→ [https://fraud-check.webcraft.com.bd/](https://fraud-check.webcraft.com.bd/)**

Enter any 11-digit Bangladeshi mobile number (e.g. `01712345678`) and hit **Check**.

---

## ✨ Features

### Core

- 🔍 **Multi-courier check** — Steadfast, Pathao, RedX, Paperfly, and Carrybee queried in parallel
- 🧮 **Weighted 60/40 aggregate** — Steadfast + Pathao contribute 60%, the rest contribute 40%
- 📊 **Per-courier cards** — every response rendered in its native shape, no data lost
- 🎯 **Single endpoint** — one phone number in, one unified report out
- 🔐 **Strict BD mobile validation** — `^01[3-9][0-9]{8}$`, enforced on both ends
- ⚡ **In-memory caching** — access tokens for RedX, Paperfly, and Carrybee cached for ~55 minutes

### Admin & Ops

- 🎛️ **Enable/disable couriers** at runtime via the `DISABLED_COURIERS` env var
- 📈 **Debug transparency** — every aggregate response includes a `contributions` block showing exactly what fed the numbers
- 🧠 **Smart fallbacks** — when a courier returns ratios, ratings, or nothing at all, the manager still produces a meaningful result
- ⏱️ **Timeout-tolerant** — slow couriers are dropped without blocking the rest

### UI

- 🌓 **Dark dashboard** — clean, responsive, no build step
- ↻ **Per-courier refresh** — re-check a single courier without re-running everything
- ⓘ **Inline documentation** — hover the info icon next to "Aggregate" to see the full rule
- 🎨 **Native shape rendering** — Steadfast ratios, Pathao ratings, and classic counts each get their own card design

---

## 🧮 How the Aggregation Works

Every courier returns a different shape. To produce a single score, we:

### 1. Normalize each courier into `{ success, cancel, weight, group }`

| Courier       | Signal                            | How we convert it                                               | Group | Weight                              |
| ------------- | --------------------------------- | --------------------------------------------------------------- | ----- | ----------------------------------- |
| **Steadfast** | `delivery_ratio` + `volume_range` | `total = midpoint(volume_range)`, `success = total × ratio/100` | A     | 0.9 (or 0.5 if no volume)           |
| **Pathao**    | `success_rate` + `risk_level`     | Map onto a virtual 10-order profile                             | A     | 0.7 / 0.6 / 0.5 / 0.4 / 0.3 by risk |
| **RedX**      | Native counts                     | Pass-through                                                    | B     | 1.0 (or 0.4 if empty)               |
| **Paperfly**  | Native counts                     | Pass-through                                                    | B     | 1.0 (or 0.4 if empty)               |
| **Carrybee**  | Native counts                     | Pass-through                                                    | B     | 1.0 (or 0.4 if empty)               |

### 2. Compute each group's combined ratio

For each group, weighted counts are summed and turned into a single ratio:

```
ratio_group = Σ(success × weight) / Σ((success + cancel) × weight)
```

### 3. Blend the two groups at 60/40

```
final_ratio = 0.60 × ratio_A + 0.40 × ratio_B
```

**Edge case:** if only one group has data, its ratio is used at **100%** — never scaled down to 60% or 40%. A customer with only Steadfast history shows their real Steadfast ratio, not a diluted one.

### 4. Derive the final counts

```
total_deliveries = round(observed volume across all couriers)
total_success    = round(final_ratio × total_deliveries)
total_cancel     = total_deliveries − total_success
```

### Worked example

| Courier   | Group | success | cancel | weight | weighted_s | weighted_c |
| --------- | ----- | ------- | ------ | ------ | ---------- | ---------- |
| Steadfast | A     | 5       | 0      | 0.9    | 4.5        | 0          |
| Pathao    | A     | 9.5     | 0.5    | 0.7    | 6.65       | 0.35       |
| Paperfly  | B     | 0       | 0      | 0.4    | 0          | 0          |
| Carrybee  | B     | 0       | 0      | 0.4    | 0          | 0          |

```
ratio_A = 11.15 / 11.5 = 96.96%
ratio_B = null           (no signal)
final   = 96.96%         (single-group rule)

total_deliveries = 12
total_success    = 12
total_cancel     = 0
success_ratio    = 96.96%
```

Every response also includes a **`contributions`** block showing each courier's normalized `{ success, cancel, weight, group, source }` — fully auditable.

---

## 🛠️ Tech Stack

| Layer       | Tool                                               |
| ----------- | -------------------------------------------------- |
| Runtime     | Node.js ≥ 18                                       |
| Language    | TypeScript 5.5 (strict mode)                       |
| Framework   | Express 4                                          |
| HTTP client | Axios + `axios-cookiejar-support` + `tough-cookie` |
| Cache       | `node-cache` (in-memory)                           |
| Templating  | EJS                                                |
| Dev runner  | `ts-node-dev`                                      |

---

## 📁 Project Structure

```
courier-fraud-check/
├── src/
│   ├── app.ts                        # Express app setup
│   ├── server.ts                     # listen()
│   ├── config/
│   │   └── index.ts                  # Env + config loader
│   ├── types/
│   │   └── index.ts                  # Shared interfaces
│   ├── helpers/
│   │   └── courierDataValidator.ts   # Phone + config validation
│   ├── utils/
│   │   └── cache.ts                  # node-cache wrapper
│   ├── normalizers/                  # Per-courier response → common shape
│   │   ├── types.ts
│   │   ├── steadfastNormalizer.ts
│   │   ├── pathaoNormalizer.ts
│   │   ├── redxNormalizer.ts
│   │   ├── paperflyNormalizer.ts
│   │   ├── carrybeeNormalizer.ts
│   │   └── index.ts
│   ├── services/                     # Raw API wrappers (one per courier)
│   │   ├── courierService.interface.ts
│   │   ├── steadfastService.ts
│   │   ├── pathaoService.ts
│   │   ├── redxService.ts
│   │   ├── paperflyService.ts
│   │   └── carrybeeService.ts
│   ├── managers/
│   │   └── fraudCheckerManager.ts    # Orchestrates + aggregates
│   ├── controllers/
│   │   └── fraudController.ts
│   ├── middleware/
│   │   ├── validatePhone.ts
│   │   └── errorHandler.ts
│   └── routes/
│       └── api.ts
├── views/
│   └── index.ejs                     # Single-page dashboard
├── public/
│   └── style.css
├── .env.example
├── .gitignore
├── tsconfig.json
├── package.json
└── README.md
```

### Architectural layering

```
routes → controllers → managers → services
                          ↓
                     normalizers
                          ↓
                       (aggregate)
```

- **`services/`** — thin wrappers around each courier's HTTP API. Return responses **verbatim**.
- **`normalizers/`** — pure functions that turn a courier's response into `{ success, cancel, weight, group, source }`.
- **`managers/`** — orchestrates the parallel calls, applies the 60/40 blend, produces the final report.
- **`controllers/`** — HTTP glue. No business logic.

Adding a new courier = one file in `services/`, one in `normalizers/`, one registry entry in the manager. Nothing else changes.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js ≥ 18**
- **npm** (or pnpm/yarn)
- Active accounts on the couriers you want to enable

### Install

```bash
git clone https://github.com/<your-org>/courier-fraud-check.git
cd courier-fraud-check
npm install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env` with real credentials (see [Environment Variables](#-environment-variables)).

### Run

```bash
# Development (hot reload)
npm run dev

# Production
npm run build
npm start
```

Open **http://localhost:3000**.

---

## 🔐 Environment Variables

```dotenv
# ── Server ──────────────────────────────────────────────────────────
PORT=3000

# ── Couriers to disable at runtime (comma-separated) ────────────────
# RedX is currently disabled pending API changes.
# Example: DISABLED_COURIERS=redx,carrybee
DISABLED_COURIERS=redx

# ── Steadfast ───────────────────────────────────────────────────────
STEADFAST_USER=your_steadfast_email@example.com
STEADFAST_PASSWORD=your_steadfast_password

# ── Pathao ──────────────────────────────────────────────────────────
PATHAO_USER=your_pathao_email@example.com
PATHAO_PASSWORD=your_pathao_password

# ── RedX (registered phone, no +88 prefix) ──────────────────────────
REDX_PHONE=01XXXXXXXXX
REDX_PASSWORD=your_redx_password

# ── Paperfly ────────────────────────────────────────────────────────
PAPERFLY_USER=your_paperfly_username
PAPERFLY_PASSWORD=your_paperfly_password

# ── Carrybee ────────────────────────────────────────────────────────
CARRYBEE_PHONE=01XXXXXXXXX
CARRYBEE_PASSWORD=your_carrybee_password
```

Couriers with missing credentials are automatically disabled — the app logs a warning at startup and continues. You don't need credentials for every courier.

---

## 🏃 Running the App

| Command             | Description                                |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Dev server with hot reload (`ts-node-dev`) |
| `npm run build`     | Compile TypeScript to `dist/`              |
| `npm start`         | Run the compiled production build          |
| `npm run typecheck` | Strict type check, no emit                 |

---

## 📡 API Reference

Base URL: `https://fraud-check.webcraft.com.bd/api`

### `GET /couriers`

List available couriers and their configured state.

**Response:**

```json
{
  "success": true,
  "couriers": [
    { "name": "steadfast", "configured": true },
    { "name": "pathao", "configured": true },
    { "name": "redx", "configured": false },
    { "name": "paperfly", "configured": true },
    { "name": "carrybee", "configured": true }
  ]
}
```

---

### `GET /check/:phone`

Aggregate check across all enabled couriers.

**Params:**

- `phone` — 11-digit BD mobile number (e.g. `01712345678`)

**Response:** see [Response Shapes](#-response-shapes).

---

### `GET /check/:courier/:phone`

Single-courier check.

**Params:**

- `courier` — one of `steadfast`, `pathao`, `redx`, `paperfly`, `carrybee`
- `phone` — 11-digit BD mobile number

**Response:**

```json
{
  "success": true,
  "courier": "steadfast",
  "phone": "01712345678",
  "data": {
    /* raw courier response */
  }
}
```

---

### Error responses

All errors are JSON:

```json
{
  "success": false,
  "error": "Invalid phone number. Format: 01********* (11 digits, without +88)."
}
```

| HTTP | Meaning                  |
| ---- | ------------------------ |
| 400  | Invalid phone format     |
| 404  | Unknown courier or route |
| 500  | Internal error           |

---

## 📐 Response Shapes

Each courier returns a different shape. The API returns them **verbatim** — the UI adapts to each one.

### Steadfast (ratio + bucket)

```json
{
  "delivery_ratio": 100,
  "cancellation_ratio": 0,
  "volume_band": "low",
  "volume_range": "5",
  "fraud_reports": 0,
  "fraud_categories": [],
  "fraud_keywords": [],
  "frauds": []
}
```

### Pathao (rating, v2)

```json
{
  "message": "user success rate",
  "type": "success",
  "code": 200,
  "data": {
    "version": "v2",
    "address_book": [],
    "show_count": false,
    "customer_rating": "excellent_customer",
    "risk_level": "low",
    "success_rate": 95
  }
}
```

### RedX / Paperfly / Carrybee (classic counts)

```json
{
  "success": 6,
  "cancel": 4,
  "total": 10,
  "success_ratio": 60
}
```

### Aggregate

```json
{
  "aggregate": {
    "total_success": 12,
    "total_cancel": 0,
    "total_deliveries": 12,
    "success_ratio": 96.96,
    "cancel_ratio": 3.04,
    "group_a_ratio": 96.96,
    "group_b_ratio": null,
    "group_weights": { "a": 0.6, "b": 0.4 },
    "contributions": {
      "steadfast": {
        "success": 5,
        "cancel": 0,
        "weight": 0.9,
        "group": "a",
        "source": "ratio_bucket"
      },
      "pathao": {
        "success": 9.5,
        "cancel": 0.5,
        "weight": 0.7,
        "group": "a",
        "source": "rating"
      },
      "redx": null,
      "paperfly": {
        "success": 0,
        "cancel": 0,
        "weight": 0.4,
        "group": "b",
        "source": "empty"
      },
      "carrybee": {
        "success": 0,
        "cancel": 0,
        "weight": 0.4,
        "group": "b",
        "source": "empty"
      }
    }
  }
}
```

The `contributions` and `group_*` fields are debug-level transparency. Production UIs can ignore them.

---

## 🖥️ Admin UI

The home page at `/` is a self-contained dashboard. No build step, no React, no framework — just EJS + vanilla JS + a single CSS file.

### What it does

- **Courier status strip** — shows which couriers are active/disabled, driven by `/api/couriers`
- **Phone form** — validates BD mobile numbers client-side before hitting the API
- **Aggregate panel** — final blended score with a ⓘ tooltip explaining the 60/40 rule
- **Per-courier cards** — each courier rendered in its native shape:
  - **Steadfast** → ratio bars + volume band chips
  - **Pathao** → rating badge + risk level + success rate
  - **Carrybee** → 4-column stats grid with fraud count
  - **Classic** → success / cancel / total with a progress bar
- **↻ Refresh button per card** — re-checks a single courier without re-running everything
- **Footer** — links to WebCraft with an auto-updating copyright year

### Extending the UI

The card renderer uses a `shapeOf()` detector that discriminates on response fields. If a courier changes its response shape again, the UI falls back to a raw JSON dump instead of breaking — you'll see the new shape inline and can add a branch.

---

## ☁️ Deployment

The live instance runs on a standard Node host behind HTTPS.

### General checklist

1. **Environment** — set all env vars in your hosting provider's dashboard
2. **Build** — `npm run build`
3. **Start** — `npm start` (or use a process manager like PM2 or systemd)
4. **Reverse proxy** — put Nginx/Caddy in front; forward `443` → `3000`
5. **TLS** — Let's Encrypt via Caddy or certbot
6. **Process supervision** — PM2, systemd, or your host's built-in process manager

### Example systemd unit

```ini
[Unit]
Description=Courier Fraud Check
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/var/www/fraud-check
EnvironmentFile=/var/www/fraud-check/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Example Nginx config

```nginx
server {
    listen 443 ssl http2;
    server_name fraud-check.webcraft.com.bd;

    ssl_certificate     /etc/letsencrypt/live/fraud-check.webcraft.com.bd/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fraud-check.webcraft.com.bd/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Docker (optional)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/views ./views
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

---

## 🩺 Troubleshooting

### "Courier disabled: The config key steadfast.user is required but missing"

Your `.env` is missing credentials for that courier. Either add them, or add the courier to `DISABLED_COURIERS`.

### A specific courier returns "Failed to fetch"

Check its credentials and account status. Some common causes:

- **Steadfast** — MFA became mandatory; you may need to disable it on the account or use cookie-based session. See the code for `SteadfastService`.
- **Pathao** — 401 usually means the account password changed.
- **RedX** — currently disabled project-wide due to API changes.
- **Paperfly / Carrybee** — session tokens cached for ~55 min; if you changed the password, restart the server to clear the cache.

### "views/index.ejs not found"

You're running the compiled `dist/` without copying the `views/` and `public/` directories. Either run via `ts-node-dev` in dev, or make sure your build/deploy step copies those folders into the deployed directory.

### Aggregate is all zeros but individual couriers have data

Check the `contributions` block in the response. If a courier's `source` is `"empty"`, its weight is 0.4 but its counts are 0/0 — that's correct. Zeros across the board usually means no courier returned usable history for that phone.

### TypeScript build fails on strict errors

The project runs `strict: true`. If you've added code that fails the strict checks, run `npm run typecheck` to see the exact errors. All interfaces and type guards live in `src/types/index.ts`.

---

## 🤝 Contributing

Pull requests are welcome.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Ensure `npm run typecheck` passes
4. Keep commits focused and descriptive
5. Open a PR with a clear description

If you're adding a new courier:

- Add `src/services/<courier>Service.ts` implementing `CourierService`
- Add `src/normalizers/<courier>Normalizer.ts`
- Register both in the manager and in `src/normalizers/index.ts`
- Add env vars to `.env.example`
- Update this README's courier table

---

## 📄 License

MIT © WebCraft

---

## 🙏 Acknowledgments

- Original inspiration and API discovery by **[S. Ahmad](https://github.com/ShahariarAhmad)**
- Original Laravel package: **[azmolla/fraud-checker-bd-courier-laravel](https://github.com/AbiruzzamanMolla/Fraud-Checker-BD-Courier-Laravel)**
- Express + TypeScript rewrite: **WebCraft**

---

<div align="center">

**Built with care by [WebCraft](https://webcraft.com.bd)**

_If this project helped you fight fraudulent COD orders, consider starring the repo. ⭐_

[Live Demo](https://fraud-check.webcraft.com.bd/) · [WebCraft](https://webcraft.com.bd)

</div><div align="center">

# 🛡️ Courier Fraud Check

**A unified fraud-signal aggregator for Bangladeshi courier services.**

Check a customer's delivery history across **Steadfast**, **Pathao**, **RedX**, **Paperfly**, and **Carrybee** — through one endpoint, one dashboard, one blended score.

[![Live](https://img.shields.io/badge/live-fraud--check.webcraft.com.bd-38bdf8?style=flat-square)](https://fraud-check.webcraft.com.bd/)
[![Made by WebCraft](https://img.shields.io/badge/made%20by-WebCraft-22c55e?style=flat-square)](https://webcraft.com.bd)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.5-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Live Demo](#-live-demo)
- [Features](#-features)
- [How the Aggregation Works](#-how-the-aggregation-works)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Running the App](#-running-the-app)
- [API Reference](#-api-reference)
- [Response Shapes](#-response-shapes)
- [Admin UI](#-admin-ui)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)
- [Acknowledgments](#-acknowledgments)

---

## 🎯 Overview

E-commerce businesses in Bangladesh lose money to fraudulent cash-on-delivery (COD) orders every day. Couriers like Steadfast, Pathao, RedX, Paperfly, and Carrybee each track their own delivery history, but no single one tells you the full picture.

**Courier Fraud Check** queries every courier's own API in parallel, normalizes their responses into a common currency, and produces a single blended fraud signal — plus the raw per-courier responses for full transparency.

Originally a Laravel package (`azmolla/fraud-checker-bd-courier-laravel`), it has been fully rewritten as a standalone **Express + TypeScript** service with a first-class web UI.

---

## 🌐 Live Demo

**→ [https://fraud-check.webcraft.com.bd/](https://fraud-check.webcraft.com.bd/)**

Enter any 11-digit Bangladeshi mobile number (e.g. `01712345678`) and hit **Check**.

---

## ✨ Features

### Core

- 🔍 **Multi-courier check** — Steadfast, Pathao, RedX, Paperfly, and Carrybee queried in parallel
- 🧮 **Weighted 60/40 aggregate** — Steadfast + Pathao contribute 60%, the rest contribute 40%
- 📊 **Per-courier cards** — every response rendered in its native shape, no data lost
- 🎯 **Single endpoint** — one phone number in, one unified report out
- 🔐 **Strict BD mobile validation** — `^01[3-9][0-9]{8}$`, enforced on both ends
- ⚡ **In-memory caching** — access tokens for RedX, Paperfly, and Carrybee cached for ~55 minutes

### Admin & Ops

- 🎛️ **Enable/disable couriers** at runtime via the `DISABLED_COURIERS` env var
- 📈 **Debug transparency** — every aggregate response includes a `contributions` block showing exactly what fed the numbers
- 🧠 **Smart fallbacks** — when a courier returns ratios, ratings, or nothing at all, the manager still produces a meaningful result
- ⏱️ **Timeout-tolerant** — slow couriers are dropped without blocking the rest

### UI

- 🌓 **Dark dashboard** — clean, responsive, no build step
- ↻ **Per-courier refresh** — re-check a single courier without re-running everything
- ⓘ **Inline documentation** — hover the info icon next to "Aggregate" to see the full rule
- 🎨 **Native shape rendering** — Steadfast ratios, Pathao ratings, and classic counts each get their own card design

---

## 🧮 How the Aggregation Works

Every courier returns a different shape. To produce a single score, we:

### 1. Normalize each courier into `{ success, cancel, weight, group }`

| Courier       | Signal                            | How we convert it                                               | Group | Weight                              |
| ------------- | --------------------------------- | --------------------------------------------------------------- | ----- | ----------------------------------- |
| **Steadfast** | `delivery_ratio` + `volume_range` | `total = midpoint(volume_range)`, `success = total × ratio/100` | A     | 0.9 (or 0.5 if no volume)           |
| **Pathao**    | `success_rate` + `risk_level`     | Map onto a virtual 10-order profile                             | A     | 0.7 / 0.6 / 0.5 / 0.4 / 0.3 by risk |
| **RedX**      | Native counts                     | Pass-through                                                    | B     | 1.0 (or 0.4 if empty)               |
| **Paperfly**  | Native counts                     | Pass-through                                                    | B     | 1.0 (or 0.4 if empty)               |
| **Carrybee**  | Native counts                     | Pass-through                                                    | B     | 1.0 (or 0.4 if empty)               |

### 2. Compute each group's combined ratio

For each group, weighted counts are summed and turned into a single ratio:

```
ratio_group = Σ(success × weight) / Σ((success + cancel) × weight)
```

### 3. Blend the two groups at 60/40

```
final_ratio = 0.60 × ratio_A + 0.40 × ratio_B
```

**Edge case:** if only one group has data, its ratio is used at **100%** — never scaled down to 60% or 40%. A customer with only Steadfast history shows their real Steadfast ratio, not a diluted one.

### 4. Derive the final counts

```
total_deliveries = round(observed volume across all couriers)
total_success    = round(final_ratio × total_deliveries)
total_cancel     = total_deliveries − total_success
```

### Worked example

| Courier   | Group | success | cancel | weight | weighted_s | weighted_c |
| --------- | ----- | ------- | ------ | ------ | ---------- | ---------- |
| Steadfast | A     | 5       | 0      | 0.9    | 4.5        | 0          |
| Pathao    | A     | 9.5     | 0.5    | 0.7    | 6.65       | 0.35       |
| Paperfly  | B     | 0       | 0      | 0.4    | 0          | 0          |
| Carrybee  | B     | 0       | 0      | 0.4    | 0          | 0          |

```
ratio_A = 11.15 / 11.5 = 96.96%
ratio_B = null           (no signal)
final   = 96.96%         (single-group rule)

total_deliveries = 12
total_success    = 12
total_cancel     = 0
success_ratio    = 96.96%
```

Every response also includes a **`contributions`** block showing each courier's normalized `{ success, cancel, weight, group, source }` — fully auditable.

---

## 🛠️ Tech Stack

| Layer       | Tool                                               |
| ----------- | -------------------------------------------------- |
| Runtime     | Node.js ≥ 18                                       |
| Language    | TypeScript 5.5 (strict mode)                       |
| Framework   | Express 4                                          |
| HTTP client | Axios + `axios-cookiejar-support` + `tough-cookie` |
| Cache       | `node-cache` (in-memory)                           |
| Templating  | EJS                                                |
| Dev runner  | `ts-node-dev`                                      |

---

## 📁 Project Structure

```
courier-fraud-check/
├── src/
│   ├── app.ts                        # Express app setup
│   ├── server.ts                     # listen()
│   ├── config/
│   │   └── index.ts                  # Env + config loader
│   ├── types/
│   │   └── index.ts                  # Shared interfaces
│   ├── helpers/
│   │   └── courierDataValidator.ts   # Phone + config validation
│   ├── utils/
│   │   └── cache.ts                  # node-cache wrapper
│   ├── normalizers/                  # Per-courier response → common shape
│   │   ├── types.ts
│   │   ├── steadfastNormalizer.ts
│   │   ├── pathaoNormalizer.ts
│   │   ├── redxNormalizer.ts
│   │   ├── paperflyNormalizer.ts
│   │   ├── carrybeeNormalizer.ts
│   │   └── index.ts
│   ├── services/                     # Raw API wrappers (one per courier)
│   │   ├── courierService.interface.ts
│   │   ├── steadfastService.ts
│   │   ├── pathaoService.ts
│   │   ├── redxService.ts
│   │   ├── paperflyService.ts
│   │   └── carrybeeService.ts
│   ├── managers/
│   │   └── fraudCheckerManager.ts    # Orchestrates + aggregates
│   ├── controllers/
│   │   └── fraudController.ts
│   ├── middleware/
│   │   ├── validatePhone.ts
│   │   └── errorHandler.ts
│   └── routes/
│       └── api.ts
├── views/
│   └── index.ejs                     # Single-page dashboard
├── public/
│   └── style.css
├── .env.example
├── .gitignore
├── tsconfig.json
├── package.json
└── README.md
```

### Architectural layering

```
routes → controllers → managers → services
                          ↓
                     normalizers
                          ↓
                       (aggregate)
```

- **`services/`** — thin wrappers around each courier's HTTP API. Return responses **verbatim**.
- **`normalizers/`** — pure functions that turn a courier's response into `{ success, cancel, weight, group, source }`.
- **`managers/`** — orchestrates the parallel calls, applies the 60/40 blend, produces the final report.
- **`controllers/`** — HTTP glue. No business logic.

Adding a new courier = one file in `services/`, one in `normalizers/`, one registry entry in the manager. Nothing else changes.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js ≥ 18**
- **npm** (or pnpm/yarn)
- Active accounts on the couriers you want to enable

### Install

```bash
git clone https://github.com/<your-org>/courier-fraud-check.git
cd courier-fraud-check
npm install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env` with real credentials (see [Environment Variables](#-environment-variables)).

### Run

```bash
# Development (hot reload)
npm run dev

# Production
npm run build
npm start
```

Open **http://localhost:3000**.

---

## 🔐 Environment Variables

```dotenv
# ── Server ──────────────────────────────────────────────────────────
PORT=3000

# ── Couriers to disable at runtime (comma-separated) ────────────────
# RedX is currently disabled pending API changes.
# Example: DISABLED_COURIERS=redx,carrybee
DISABLED_COURIERS=redx

# ── Steadfast ───────────────────────────────────────────────────────
STEADFAST_USER=your_steadfast_email@example.com
STEADFAST_PASSWORD=your_steadfast_password

# ── Pathao ──────────────────────────────────────────────────────────
PATHAO_USER=your_pathao_email@example.com
PATHAO_PASSWORD=your_pathao_password

# ── RedX (registered phone, no +88 prefix) ──────────────────────────
REDX_PHONE=01XXXXXXXXX
REDX_PASSWORD=your_redx_password

# ── Paperfly ────────────────────────────────────────────────────────
PAPERFLY_USER=your_paperfly_username
PAPERFLY_PASSWORD=your_paperfly_password

# ── Carrybee ────────────────────────────────────────────────────────
CARRYBEE_PHONE=01XXXXXXXXX
CARRYBEE_PASSWORD=your_carrybee_password
```

Couriers with missing credentials are automatically disabled — the app logs a warning at startup and continues. You don't need credentials for every courier.

---

## 🏃 Running the App

| Command             | Description                                |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Dev server with hot reload (`ts-node-dev`) |
| `npm run build`     | Compile TypeScript to `dist/`              |
| `npm start`         | Run the compiled production build          |
| `npm run typecheck` | Strict type check, no emit                 |

---

## 📡 API Reference

Base URL: `https://fraud-check.webcraft.com.bd/api`

### `GET /couriers`

List available couriers and their configured state.

**Response:**

```json
{
  "success": true,
  "couriers": [
    { "name": "steadfast", "configured": true },
    { "name": "pathao", "configured": true },
    { "name": "redx", "configured": false },
    { "name": "paperfly", "configured": true },
    { "name": "carrybee", "configured": true }
  ]
}
```

---

### `GET /check/:phone`

Aggregate check across all enabled couriers.

**Params:**

- `phone` — 11-digit BD mobile number (e.g. `01712345678`)

**Response:** see [Response Shapes](#-response-shapes).

---

### `GET /check/:courier/:phone`

Single-courier check.

**Params:**

- `courier` — one of `steadfast`, `pathao`, `redx`, `paperfly`, `carrybee`
- `phone` — 11-digit BD mobile number

**Response:**

```json
{
  "success": true,
  "courier": "steadfast",
  "phone": "01712345678",
  "data": {
    /* raw courier response */
  }
}
```

---

### Error responses

All errors are JSON:

```json
{
  "success": false,
  "error": "Invalid phone number. Format: 01********* (11 digits, without +88)."
}
```

| HTTP | Meaning                  |
| ---- | ------------------------ |
| 400  | Invalid phone format     |
| 404  | Unknown courier or route |
| 500  | Internal error           |

---

## 📐 Response Shapes

Each courier returns a different shape. The API returns them **verbatim** — the UI adapts to each one.

### Steadfast (ratio + bucket)

```json
{
  "delivery_ratio": 100,
  "cancellation_ratio": 0,
  "volume_band": "low",
  "volume_range": "5",
  "fraud_reports": 0,
  "fraud_categories": [],
  "fraud_keywords": [],
  "frauds": []
}
```

### Pathao (rating, v2)

```json
{
  "message": "user success rate",
  "type": "success",
  "code": 200,
  "data": {
    "version": "v2",
    "address_book": [],
    "show_count": false,
    "customer_rating": "excellent_customer",
    "risk_level": "low",
    "success_rate": 95
  }
}
```

### RedX / Paperfly / Carrybee (classic counts)

```json
{
  "success": 6,
  "cancel": 4,
  "total": 10,
  "success_ratio": 60
}
```

### Aggregate

```json
{
  "aggregate": {
    "total_success": 12,
    "total_cancel": 0,
    "total_deliveries": 12,
    "success_ratio": 96.96,
    "cancel_ratio": 3.04,
    "group_a_ratio": 96.96,
    "group_b_ratio": null,
    "group_weights": { "a": 0.6, "b": 0.4 },
    "contributions": {
      "steadfast": {
        "success": 5,
        "cancel": 0,
        "weight": 0.9,
        "group": "a",
        "source": "ratio_bucket"
      },
      "pathao": {
        "success": 9.5,
        "cancel": 0.5,
        "weight": 0.7,
        "group": "a",
        "source": "rating"
      },
      "redx": null,
      "paperfly": {
        "success": 0,
        "cancel": 0,
        "weight": 0.4,
        "group": "b",
        "source": "empty"
      },
      "carrybee": {
        "success": 0,
        "cancel": 0,
        "weight": 0.4,
        "group": "b",
        "source": "empty"
      }
    }
  }
}
```

The `contributions` and `group_*` fields are debug-level transparency. Production UIs can ignore them.

---

## 🖥️ Admin UI

The home page at `/` is a self-contained dashboard. No build step, no React, no framework — just EJS + vanilla JS + a single CSS file.

### What it does

- **Courier status strip** — shows which couriers are active/disabled, driven by `/api/couriers`
- **Phone form** — validates BD mobile numbers client-side before hitting the API
- **Aggregate panel** — final blended score with a ⓘ tooltip explaining the 60/40 rule
- **Per-courier cards** — each courier rendered in its native shape:
  - **Steadfast** → ratio bars + volume band chips
  - **Pathao** → rating badge + risk level + success rate
  - **Carrybee** → 4-column stats grid with fraud count
  - **Classic** → success / cancel / total with a progress bar
- **↻ Refresh button per card** — re-checks a single courier without re-running everything
- **Footer** — links to WebCraft with an auto-updating copyright year

### Extending the UI

The card renderer uses a `shapeOf()` detector that discriminates on response fields. If a courier changes its response shape again, the UI falls back to a raw JSON dump instead of breaking — you'll see the new shape inline and can add a branch.

---

## ☁️ Deployment

The live instance runs on a standard Node host behind HTTPS.

### General checklist

1. **Environment** — set all env vars in your hosting provider's dashboard
2. **Build** — `npm run build`
3. **Start** — `npm start` (or use a process manager like PM2 or systemd)
4. **Reverse proxy** — put Nginx/Caddy in front; forward `443` → `3000`
5. **TLS** — Let's Encrypt via Caddy or certbot
6. **Process supervision** — PM2, systemd, or your host's built-in process manager

### Example systemd unit

```ini
[Unit]
Description=Courier Fraud Check
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/var/www/fraud-check
EnvironmentFile=/var/www/fraud-check/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Example Nginx config

```nginx
server {
    listen 443 ssl http2;
    server_name fraud-check.webcraft.com.bd;

    ssl_certificate     /etc/letsencrypt/live/fraud-check.webcraft.com.bd/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fraud-check.webcraft.com.bd/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Docker (optional)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/views ./views
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

---

## 🩺 Troubleshooting

### "Courier disabled: The config key steadfast.user is required but missing"

Your `.env` is missing credentials for that courier. Either add them, or add the courier to `DISABLED_COURIERS`.

### A specific courier returns "Failed to fetch"

Check its credentials and account status. Some common causes:

- **Steadfast** — MFA became mandatory; you may need to disable it on the account or use cookie-based session. See the code for `SteadfastService`.
- **Pathao** — 401 usually means the account password changed.
- **RedX** — currently disabled project-wide due to API changes.
- **Paperfly / Carrybee** — session tokens cached for ~55 min; if you changed the password, restart the server to clear the cache.

### "views/index.ejs not found"

You're running the compiled `dist/` without copying the `views/` and `public/` directories. Either run via `ts-node-dev` in dev, or make sure your build/deploy step copies those folders into the deployed directory.

### Aggregate is all zeros but individual couriers have data

Check the `contributions` block in the response. If a courier's `source` is `"empty"`, its weight is 0.4 but its counts are 0/0 — that's correct. Zeros across the board usually means no courier returned usable history for that phone.

### TypeScript build fails on strict errors

The project runs `strict: true`. If you've added code that fails the strict checks, run `npm run typecheck` to see the exact errors. All interfaces and type guards live in `src/types/index.ts`.

---

## 🤝 Contributing

Pull requests are welcome.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Ensure `npm run typecheck` passes
4. Keep commits focused and descriptive
5. Open a PR with a clear description

If you're adding a new courier:

- Add `src/services/<courier>Service.ts` implementing `CourierService`
- Add `src/normalizers/<courier>Normalizer.ts`
- Register both in the manager and in `src/normalizers/index.ts`
- Add env vars to `.env.example`
- Update this README's courier table

---

## 📄 License

MIT © WebCraft

---

## 🙏 Acknowledgments

- Original inspiration and API discovery by **[S. Ahmad](https://github.com/ShahariarAhmad)**
- Original Laravel package: **[azmolla/fraud-checker-bd-courier-laravel](https://github.com/AbiruzzamanMolla/Fraud-Checker-BD-Courier-Laravel)**
- Express + TypeScript rewrite: **WebCraft**

---

<div align="center">

**Built with care by [WebCraft](https://webcraft.com.bd)**

_If this project helped you fight fraudulent COD orders, consider starring the repo. ⭐_

[Live Demo](https://fraud-check.webcraft.com.bd/) · [WebCraft](https://webcraft.com.bd)

</div>
