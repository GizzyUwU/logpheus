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