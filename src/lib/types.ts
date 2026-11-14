export interface WorkItem { name: string; minutes: number; costCents: number; swappable: boolean }
export interface ProjectInput { priceCents: number; minimumRateCents: number; items: WorkItem[]; request: { name: string; minutes: number; costCents: number } }
export interface PublicOption { id: 'add' | 'swap'; title: string; totalCents: number; extraCents: number; unchanged: string[]; added: string[]; removed: string[] }
export interface Calculation { currentRateCents: number; freeRateCents: number; changePercent: number | null; options: PublicOption[]; budgetGapCents: number | null; removedIndices: number[] }
export interface PublicProposal { createdAt: string; originalPriceCents: number; options: PublicOption[]; confirmation: { optionId: 'add' | 'swap'; confirmedAt: string } | null }
export interface PrivateProposal { proposal: PublicProposal; input: ProjectInput; calculation: Calculation; clientPath: string }
export interface Published { clientPath: string; ownerPath: string; proposal: PublicProposal }
export type FieldErrors = Record<string, string>;
