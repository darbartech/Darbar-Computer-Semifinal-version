import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Prisma 7 runs through a driver adapter, so `Pool` is ours to own — Prisma will
 * never close it. Two consequences that bit us in development:
 *
 *  1. An idle client that PostgreSQL drops (server restart, idle timeout,
 *     `pg_terminate_backend`) makes `pg` emit `error` on the pool. With no
 *     listener, Node treats it as an uncaught exception and the *next* request
 *     dies with `Server has closed the connection.` — an unauthenticated visitor
 *     loading the homepage, from a pooled connection created minutes earlier.
 *  2. The pool must be a singleton too. Caching only the `PrismaClient` leaves a
 *     freshly constructed `Pool` behind on every hot reload.
 *
 * `connectionTimeoutMillis` is what turns a dead server into a fast, honest
 * error instead of a request that hangs until the platform kills it.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPool?: Pool;
};

const pool =
  globalForPrisma.prismaPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // PostgreSQL's default `max_connections` is 100 and every Next.js process
    // gets its own pool, so 10 per process leaves room for psql, the seed script
    // and a second dev server.
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // Close idle clients well before `tcp_keepalives_idle` so a reaped socket is
    // never handed to a query.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

pool.on("error", (error) => {
  // Logged, not thrown: the pool has already discarded the dead client and will
  // open a fresh one on the next query.
  console.error("[db] idle client error", error.message);
});

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaPool = pool;
}

/** Canonical name used by the DAL and actions (docs/06 §2). */
export const db = prisma;

export default prisma;
