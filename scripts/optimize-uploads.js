const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (flag, fallback) => {
  const idx = args.indexOf(flag);
  if (idx === -1) return fallback;
  const next = args[idx + 1];
  return next && !next.startsWith('--') ? next : fallback;
};

const targetDir = path.resolve(process.cwd(), getArg('--dir', 'uploads'));
const maxDim = Number(getArg('--max', 1600));
const quality = Number(getArg('--quality', 72));
const dryRun = hasFlag('--dry-run');
const force = hasFlag('--force');

const SUPPORTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const SKIP_DIRS = new Set(['node_modules', '.git']);

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

async function* walk(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function optimizeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTS.has(ext)) return { skipped: true, reason: 'unsupported' };

  const stat = await fs.promises.stat(filePath);
  if (!stat.size) return { skipped: true, reason: 'empty' };

  const pipeline = sharp(filePath)
    .rotate()
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true });

  let buffer;
  if (ext === '.png') {
    buffer = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  } else if (ext === '.webp') {
    buffer = await pipeline.webp({ quality }).toBuffer();
  } else {
    buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  if (!force && buffer.length >= stat.size) {
    return { skipped: true, reason: 'not-smaller', saved: 0 };
  }

  if (!dryRun) {
    await fs.promises.writeFile(filePath, buffer);
  }

  return { optimized: true, saved: stat.size - buffer.length };
}

async function main() {
  if (!fs.existsSync(targetDir)) {
    console.error(`Uploads directory not found: ${targetDir}`);
    process.exit(1);
  }

  let total = 0;
  let optimized = 0;
  let skipped = 0;
  let errors = 0;
  let bytesSaved = 0;

  for await (const filePath of walk(targetDir)) {
    total += 1;
    try {
      const result = await optimizeFile(filePath);
      if (result.optimized) {
        optimized += 1;
        bytesSaved += result.saved || 0;
      } else {
        skipped += 1;
      }
    } catch (err) {
      errors += 1;
      console.warn(`Failed: ${filePath}`);
      console.warn(err?.message || err);
    }
  }

  console.log(`Scanned: ${total}`);
  console.log(`Optimized: ${optimized}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Saved: ${formatBytes(bytesSaved)}`);
  if (dryRun) console.log('Dry run: no files were written.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
