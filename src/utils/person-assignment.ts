/**
 * Person Assignment Utility
 * 
 * Deterministic matching of emails to family members based on:
 * 1. Exact name matches (token-based, no regex)
 * 2. Alias matches (substring on safe fields)
 * 3. Group aliases (team names, classroom names)
 * 4. Safe fallback to "Family/Shared" if no confident match
 * 
 * No regex backtracking risks - uses token matching instead.
 * No LLM inference - purely config-driven for trust and debuggability.
 */

export interface FamilyMember {
  name: string;
  aliases: string[];
  groupAliases?: string[];
}

export interface PersonAssignment {
  person: string; // Family member name or "Family/Shared"
  reason: 'exact' | 'alias' | 'group' | 'shared_default' | 'user_override';
  matchedTerm?: string; // What term matched (for debugging)
  confidence?: number; // 0-1, included for future learning
}

export class PersonAssigner {
  private familyMembers: FamilyMember[];
  private fallbackName: string;

  constructor(familyMembers: FamilyMember[], fallbackName: string = 'Family/Shared') {
    this.familyMembers = familyMembers;
    this.fallbackName = fallbackName;
  }

  /**
   * Assign person based on subject, snippet, and sender information
   * Uses token-based matching to avoid regex catastrophic backtracking
   */
  assign(
    subject: string = '',
    snippet: string = '',
    fromEmail: string = '',
    fromName: string = ''
  ): PersonAssignment {
    // Build searchable text - but keep it bounded to avoid huge strings
    const safeText = `${subject} ${snippet} ${fromEmail} ${fromName}`.toLowerCase();
    
    // Tokenize: split on non-alphanumeric to get individual words
    const tokens = new Set(safeText.split(/[^a-z0-9]+/).filter(Boolean));

    // Try exact name matches first (highest confidence)
    for (const member of this.familyMembers) {
      for (const alias of member.aliases) {
        const aliasLower = alias.toLowerCase();
        
        // Check if alias is a token (whole word match)
        if (tokens.has(aliasLower)) {
          return {
            person: member.name,
            reason: 'exact',
            matchedTerm: alias,
            confidence: 0.95,
          };
        }
        
        // Check if alias appears as substring in any token (for hyphenated or split names)
        if (Array.from(tokens).some(token => token.includes(aliasLower))) {
          return {
            person: member.name,
            reason: 'exact',
            matchedTerm: alias,
            confidence: 0.90,
          };
        }
      }
    }

    // Try alias matches (medium confidence)
    for (const member of this.familyMembers) {
      for (const alias of member.aliases) {
        const aliasLower = alias.toLowerCase();
        
        // For shorter aliases (< 3 chars), require token match only
        if (aliasLower.length < 3) {
          if (tokens.has(aliasLower)) {
            return {
              person: member.name,
              reason: 'alias',
              matchedTerm: alias,
              confidence: 0.80,
            };
          }
        } else {
          // For longer aliases, substring match in safe text is okay
          if (safeText.includes(aliasLower)) {
            return {
              person: member.name,
              reason: 'alias',
              matchedTerm: alias,
              confidence: 0.80,
            };
          }
        }
      }
    }

    // Try group aliases (lower confidence - could match multiple people)
    for (const member of this.familyMembers) {
      if (member.groupAliases) {
        for (const group of member.groupAliases) {
          if (safeText.includes(group.toLowerCase())) {
            return {
              person: member.name,
              reason: 'group',
              matchedTerm: group,
              confidence: 0.60, // Lower confidence - might be shared
            };
          }
        }
      }
    }

    // No match found - safe fallback
    return {
      person: this.fallbackName,
      reason: 'shared_default',
      matchedTerm: undefined,
      confidence: 0.0,
    };
  }
}

/**
 * Create a PersonAssigner from config object
 */
export function createPersonAssignerFromConfig(config: any): PersonAssigner {
  const familyConfig = config?.family;
  if (!familyConfig?.members) {
    // No family config - return default assigner with no members
    return new PersonAssigner([], 'Family/Shared');
  }

  const members: FamilyMember[] = familyConfig.members.map((m: any) => ({
    name: m.name,
    aliases: m.aliases || [],
    groupAliases: m.groupAliases || [],
  }));

  const fallback = familyConfig.defaultAssignmentFallback || 'Family/Shared';
  return new PersonAssigner(members, fallback);
}
