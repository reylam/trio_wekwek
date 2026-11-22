// Prisma v7 singleton client dengan @prisma/adapter-pg untuk Supabase Transaction Pooler (:6543).
import dns from 'node:dns';
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

// Utamakan IPv4 untuk menghindari ECONNRESET pada jaringan IPv6/NAT64 menuju Supabase.
dns.setDefaultResultOrder('ipv4first');

const globalForPrisma = globalThis as unknown as {
  patraPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL belum di-set di environment BE-Patra.');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.patraPrisma) {
    globalForPrisma.patraPrisma = createPrismaClient();
  }
  return globalForPrisma.patraPrisma;
}

export default getPrisma;
