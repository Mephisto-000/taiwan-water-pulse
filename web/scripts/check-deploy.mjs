import { readdir, readFile } from "node:fs/promises";
import { resolve, relative, posix } from "node:path";
import { fileURLToPath } from "node:url";

const MB = 1_000_000;
const secretPatterns = [
  ["Earthdata credential marker", /EARTHDATA_/],
  ["JWT", /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/],
  ["PEM material", /-----BEGIN/],
  [
    "GitHub token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  ],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  [
    "service token",
    /\b(?:xox[baprs]-[A-Za-z0-9-]{16,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b/,
  ],
  ["credential in URL", /https?:\/\/[^\s/:]+:[^\s/@]+@/i],
  ["local user path", /\/(?:Users|home)\/[^/\s]+\//],
];
const privateName =
  /^(?:\.env.*|\.netrc|\.npmrc|token\.md|credentials\..*|id_rsa.*|id_ed25519.*)$|\.(?:pem|key|p12|pfx)$/i;

/** Inspect only public output. Diagnostics never include matched secret values. */
export async function checkDeployment(directory) {
  const root = resolve(directory);
  const errors = [],
    warnings = [],
    files = [];
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const absolute = resolve(folder, entry.name);
      const path = relative(root, absolute).split("\\").join("/");
      if (entry.isSymbolicLink()) {
        errors.push(`Symbolic link is not publishable: ${path}`);
      } else if (entry.isDirectory()) {
        if (entry.name.startsWith("."))
          errors.push(`Hidden directory: ${path}`);
        await walk(absolute);
      } else if (entry.isFile()) {
        const bytes = await readFile(absolute);
        files.push({ path, bytes: bytes.length });
        if (privateName.test(entry.name)) errors.push(`Private file: ${path}`);
        if (bytes.length > 50 * MB) errors.push(`File exceeds 50 MB: ${path}`);
        else if (bytes.length > 5 * MB)
          warnings.push(`File exceeds 5 MB: ${path}`);
        let text;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          continue;
        } // Binary PNG/raster data is size-checked, not decoded as text.
        for (const [label, pattern] of secretPatterns) {
          if (pattern.test(text))
            errors.push(`${label} detected in ${path} (value redacted)`);
        }
      }
    }
  }
  try {
    await walk(root);
  } catch {
    errors.push("Cannot read deployment output; run the build first.");
  }
  const paths = new Set(files.map((file) => file.path));
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (!paths.has("index.html")) errors.push("Missing dist/index.html");
  if (totalBytes > 90 * MB) errors.push("Deployment exceeds 90 MB");
  else if (totalBytes > 70 * MB) warnings.push("Deployment exceeds 70 MB");

  function requireAsset(value, base = "data") {
    if (
      typeof value !== "string" ||
      !value ||
      value.includes("\\") ||
      value.startsWith("/") ||
      value.split("/").includes("..") ||
      /[?#:]/.test(value)
    ) {
      errors.push("Invalid local asset reference (value redacted)");
      return;
    }
    const path = posix.join(base, value);
    // Compare real directory entries: macOS itself may accept an incorrect letter case.
    if (!paths.has(path))
      errors.push(`Missing or case-mismatched asset: ${path}`);
  }
  async function json(path) {
    if (!paths.has(path)) {
      errors.push(`Missing JSON: ${path}`);
      return null;
    }
    try {
      const value = JSON.parse(await readFile(resolve(root, path), "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Expected object");
      return value;
    } catch {
      errors.push(`Invalid JSON: ${path}`);
      return null;
    }
  }
  function declaredAssets(value, base) {
    if (
      typeof value === "string" &&
      /\.(?:bin|json|png|jpg|jpeg|webp)$/.test(value) &&
      !/^https?:/.test(value)
    ) {
      requireAsset(value, base);
    } else if (Array.isArray(value)) {
      value.forEach((item) => declaredAssets(item, base));
    } else if (value && typeof value === "object") {
      Object.values(value).forEach((item) => declaredAssets(item, base));
    }
  }
  const index = await json("data/index.json");
  if (index) {
    if (!Array.isArray(index.reservoirs) || !Array.isArray(index.dates)) {
      errors.push("Manifest must contain reservoirs and dates arrays");
    } else {
      if (!index.reservoirs.length || !index.dates.length)
        warnings.push("Data manifest is empty");
      const numericKeys =
        index.mode === "numeric"
          ? index.reservoirs.map((r) => r.key)
          : (index.numeric_reservoirs ?? []);
      if (!Array.isArray(numericKeys))
        errors.push("Invalid numeric_reservoirs");
      for (const reservoir of index.reservoirs) {
        if (
          !reservoir ||
          typeof reservoir.key !== "string" ||
          !/^[a-z0-9]+$/.test(reservoir.key)
        ) {
          errors.push("Invalid reservoir key");
          continue;
        }
        requireAsset(`official/${reservoir.key}.json`);
        if (Array.isArray(numericKeys) && numericKeys.includes(reservoir.key)) {
          const base = `data/reservoirs/${reservoir.key}`;
          const meta = await json(`${base}/meta.json`);
          if (meta) declaredAssets(meta, base);
          for (const file of ["mask.bin", "timeseries.json"])
            requireAsset(file, base);
          for (const date of index.dates) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date?.utc_date)) {
              errors.push("Invalid acquisition date");
              continue;
            }
            for (const pol of ["HH", "HV"])
              requireAsset(
                `${date.utc_date.replaceAll("-", "")}_${pol}.bin`,
                base,
              );
          }
        }
      }
      for (const date of index.dates) {
        for (const pol of ["HH", "HV"]) {
          if (typeof date?.browse?.[pol] !== "string")
            errors.push(`Missing ${pol} browse reference`);
          else requireAsset(date.browse[pol]);
        }
      }
      if (index.reservoirs.length || index.dates.length) {
        const provenance = await json("data/provenance.json");
        if (provenance && !Array.isArray(provenance.assets))
          errors.push("Invalid provenance assets");
        else
          for (const asset of provenance?.assets ?? [])
            requireAsset(asset.path);
      }
    }
  }
  // Also inspect metadata files that are not currently enabled by the manifest.
  for (const path of paths) {
    if (path.startsWith("data/") && path.endsWith("/meta.json")) {
      const meta = await json(path);
      if (meta) declaredAssets(meta, posix.dirname(path));
    }
  }
  return {
    errors: [...new Set(errors)],
    warnings,
    fileCount: files.length,
    totalBytes,
    largestFiles: files.sort((a, b) => b.bytes - a.bytes).slice(0, 5),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await checkDeployment(
    process.argv[2] ?? fileURLToPath(new URL("../dist", import.meta.url)),
  );
  console.log(
    `${result.fileCount} files; ${(result.totalBytes / MB).toFixed(2)} MB`,
  );
  for (const file of result.largestFiles)
    console.log(`  ${(file.bytes / MB).toFixed(2)} MB  ${file.path}`);
  for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
  for (const error of result.errors) console.error(`FAIL: ${error}`);
  if (result.errors.length) process.exitCode = 1;
  else console.log("Deployment checks passed; no secret markers detected.");
}
