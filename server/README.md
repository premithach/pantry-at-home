# Pantry API and deployment notes

This folder contains the API used by the Pantry website. It stores pantry items and provides recipe ideas. The first Pantry account is created from environment settings during setup.

## Run on your computer

Copy `.env.example` to `.env`. Set `DATABASE_URL` to your MySQL connection. If `PANTRY_ACCESS_PASSWORD` is not set, local setup uses `pantry-local-only`. You can sign in with the email in `DEFAULT_USER_EMAIL` (default: `owner@pantry.local`) and that password.

```sh
npm install
npm run db:generate
npm run db:deploy
npm run dev
```

The API runs on port `5050` by default. The database setup creates the Pantry account with ID `1`. Running the seed step again updates its email, display name, and password from the environment settings.

## Deploy the API on Railway

Create a Railway project from the GitHub repository and add a MySQL database. Add an API service from the same repository and set its **Root Directory** to `server`.

Set these commands for the API service:

- **Build:** `npm ci --include=dev && npm run db:generate`
- **Pre-deploy:** `npm run db:deploy`
- **Start:** `npm start`

Add these service variables in Railway:

- `DATABASE_URL` — reference the MySQL service's private `MYSQL_URL`, for example `${{MySQL.MYSQL_URL}}` (use the actual name of your database service).
- `NODE_ENV=production`
- `CLIENT_ORIGIN` — the exact public Vercel website address, such as `https://your-site.vercel.app`.
- `DEFAULT_USER_NAME` — the name shown for the initial pantry account.
- `DEFAULT_USER_EMAIL` — the email used to sign in.
- `PANTRY_ACCESS_PASSWORD` — a strong password for that account.
- `PANTRY_SESSION_SECRET` — a separate long, random value used to sign expiring login sessions.
- `OPENAI_API_KEY` — optional; without it, Pantry tries local recipe ideas.
- `OPENAI_MODEL` — optional; defaults to `gpt-4o-mini`.

Railway supplies the API port automatically. Keep the database private and use its internal connection URL.

## Deploy the website on Vercel

Create a Vercel project from the same GitHub repository and set **Root Directory** to `client`. Vercel detects Vite; use build command `npm run build` and output folder `dist`.

Set `VITE_API_BASE_URL` to the public Railway API address, for example `https://your-api.up.railway.app`. This is a public address, not a secret.

After Vercel gives the site its address, set the API's `CLIENT_ORIGIN` to that exact address and redeploy the API. If the website address changes later, update this setting too.

## Sign-in and access

The website has a simple email and password sign-in screen with a **Create an account** option. New users can enter their name, email, and a password of at least 12 characters; Pantry creates their account and signs them in. Each account can see and change only its own pantry items. The first account is still created by the database seed step using `DEFAULT_USER_EMAIL` and `PANTRY_ACCESS_PASSWORD`. Passwords are stored as hashes. Sessions expire after 12 hours. Email verification and password reset are not available yet.

The API requires a valid session for pantry and recipe routes. The health check stays public for deployment checks. It only allows the signed-in account to access its own pantry items. Use HTTPS on both services and never commit `.env` files or put `PANTRY_ACCESS_PASSWORD`, `PANTRY_SESSION_SECRET`, or `OPENAI_API_KEY` in Vercel. Only `VITE_API_BASE_URL` belongs in the website settings.

## API routes

- `GET /api/health` — check API and database connectivity
- `POST /api/auth/login` — sign in with `{ "email": "...", "password": "..." }`
- `POST /api/auth/signup` — create an account with `{ "name": "...", "email": "...", "password": "..." }`
- `GET /api/auth/session` — check the current sign-in
- `GET /api/ingredients` — list, filter, search, and sort ingredients
- `GET /api/ingredients/:id` — fetch one pantry item
- `POST /api/ingredients` — add an item
- `PUT /api/ingredients/:id` — update an item
- `DELETE /api/ingredients/:id` — remove an item
- `GET /api/ingredients/summary` — item totals and expiry counts
- `GET /api/ingredients/categories` — category counts
- `GET /api/ingredients/grouped` — items grouped by category
- `POST /api/recipes/suggestions` — request recipe ideas

List sorting supports `createdAt`, `name`, `expiryDate`, and `quantity`, with `sortOrder=asc` or `sortOrder=desc`. Recipe preferences are `No preference`, `Vegetarian`, `Vegan`, `Gluten-free`, or `Dairy-free`. The summary accepts `days` from 1 to 60.

## Checks

```sh
npm run check
node --check src/seed.js
```
