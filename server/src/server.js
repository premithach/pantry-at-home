import "dotenv/config";
import cors from "cors";
import express from "express";
import OpenAI from "openai";
import { prisma } from "./config/prisma.js";
import { buildPantryRecipeSuggestions } from "./services/recipeSuggestions.js";

const app = express();
const port = Number(process.env.PORT || 5050);
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    next(error);
  }
});

const parseId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const pantryCategories = ["Produce", "Dairy", "Pantry", "Protein", "Bakery", "Other"];

function ingredientFilters(query) {
  const where = {};
  if (query.userId !== undefined) {
    const userId = parseId(query.userId);
    if (!userId) return { error: "userId must be a positive integer." };
    where.userId = userId;
  }
  if (query.category && query.category !== "All items") {
    if (!pantryCategories.includes(query.category)) return { error: `category must be one of: ${pantryCategories.join(", ")}.` };
    where.category = query.category === "Other" ? null : query.category;
  }
  if (query.q !== undefined) {
    if (typeof query.q !== "string" || query.q.length > 100) return { error: "q must be a search string of at most 100 characters." };
    if (query.q.trim()) where.name = { contains: query.q.trim() };
  }
  return { where };
}

function validateIngredient(body, { partial = false } = {}) {
  const data = {};
  const errors = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { data, errors: { body: "Request body must be a JSON object." } };
  }

  if (!partial || Object.hasOwn(body, "name")) {
    if (typeof body.name !== "string" || !body.name.trim()) errors.name = "Name is required.";
    else data.name = body.name.trim();
  }
  if (!partial || Object.hasOwn(body, "quantity")) {
    const quantity = typeof body.quantity === "string" && body.quantity.trim() ? Number(body.quantity) : body.quantity;
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0) errors.quantity = "Quantity must be a non-negative number.";
    else data.quantity = quantity;
  }
  if (!partial || Object.hasOwn(body, "unit")) {
    if (typeof body.unit !== "string" || !body.unit.trim()) errors.unit = "Unit is required.";
    else data.unit = body.unit.trim();
  }
  if (Object.hasOwn(body, "category")) {
    if (body.category !== null && (typeof body.category !== "string" || !pantryCategories.includes(body.category.trim()))) errors.category = `Category must be null or one of: ${pantryCategories.join(", ")}.`;
    else data.category = body.category?.trim() || null;
  }
  if (Object.hasOwn(body, "expiryDate")) {
    if (body.expiryDate === null || body.expiryDate === "") data.expiryDate = null;
    else if (typeof body.expiryDate !== "string" || Number.isNaN(Date.parse(body.expiryDate))) errors.expiryDate = "Expiry date must be a valid date string or null.";
    else data.expiryDate = new Date(body.expiryDate);
  }
  if (!partial || Object.hasOwn(body, "userId")) {
    const userId = typeof body.userId === "string" && body.userId.trim() ? Number(body.userId) : body.userId;
    if (!Number.isSafeInteger(userId) || userId <= 0) errors.userId = "A positive integer userId is required.";
    else data.userId = userId;
  }

  return { data, errors };
}

app.get("/api/ingredients", async (req, res, next) => {
  try {
    const { where, error } = ingredientFilters(req.query);
    if (error) return res.status(400).json({ error });
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder || "desc";
    if (!["createdAt", "name", "expiryDate", "quantity"].includes(sortBy)) return res.status(400).json({ error: "sortBy must be createdAt, name, expiryDate, or quantity." });
    if (!["asc", "desc"].includes(sortOrder)) return res.status(400).json({ error: "sortOrder must be asc or desc." });
    const ingredients = await prisma.ingredient.findMany({ where, orderBy: { [sortBy]: sortOrder } });
    res.json(ingredients);
  } catch (error) {
    next(error);
  }
});

app.get("/api/ingredients/summary", async (req, res, next) => {
  try {
    const { where, error } = ingredientFilters(req.query);
    if (error) return res.status(400).json({ error });
    const days = req.query.days === undefined ? 4 : Number(req.query.days);
    if (!Number.isInteger(days) || days < 1 || days > 60) return res.status(400).json({ error: "days must be an integer from 1 to 60." });
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const until = new Date(now);
    until.setUTCDate(until.getUTCDate() + days);
    until.setUTCHours(23, 59, 59, 999);
    const past = new Date(now.getTime() - 1);
    const expiringItems = await prisma.ingredient.findMany({
      where: { ...where, expiryDate: { gte: now, lte: until } },
      orderBy: { expiryDate: "asc" },
      take: 5,
      select: { id: true, name: true, expiryDate: true },
    });
    const total = await prisma.ingredient.count({ where });
    const expiringSoon = await prisma.ingredient.count({ where: { ...where, expiryDate: { gte: now, lte: until } } });
    const expired = await prisma.ingredient.count({ where: { ...where, expiryDate: { lte: past } } });
    res.json({ total, expiringSoon, expired, freshnessPercent: total ? Math.round(((total - expiringSoon - expired) / total) * 100) : 100, days, expiringItems });
  } catch (error) {
    next(error);
  }
});

app.get("/api/ingredients/categories", async (req, res, next) => {
  try {
    const { where, error } = ingredientFilters({ ...req.query, category: undefined, q: undefined });
    if (error) return res.status(400).json({ error });
    const rows = await prisma.ingredient.findMany({ where, select: { category: true } });
    const counts = new Map();
    for (const row of rows) {
      const name = pantryCategories.includes(row.category) ? row.category : "Other";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    res.json({ total: rows.length, categories: [{ name: "All items", count: rows.length }, ...pantryCategories.map((name) => ({ name, count: counts.get(name) || 0 }))] });
  } catch (error) {
    next(error);
  }
});

app.get("/api/ingredients/grouped", async (req, res, next) => {
  try {
    const { where, error } = ingredientFilters({ ...req.query, category: undefined, q: undefined });
    if (error) return res.status(400).json({ error });
    const ingredients = await prisma.ingredient.findMany({ where, orderBy: { name: "asc" } });
    const groups = new Map(pantryCategories.map((category) => [category, []]));
    for (const ingredient of ingredients) {
      const category = pantryCategories.includes(ingredient.category) ? ingredient.category : "Other";
      groups.get(category).push(ingredient);
    }
    res.json(pantryCategories.map((category) => ({ category, count: groups.get(category).length, items: groups.get(category) })).filter((group) => group.count));
  } catch (error) {
    next(error);
  }
});

app.get("/api/ingredients/:id", async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "id must be a positive integer." });
  try {
    const ingredient = await prisma.ingredient.findUnique({ where: { id } });
    if (!ingredient) return res.status(404).json({ error: "Ingredient not found." });
    res.json(ingredient);
  } catch (error) {
    next(error);
  }
});

app.post("/api/ingredients", async (req, res, next) => {
  try {
    const { data, errors } = validateIngredient(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: "Validation failed.", details: errors });
    const ingredient = await prisma.ingredient.create({ data });
    res.status(201).json(ingredient);
  } catch (error) {
    next(error);
  }
});

app.put("/api/ingredients/:id", async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "id must be a positive integer." });
  try {
    const { data, errors } = validateIngredient(req.body, { partial: true });
    if (Object.keys(errors).length) return res.status(400).json({ error: "Validation failed.", details: errors });
    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Provide at least one ingredient field to update." });
    const ingredient = await prisma.ingredient.update({ where: { id }, data });
    res.json(ingredient);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/ingredients/:id", async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "id must be a positive integer." });
  try {
    await prisma.ingredient.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/recipes/suggestions", async (req, res) => {
  const ingredients = req.body?.ingredients;
  if (!Array.isArray(ingredients) || ingredients.length === 0 || ingredients.length > 100 || ingredients.some((item) => typeof item !== "string" || !item.trim() || item.length > 80)) {
    return res.status(400).json({ error: "ingredients must be a list of 1 to 100 ingredient names." });
  }
  const dietaryPreference = typeof req.body?.dietaryPreference === "string" ? req.body.dietaryPreference : "No preference";
  const allowedPreferences = ["No preference", "Vegetarian", "Vegan", "Gluten-free", "Dairy-free"];
  if (!allowedPreferences.includes(dietaryPreference)) return res.status(400).json({ error: `dietaryPreference must be one of: ${allowedPreferences.join(", ")}.` });
  const rawPrioritize = req.body?.prioritize ?? [];
  if (!Array.isArray(rawPrioritize) || rawPrioritize.length > 20 || rawPrioritize.some((name) => typeof name !== "string" || !name.trim() || name.length > 80)) {
    return res.status(400).json({ error: "prioritize must be a list of up to 20 ingredient names, each at most 80 characters." });
  }
  const prioritize = rawPrioritize;
  const fallback = (notice) => {
    const suggestions = buildPantryRecipeSuggestions(ingredients, { dietaryPreference, prioritize });
    const fallbackNotice = suggestions.recipes.length ? notice : `No pantry ideas matched your ${dietaryPreference.toLowerCase()} preference yet. Add a few suitable ingredients and try again.`;
    return res.json({ ...suggestions, source: "pantry-fallback", notice: fallbackNotice });
  };
  if (!openai) return fallback("AI suggestions are unavailable right now. These ideas are based on your pantry items.");
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "Suggest three practical recipes using the user's pantry ingredients. Respect the dietary preference. Prefer using ingredients that are expiring soon. Return only JSON: {\"recipes\":[{\"title\":string,\"description\":string,\"minutes\":number,\"ingredients\":string[],\"steps\":string[]}]}. Mention any extra ingredients as optional." },
        { role: "user", content: `Dietary preference: ${dietaryPreference}. Use soon: ${prioritize.join(", ") || "none specified"}. Available ingredients: ${ingredients.join(", ")}` },
      ],
      response_format: { type: "json_object" },
    }, { timeout: 45000 });
    const content = completion.choices[0]?.message?.content;
    if (!content) return fallback("The recipe service returned an empty response. These ideas are based on your pantry items.");
    let result;
    try {
      result = JSON.parse(content);
    } catch {
      return fallback("The recipe service returned an invalid response. These ideas are based on your pantry items.");
    }
    if (!Array.isArray(result.recipes)) return fallback("The recipe service returned an unexpected response. These ideas are based on your pantry items.");
    res.json(result);
  } catch (error) {
    console.error("Recipe suggestion provider error", { status: error.status, code: error.code, type: error.type });
    if (error.status === 401 || error.status === 403) {
      return fallback("OpenAI access is unavailable. These ideas are based on your pantry items.");
    }
    if (error.status === 404) {
      return fallback("The configured recipe model is unavailable. These ideas are based on your pantry items.");
    }
    if (error.status === 429) {
      return fallback("OpenAI is rate limited or out of quota. These ideas are based on your pantry items.");
    }
    return fallback("The recipe service is unavailable. These ideas are based on your pantry items.");
  }
});

app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.parse.failed") return res.status(400).json({ error: "Request body must contain valid JSON." });
  if (error?.code === "P2025") return res.status(404).json({ error: "Ingredient not found." });
  if (error?.code === "P2003") return res.status(400).json({ error: "Referenced user does not exist." });
  console.error(error);
  res.status(500).json({ error: "Internal server error." });
});

const server = app.listen(port, () => console.log(`Pantry API listening on port ${port}`));

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
