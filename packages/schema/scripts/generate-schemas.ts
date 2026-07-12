import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { JSON_SCHEMA_FILES, generateJsonSchemas } from "../src/index.js";

const outputDirectory = fileURLToPath(new URL("../schemas", import.meta.url));
const schemas = generateJsonSchemas();

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  Object.entries(schemas).map(async ([name, schema]) => {
    const fileName = JSON_SCHEMA_FILES[name as keyof typeof JSON_SCHEMA_FILES];
    await writeFile(
      new URL(`../schemas/${fileName}`, import.meta.url),
      `${JSON.stringify(schema, null, 2)}\n`,
      "utf8",
    );
  }),
);

console.log(`JSON Schema ${Object.keys(schemas).length}개 생성: ${outputDirectory}`);
