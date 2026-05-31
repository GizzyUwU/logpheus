import type { ApiAdapter } from "./types";

const adapterCache = new Map<string, new (...args: unknown[]) => ApiAdapter>();

export async function loadAdapter(filename: string): Promise<new (...args: unknown[]) => ApiAdapter> {
  if (adapterCache.has(filename)) return adapterCache.get(filename)!;
  
  const mod = await import(`./${filename}`);
  const key = Object.keys(mod)[0] as string;
  const AdapterClass = mod.default ?? mod[key as keyof typeof mod];
  adapterCache.set(filename, AdapterClass);
  return AdapterClass;
}