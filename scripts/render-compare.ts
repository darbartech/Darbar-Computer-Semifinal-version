import { writeFile } from "node:fs/promises";
import { renderCertificatePdf } from "../src/server/certificates/pdf/engine/certificateRenderer";
import { getTemplateById } from "../src/server/certificates/pdf/engine/templates/darbartech-certificate-v2";
import type { CertificateRenderInput } from "../src/server/certificates/pdf/engine/types";

const template = getTemplateById(
  "darbartech-certificate",
  "v2"
);

const input: CertificateRenderInput = {
  templateId: template.templateId,
  templateVersion: template.version,
  rendererVersion: template.rendererVersion,
  certificateNumber: "DT-CERT-2026-94643",
  recipient: { name: "PALISTHA SHRESTHA" },
  program: {
    title: "ADVANCED EXCEL FOR PROFESSIONALS",
    duration: "1 Month",
  },
  trainingProvider: "DarbarTech",
  modules: [
    { order: 1, title: "PIVOT TABLES", subtitle: "MS Excel" },
    { order: 2, title: "POWER QUERY", subtitle: "Power Query" },
    { order: 3, title: "DASHBOARDS", subtitle: "Power BI" },
    { order: 4, title: "ADVANCED FORMULAS" },
  ],
  grade: "A",
  completionDate: "2026-10-12",
  issueDate: "2026-10-12",
  signatory: { name: "Mohan Shahi", position: "Managing Director" },
  secondarySignatory: undefined,
  verificationUrl: "darbarcomputer.edu.np",
};

async function main() {
  const result = await renderCertificatePdf(input, template);
  if (!result.success || !result.data) {
    console.error("render failed", result.errors);
    process.exit(1);
  }
  const dst =
    process.argv[2] ??
    "C:\\Users\\Nepal\\AppData\\Local\\Temp\\opencode\\cert_compare\\current_p0.pdf";
  await writeFile(dst, result.data);
  console.log("wrote", dst, result.data.length, "bytes");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});