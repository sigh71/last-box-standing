import type { PickerStrategy } from "./types.js";
import { interestMax } from "./interest-max.js";

/**
 * Register new selection systems here — one import + one entry.
 * The UI discovers strategies via GET /api/pickers, so nothing else changes.
 */
const strategies: PickerStrategy[] = [interestMax];

export const pickerRegistry = new Map<string, PickerStrategy>(
  strategies.map((s) => [s.id, s]),
);

export function listPickers(): Pick<PickerStrategy, "id" | "name" | "description">[] {
  return strategies.map(({ id, name, description }) => ({ id, name, description }));
}
