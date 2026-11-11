import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import { prisma } from "./config/prisma.js";

const password = process.env.PANTRY_ACCESS_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "pantry-local-only");
if (password.length < 12) {
  throw new Error("Set PANTRY_ACCESS_PASSWORD to at least 12 characters before seeding the pantry.");
}

const salt = randomBytes(16).toString("hex");
const passwordHash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const email = (process.env.DEFAULT_USER_EMAIL || "owner@pantry.local").trim().toLowerCase();
const existing = await prisma.user.findUnique({ where: { id: 1 } });
if (existing) {
  await prisma.user.update({ where: { id: 1 }, data: { email, name: process.env.DEFAULT_USER_NAME || existing.name, passwordHash } });
  console.log("Updated the Pantry sign-in account.");
} else {
  await prisma.user.create({
    data: {
      id: 1,
      name: process.env.DEFAULT_USER_NAME || "My kitchen",
      email,
      passwordHash,
    },
  });
  console.log("Created the default Pantry owner.");
}
await prisma.$disconnect();
