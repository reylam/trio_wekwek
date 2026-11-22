// Prisma v7 config — memakai DIRECT_URL (:5432) untuk migrate jika tersedia, fallback ke DATABASE_URL (:6543).
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const url = process.env['DIRECT_URL'] || process.env['DATABASE_URL'] || '';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url,
  },
});
