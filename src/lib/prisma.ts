import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pgPool: Pool | undefined
}

const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING

if (!connectionString) {
  throw new Error('Database connection string (POSTGRES_PRISMA_URL or POSTGRES_URL_NON_POOLING) is missing from environment variables.')
}

// Reuse the pool and client in development to prevent exhausting database connections
let prisma: PrismaClient

if (process.env.NODE_ENV === 'production') {
  const pool = new Pool({ connectionString, max: 5 })
  const adapter = new PrismaPg(pool)
  prisma = new PrismaClient({ adapter })
} else {
  if (!globalForPrisma.pgPool) {
    globalForPrisma.pgPool = new Pool({ connectionString, max: 5 })
  }
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg(globalForPrisma.pgPool)
    globalForPrisma.prisma = new PrismaClient({ adapter })
  }
  prisma = globalForPrisma.prisma
}

export { prisma }
export default prisma
