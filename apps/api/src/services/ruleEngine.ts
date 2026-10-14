import { DescriptionRule, POItem } from '@invoiceai/shared';

export interface TransformResult {
  commercialDescription: string;
  patternBreakdown: string;
  warnings: string[];
  appliedRuleVersion: number;
}

export class DescriptionRuleEngine {
  /**
   * Applies versioned description rules to convert raw PO item data into the supplier's commercial description.
   */
  public static transform(item: Partial<POItem>, rule: DescriptionRule): TransformResult {
    const warnings: string[] = [];
    const aliases = rule.aliases || {};
    const crateSuffix = rule.crateSuffix || 'CRT';
    const unknownTermPolicy = rule.unknownTermPolicy || 'review_required';

    // Helper to resolve an alias or report an unknown term
    const resolveTerm = (raw: string | undefined): string | null => {
      if (!raw || !raw.trim()) return null;
      const trimmed = raw.trim();

      // Check direct match
      if (aliases[trimmed]) {
        return aliases[trimmed];
      }

      // Case-insensitive check
      const lower = trimmed.toLowerCase();
      for (const [key, val] of Object.entries(aliases)) {
        if (key.toLowerCase() === lower) {
          return val;
        }
      }

      // Not found in aliases
      if (unknownTermPolicy === 'review_required') {
        warnings.push(`Unknown terminology detected: "${trimmed}". Requires human review.`);
        return trimmed.toUpperCase();
      }

      return trimmed;
    };

    // 1. Resolve Stone / Material
    const stoneStr = resolveTerm(item.material || 'Tandur Yellow Limestone') || 'T.YELLOW';

    // 2. Resolve Pattern / Category
    const categoryPolicy = rule.categoryPolicies?.find(
      (p) => p.category.toLowerCase() === (item.category || '').toLowerCase()
    );
    const patternStr = item.category ? resolveTerm(item.category) : null;

    // 3. Resolve Size (e.g., "100x50 cm" -> "100X50")
    let sizeStr: string | null = null;
    if (item.size) {
      sizeStr = item.size.replace(/\s*cm$/i, '').trim().toUpperCase();
    }

    // 4. Resolve Thickness (e.g., "3-5 cm" -> "3-5 CM", "2 cm" -> "2 CM")
    let thicknessStr: string | null = null;
    if (item.thickness) {
      const cleanThickness = item.thickness.trim();
      thicknessStr = cleanThickness.toUpperCase().includes('CM') ? cleanThickness.toUpperCase() : `${cleanThickness} CM`;
    }

    // 5. Finishes (Top, Bottom, Edge, Final)
    const resolveFinishes = (finishes?: string[]): string[] => {
      if (!finishes || !Array.isArray(finishes)) return [];
      const resolved: string[] = [];
      for (const f of finishes) {
        const term = resolveTerm(f);
        if (term) resolved.push(term);
      }
      return resolved;
    };

    const topFinishes = resolveFinishes(item.topFinish);
    const bottomFinishes = resolveFinishes(item.bottomFinish);
    const edgeFinishes = resolveFinishes(item.edgeFinish);
    const finalFinishes = resolveFinishes(item.finalFinish);

    // 6. Crate count
    const crateStr = item.crateCount && item.crateCount > 0 ? `${item.crateCount}${crateSuffix}` : null;

    // Combine elements in order: [stone, pattern, size, thickness, finishes, crates]
    const parts: string[] = [];
    if (stoneStr) parts.push(stoneStr);
    if (patternStr && patternStr !== stoneStr) parts.push(patternStr);
    if (sizeStr) parts.push(sizeStr);
    if (thicknessStr) parts.push(thicknessStr);

    for (const f of [...topFinishes, ...bottomFinishes, ...edgeFinishes, ...finalFinishes]) {
      if (!parts.includes(f)) {
        parts.push(f);
      }
    }

    if (crateStr) parts.push(crateStr);

    const commercialDescription = parts.join(', ');

    // Handle pattern breakdown for French Opus or special categories
    let patternBreakdown = '';
    if (categoryPolicy?.includePatternBreakdown && item.patternBreakdown) {
      patternBreakdown = item.patternBreakdown;
    } else if (item.category?.toLowerCase().includes('french opus') && !item.patternBreakdown) {
      // Default standard French Opus 4-size modular set
      patternBreakdown = '20X20 - 2PC | 40X20 - 1PC | 40X40 - 2PC | 60X40 - 1PC';
    }

    return {
      commercialDescription,
      patternBreakdown,
      warnings,
      appliedRuleVersion: rule.ruleVersion || 1
    };
  }
}
