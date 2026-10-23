import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"] });
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env["POSTGRES_URL_NON_POOLING"] ||
      process.env["DIRECT_URL"] ||
      process.env["POSTGRES_URL"] ||
      process.env["POSTGRES_PRISMA_URL"] ||
      process.env["DATABASE_URL"] ||
      process.env["PRISMA_DATABASE_URL"],
  },
});
