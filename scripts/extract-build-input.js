const fs = require("fs");
const path = require("path");

function usage() {
  console.error(
    "Usage: node scripts/extract-build-input.js <path-to-build-info.json> [output-file.json]\n" +
      "Example: node scripts/extract-build-input.js artifacts/build-info/abc123.json artifacts/build-info/abc123.input.json"
  );
}

async function main() {
  const [, , buildInfoPathArg, outputPathArg] = process.argv;

  if (!buildInfoPathArg) {
    usage();
    process.exit(1);
  }

  const buildInfoPath = path.resolve(process.cwd(), buildInfoPathArg);
  const outputPath = path.resolve(
    process.cwd(),
    outputPathArg || buildInfoPath.replace(/\.json$/i, ".input.json")
  );

  const raw = fs.readFileSync(buildInfoPath, "utf8");
  const json = JSON.parse(raw);

  if (!json || typeof json !== "object") {
    throw new Error("Build-info JSON did not parse into an object");
  }

  if (!json.input || typeof json.input !== "object") {
    const keys = Object.keys(json);
    throw new Error(
      `No 'input' object found in build-info JSON. Top-level keys: ${keys.join(", ")}`
    );
  }

  const input = json.input;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(input, null, 2));

  const bytes = fs.statSync(outputPath).size;
  console.log(`Wrote compiler standard-json input to: ${outputPath}`);
  console.log(`Size: ${bytes} bytes (${(bytes / (1024 * 1024)).toFixed(2)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
