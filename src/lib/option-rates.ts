import type { Calculation, ProjectInput, PublicOption } from './types';

/** Private presentation data: never attach these values to PublicOption or a public snapshot. */
export interface OptionRate {
  id: PublicOption['id'];
  rateCents: number;
  minimumProtected: boolean;
}

/** Receives validated inputs and the calculation from those same inputs. */
export function getOptionRates(input: ProjectInput, calculation: Calculation): OptionRate[] {
  const removed = new Set(calculation.removedIndices);
  return calculation.options.map(option => {
    let minutes = BigInt(input.request.minutes);
    let costs = BigInt(input.request.costCents);
    input.items.forEach((item, index) => {
      if (option.id === 'swap' && removed.has(index)) return;
      minutes += BigInt(item.minutes);
      costs += BigInt(item.costCents);
    });
    if (minutes <= 0n) throw new Error('The resulting scope must have positive work time.');
    const hourlyNet = (BigInt(option.totalCents) - costs) * 60n;
    return {
      id: option.id,
      // Only the displayed quotient uses floating point; protection uses exact integers.
      rateCents: Number(hourlyNet) / Number(minutes),
      minimumProtected: hourlyNet >= BigInt(input.minimumRateCents) * minutes,
    };
  });
}

/** Compare the chosen floor with the original rate before any display rounding. */
export function isMinimumBelowCurrent(input: ProjectInput): boolean {
  const minutes = input.items.reduce((sum, item) => sum + BigInt(item.minutes), 0n);
  const costs = input.items.reduce((sum, item) => sum + BigInt(item.costCents), 0n);
  return BigInt(input.minimumRateCents) * minutes < (BigInt(input.priceCents) - costs) * 60n;
}
