export type Capability =
  | "hcb"

export const capabilities: Capability[] = [
  "hcb",
];

export function isCapability(
  value: string,
): value is Capability {
  return capabilities.includes(
    value as Capability,
  );
}