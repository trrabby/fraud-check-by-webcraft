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
