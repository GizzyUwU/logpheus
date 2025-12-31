import { defineConfig } from "drizzle-kit";
export default defineConfig({
    dialect: 'postgresql', // 'mysql' | 'sqlite' | 'turso'
    driver: "pglite",
    dbCredentials: {
        url: "./cache/pg",
    },
    casing: "snake_case",
    schema: './src/schema'
})
