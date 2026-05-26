export type Capability =
  | "updateCreation"

export const capabilities: Capability[] = [
  "updateCreation",
];

export function isCapability(
  value: string,
): value is Capability {
  return capabilities.includes(
    value as Capability,
  );
}