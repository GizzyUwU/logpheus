import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./migrations",
  dbCredentials: {
    url: process.env["DB_URL"] || "",
  },
  casing: "snake_case",
  schema: "./src/schema/**/*.ts",
});
