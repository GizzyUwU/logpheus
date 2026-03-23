import fs from "node:fs";
import path from "node:path";

async function loadDir(dir: string, routes: any[]) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      await loadDir(fullPath, routes);
      continue;
    }
    
    if (!file.endsWith(".ts")) continue;
    const mod = await import(fullPath);
    const route = mod.default ?? mod;
    if (Array.isArray(route)) {
      routes.push(...route)
    }
    
    continue;
  }
}

export default async function loadAPI() {
  const routes: any[] = [];
  await loadDir(__dirname, routes);
  return routes;
}

const limiterMap = new Map<string, { count: number; start: number }>();

export function rateLimit(ip: string) {
  const now = Date.now();
  const entry = limiterMap.get(ip) || { count: 0, start: now };

  if (now - entry.start > 60 * 1000) {
    entry.count = 0;
    entry.start = now;
  }

  entry.count++;
  limiterMap.set(ip, entry);

  return entry.count <= 10;
}
