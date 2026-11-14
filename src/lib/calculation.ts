import type { Calculation, ProjectInput, PublicOption } from './types';
import { InputValidationError, validateInput } from './validation';

const ceilDivide = (numerator: bigint, denominator: bigint) => (numerator + denominator - 1n) / denominator;
const requiredPrice = (cost: bigint, minutes: bigint, rate: bigint) => cost + ceilDivide(minutes * rate, 60n);

/** One calculation implementation for the editor, demo, and authoritative server publication. */
export function calculate(value: ProjectInput): Calculation {
  const validated = validateInput(value);
  if (!validated.input) throw new InputValidationError(validated.errors);
  const input = validated.input;
  const price = BigInt(input.priceCents);
  const rate = BigInt(input.minimumRateCents);
  const originalMinutes = input.items.reduce((sum, item) => sum + BigInt(item.minutes), 0n);
  const originalCost = input.items.reduce((sum, item) => sum + BigInt(item.costCents), 0n);
  const fullMinutes = originalMinutes + BigInt(input.request.minutes);
  const fullCost = originalCost + BigInt(input.request.costCents);
  const required = requiredPrice(fullCost, fullMinutes, rate);
  const finalPrice = required > price ? required : price;
  const add: PublicOption = {
    id: 'add', title: 'Add to package', totalCents: Number(finalPrice), extraCents: Number(finalPrice - price),
    unchanged: input.items.map(item => item.name), added: [input.request.name], removed: [],
  };
  const currentRateCents = Number((price - originalCost) * 60n) / Number(originalMinutes);
  const freeRateCents = Number((price - fullCost) * 60n) / Number(fullMinutes);
  const result: Calculation = {
    currentRateCents, freeRateCents,
    changePercent: currentRateCents > 0 ? (freeRateCents / currentRateCents - 1) * 100 : null,
    options: [add], budgetGapCents: null, removedIndices: [],
  };
  // Compare the original integer quantities, never displayed or rounded rates.
  if ((price - fullCost) * 60n >= fullMinutes * rate) return result;

  const swappable = input.items.map((item, index) => item.swappable ? index : -1).filter(index => index >= 0);
  let best: { indices: number[]; removedMinutes: bigint } | null = null;
  let minimumRequired = required;
  for (let mask = 0; mask < (1 << swappable.length); mask++) {
    const indices: number[] = [];
    let removedMinutes = 0n;
    let removedCost = 0n;
    for (let bit = 0; bit < swappable.length; bit++) {
      if (!(mask & (1 << bit))) continue;
      const index = swappable[bit];
      indices.push(index);
      removedMinutes += BigInt(input.items[index].minutes);
      removedCost += BigInt(input.items[index].costCents);
    }
    const remainingMinutes = fullMinutes - removedMinutes;
    if (remainingMinutes <= 0n) continue;
    const remainingCost = fullCost - removedCost;
    const candidateRequired = requiredPrice(remainingCost, remainingMinutes, rate);
    if (candidateRequired < minimumRequired) minimumRequired = candidateRequired;
    if ((price - remainingCost) * 60n < remainingMinutes * rate) continue;
    const lexEarlier = best !== null && indices.some((index, position) => index !== best!.indices[position] && indices.slice(0, position).every((prior, j) => prior === best!.indices[j]) && index < best!.indices[position]);
    if (best === null || indices.length < best.indices.length || (indices.length === best.indices.length && (removedMinutes < best.removedMinutes || (removedMinutes === best.removedMinutes && lexEarlier)))) {
      best = { indices, removedMinutes };
    }
  }
  if (best) {
    const removed = new Set(best.indices);
    result.removedIndices = best.indices;
    result.options.push({ id: 'swap', title: 'Swap within budget', totalCents: input.priceCents, extraCents: 0,
      unchanged: input.items.filter((_, index) => !removed.has(index)).map(item => item.name),
      added: [input.request.name], removed: input.items.filter((_, index) => removed.has(index)).map(item => item.name) });
  } else result.budgetGapCents = Number(minimumRequired > price ? minimumRequired - price : 0n);
  return result;
}
