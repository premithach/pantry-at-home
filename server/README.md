# Pantry API

Node.js ES-module API for the Pantry web app. It uses Express, Prisma 7, and MySQL 8. The default port is `5050` because port `5000` may be occupied by macOS services.

## Configure and run

Copy `.env.example` to `.env` and replace the MySQL connection placeholders in `DATABASE_URL`. `OPENAI_API_KEY` enables provider-generated recipe ideas; `OPENAI_MODEL`, `PORT`, and `CLIENT_ORIGIN` are optional.

```sh
npm install
npm run db:generate
npm run dev
```

The client Vite dev server forwards `/api` to `http://localhost:5050`. Pantry uses user ID `1` by default in browser storage, so a matching user record must exist before creating ingredients.

## Routes

- `GET /api/health` — API and database status
- `GET /api/ingredients` — list ingredients; optional `userId`, `category`, `q`, `sortBy`, and `sortOrder` query parameters
- `GET /api/ingredients/:id` — fetch an ingredient for editing
- `POST /api/ingredients` — create an ingredient (`name`, `quantity`, `unit`, `userId`; optional `category`, `expiryDate`)
- `PUT /api/ingredients/:id` — update supplied ingredient fields
- `DELETE /api/ingredients/:id` — delete an ingredient
- `GET /api/ingredients/summary?userId=1&days=4` — total, upcoming expiry count, expired count, freshness, and upcoming items
- `GET /api/ingredients/categories?userId=1` — category counts
- `GET /api/ingredients/grouped?userId=1` — ingredients grouped by category
- `POST /api/recipes/suggestions` — request ideas with `{ "ingredients": [], "dietaryPreference": "No preference", "prioritize": [] }`

List sort fields are `createdAt`, `name`, `expiryDate`, and `quantity`; sort order is `asc` or `desc`. Categories are `Produce`, `Dairy`, `Pantry`, `Protein`, `Bakery`, and `Other` (or `null`). Recipe dietary preferences are `No preference`, `Vegetarian`, `Vegan`, `Gluten-free`, and `Dairy-free`.

Invalid fields return `400`, missing ingredients return `404`, and unexpected errors return `500`. If OpenAI is unavailable or rate limited, the recipe endpoint returns local pantry-based ideas with a notice when compatible ideas can be built. The provider request has a 45-second timeout.

The API does not yet implement login or authentication. Ingredient photos and the shopping list are browser-local features and are not stored by this API.
