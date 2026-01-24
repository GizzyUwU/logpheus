import { defineConfig } from "drizzle-kit";
const usePgLite = process.env.PGLITE === "false" && process.env.DB_URL && process.env.DB_URL.length > 0;

export default defineConfig({
    dialect: 'postgresql',
    driver: usePgLite ? undefined : "pglite",
    out: "./migrations",
    dbCredentials: usePgLite
        ? {
            url: process.env.DB_URL || ""
        }
        : { url: "./cache/pg" },
    casing: "snake_case",
    schema: './src/schema/**/*.ts'
})
