/** Types for the build-time ABP -> DNR parser, so the unit tests can typecheck. */
export type SkipReasons = {
  unsupportedOption: number;
  regex: number;
  nonAscii: number;
  emptyPattern: number;
  popup: number;
  unknownType: number;
  blockMainFrame: number;
  malformedAnchor: number;
};

export type ParseStats = {
  lines: number;
  comments: number;
  cosmetic: number;
  network: number;
  converted: number;
  skipped: SkipReasons;
};

export type DnrRuleBody = {
  priority: number;
  action: { type: string };
  condition: Record<string, unknown>;
};

export type CosmeticRule = {
  selector: string;
  isException: boolean;
  isProcedural: boolean;
  domains: string[];
  excludedDomains: string[];
};

export function createStats(): ParseStats;
export function splitDomains(
  value: string,
  separator?: string,
): { included: string[]; excluded: string[] };
export function isComment(line: string): boolean;
export function looksCosmetic(line: string): boolean;
export function convertNetworkFilter(line: string, stats: ParseStats): DnrRuleBody | null;
export function parseCosmeticFilter(line: string): CosmeticRule | null;
