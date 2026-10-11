import "dotenv/config";
import { db } from "../src/server/db";

async function main() {
  const sigs = await db.certificateSignatory.findMany({ orderBy: { displayOrder: "asc" } });
  for (const s of sigs) console.log(`${s.displayOrder} ${s.id} ${s.name} | ${s.title} | ${s.designation} | active=${s.isActive}`);
  console.log("--- templates:");
  const tpls = await db.certificateTemplate.findMany();
  for (const t of tpls) console.log(`${t.id} ${t.name} v${t.version} active=${t.isActive}`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
