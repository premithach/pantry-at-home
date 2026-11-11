import { prisma } from "./config/prisma.js";

try {
  await prisma.$connect();
  console.log("MySQL connected successfully!");
} catch (error) {
  console.error("Database connection failed:", error);
} finally {
  await prisma.$disconnect();
}
