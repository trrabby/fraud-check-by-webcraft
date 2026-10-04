/**
 * Result of normalizing one courier's response into the common currency
 * used by the aggregate.
 *
 * - `success` / `cancel` are the courier's estimated counts (may be fractional
 *   for ratio-derived estimates). They stay unrounded until the final
 *   aggregate step.
 * - `weight` is this courier's relative confidence inside its group (0–1).
 *   It scales the courier's counts before they're blended.
 * - `group` decides which 60/40 bucket the courier contributes to.
 * - `hasSignal` is true when the courier returned real, meaningful data
 *   (not just an empty placeholder).
 * - `source` is a short tag that describes where the numbers came from,
 *   useful for the `contributions` debug block.
 */
export interface CourierContribution {
  success: number;
  cancel: number;
  weight: number;
  group: "a" | "b";
  hasSignal: boolean;
  source:
    | "counts" // native count-based response (RedX, Paperfly, Carrybee)
    | "ratio_bucket" // Steadfast: ratio + volume_range
    | "rating" // Pathao: rating-based with success_rate
    | "empty"; // real response but no history
}

export type CourierNormalizer = (data: unknown) => CourierContribution | null;
