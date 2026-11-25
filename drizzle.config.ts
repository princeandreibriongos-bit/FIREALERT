import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

// Migrations use the direct (unpooled) Neon URL per Neon postgres guidance.
const url = (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "").trim();
if (!url) {
  throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in web/.env.local (neon env pull)");
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
