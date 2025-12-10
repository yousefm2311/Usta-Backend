const fs = require('fs');
const path = require('path');

const routeDir = path.join(process.cwd(), 'src', 'routes');

function extractRoutesFromFile(filename) {
  const text = fs.readFileSync(filename, 'utf8');
  const regex = /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const routes = [];
  let match;
  while ((match = regex.exec(text))) {
    routes.push({
      method: match[1].toUpperCase(),
      path: match[2],
      source: path.relative(process.cwd(), filename),
    });
  }
  return routes;
}

function gatherRoutes() {
  const files = fs.readdirSync(routeDir).filter(f => f.endsWith('.js'));
  return files.flatMap(f => extractRoutesFromFile(path.join(routeDir, f)));
}

function collectItems(items, collector, collectionName) {
  (items || []).forEach((item) => {
    if (item.request) {
      let rawUrl = '';
      if (typeof item.request.url === 'string') rawUrl = item.request.url;
      else if (item.request.url?.raw) rawUrl = item.request.url.raw;
      else if (Array.isArray(item.request.url?.path)) rawUrl = '/' + item.request.url.path.join('/');
      rawUrl = rawUrl || '';
      collector.push({
        method: (item.request.method || 'GET').toUpperCase(),
        url: rawUrl.replace('{{baseUrl}}', '').replace('http://localhost:3000', ''),
        name: item.name,
        collection: collectionName,
      });
    }
    if (item.item) collectItems(item.item, collector, collectionName);
  });
}

function gatherPostmanEndpoints(paths) {
  const result = {};
  paths.forEach((p) => {
    const content = fs.readFileSync(p, 'utf8');
    let data;
    try {
      data = JSON.parse(content);
    } catch (err) {
      console.error(`Failed to parse ${p}:`, err.message);
      return;
    }
    const collector = [];
    collectItems(data.item, collector, path.basename(p));
    result[path.basename(p)] = collector;
  });
  return result;
}

function normalizePath(p) {
  return p.replace(/\/+/g, '/').replace(/\/$/, '');
}

function canonicalPath(p) {
  return normalizePath(p)
    .replace(/\{\{[^}]+\}\}/g, ':param')
    .replace(/:[^/]+/g, ':param');
}

function categorize(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'api') return 'misc';
  return segments[1] || 'misc';
}

function main() {
  const routes = gatherRoutes();
  const postmanPaths = process.argv.slice(2);
  if (!postmanPaths.length) {
    console.error('Usage: node scripts/check-postman.js <postman-file> [...]');
    process.exit(1);
  }
  const collections = gatherPostmanEndpoints(postmanPaths);
  const missing = {};
  routes.forEach((route) => {
    const normalized = canonicalPath(route.path);
    const category = categorize(normalized);
    const matchFound = Object.values(collections).some((entries) => entries.some((entry) => {
      const entryPath = canonicalPath(entry.url.split('?')[0]);
      return entry.method === route.method && entryPath === normalized;
    }));
    if (!matchFound) {
      missing[category] = missing[category] || [];
      missing[category].push(route);
    }
  });
  const overallMissing = Object.entries(missing)
    .map(([category, items]) => `${category}: ${items.length} missing`)
    .join('\n');
  console.log('Missing endpoints by category:\n' + (overallMissing || 'none'));
  Object.entries(missing).forEach(([category, items]) => {
    console.log(`\nCategory ${category}:`);
    items.forEach((route) => console.log(`  [${route.method}] ${route.path} (${route.source})`));
  });
}


main();
