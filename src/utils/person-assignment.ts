/**
 * Person Assignment Utility
 *
 * Deterministic matching of emails to family members based on:
 * 1. Source assignments (domain/email-based rules with optional AI refinement)
 * 2. Exact name matches (token-based, no regex)
 * 3. Alias matches (substring on safe fields)
 * 4. Group/grade aliases (team names, classroom names, grade levels)
 * 5. Safe fallback to "Family/Shared" if no confident match
 *
 * Supports multi-person assignment for shared activities.
 * No regex backtracking risks - uses token matching instead.
 */

import { FamilyMember as ConfigFamilyMember, SourceAssignment } from '../types/index.js';

export interface FamilyMember {
  name: string;
  aliases: string[];
  groupAliases?: string[];
  grade?: string;
  gradeAliases?: string[];
}

export interface PersonAssignment {
  person: string;           // Primary person or comma-separated list (e.g., "Colin, Henry")
  people: string[];         // Array of assigned people
  reason: 'source_rule' | 'source_refined' | 'exact' | 'alias' | 'group' | 'grade' | 'shared_default' | 'user_override';
  matchedTerm?: string;     // What term matched (for debugging)
  confidence?: number;      // 0-1, included for future learning
  sourceRule?: string;      // Which source rule matched (for debugging)
}

export class PersonAssigner {
  private familyMembers: FamilyMember[];
  private fallbackName: string;
  private sourceAssignments: SourceAssignment[];

  constructor(
    familyMembers: FamilyMember[],
    fallbackName: string = 'Family/Shared',
    sourceAssignments: SourceAssignment[] = []
  ) {
    this.familyMembers = familyMembers;
    this.fallbackName = fallbackName;
    this.sourceAssignments = sourceAssignments;
  }

  /**
   * Check if a domain matches a pattern (supports wildcards like *veracross*)
   */
  private domainMatches(email: string, pattern: string): boolean {
    const emailLower = email.toLowerCase();
    const patternLower = pattern.toLowerCase();

    // Extract domain from email
    const atIndex = emailLower.indexOf('@');
    const domain = atIndex >= 0 ? emailLower.substring(atIndex + 1) : emailLower;

    // Handle wildcard patterns
    if (patternLower.includes('*')) {
      const regexPattern = patternLower
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special chars except *
        .replace(/\*/g, '.*');                   // Convert * to .*
      try {
        return new RegExp(`^${regexPattern}$`).test(domain);
      } catch {
        return false;
      }
    }

    // Exact match
    return domain === patternLower || emailLower.endsWith(`@${patternLower}`);
  }

  /**
   * Check if a source assignment rule matches the email
   */
  private matchesSourceRule(
    rule: SourceAssignment,
    fromEmail: string,
    subject: string,
    bodyText: string = ''
  ): boolean {
    const match = rule.match;
    const searchText = `${subject} ${bodyText}`.toLowerCase();

    // Check fromDomain
    if (match.fromDomain && !this.domainMatches(fromEmail, match.fromDomain)) {
      return false;
    }

    // Check fromEmail (exact match)
    if (match.fromEmail && fromEmail.toLowerCase() !== match.fromEmail.toLowerCase()) {
      return false;
    }

    // Check subjectContains
    if (match.subjectContains && !subject.toLowerCase().includes(match.subjectContains.toLowerCase())) {
      return false;
    }

    // Check keywords (any match)
    if (match.keywords && match.keywords.length > 0) {
      const hasKeyword = match.keywords.some(kw => searchText.includes(kw.toLowerCase()));
      if (!hasKeyword) {
        return false;
      }
    }

    // If we have at least one condition and all passed, it's a match
    return !!(match.fromDomain || match.fromEmail || match.subjectContains || match.keywords?.length);
  }

  /**
   * Try to refine a multi-person assignment using grade/context clues
   * Returns the refined list of people, or the original if no refinement possible
   *
   * Logic:
   * - If ONLY ONE child's identifiers found → narrow to that child
   * - If BOTH children's identifiers found → keep both (email is about both)
   * - If NEITHER found → keep both (can't determine)
   */
  private refineWithContext(
    assignedPeople: string[],
    subject: string,
    snippet: string,
    bodyText: string = ''
  ): { people: string[]; matchedTerm?: string; refined: boolean } {
    if (assignedPeople.length <= 1) {
      return { people: assignedPeople, refined: false };
    }

    const searchText = `${subject} ${snippet} ${bodyText}`.toLowerCase();
    const tokens = new Set(searchText.split(/[^a-z0-9]+/).filter(Boolean));

    // Track which people have matches and what matched
    const matches: Map<string, string> = new Map(); // personName -> matchedTerm

    // Check each person for any identifying info
    for (const personName of assignedPeople) {
      const member = this.familyMembers.find(m => m.name === personName);
      if (!member) continue;

      // Check aliases (exact name mentions - strongest signal)
      for (const alias of member.aliases) {
        const aliasLower = alias.toLowerCase();
        if (tokens.has(aliasLower) || searchText.includes(aliasLower)) {
          matches.set(personName, alias);
          break; // Found a match for this person, move to next person
        }
      }

      // If no alias match, check grade aliases
      if (!matches.has(personName) && member.gradeAliases) {
        for (const gradeAlias of member.gradeAliases) {
          if (searchText.includes(gradeAlias.toLowerCase())) {
            matches.set(personName, gradeAlias);
            break;
          }
        }
      }

      // If still no match, check group aliases
      if (!matches.has(personName) && member.groupAliases) {
        for (const groupAlias of member.groupAliases) {
          if (searchText.includes(groupAlias.toLowerCase())) {
            matches.set(personName, groupAlias);
            break;
          }
        }
      }
    }

    // Decision logic:
    // - If exactly ONE person matched → refine to that person
    // - If ALL people matched → keep all (email mentions everyone)
    // - If NONE matched → keep all (can't determine)
    // - If SOME but not all matched → refine to those who matched

    if (matches.size === 0) {
      // No matches - can't refine
      return { people: assignedPeople, refined: false };
    }

    if (matches.size === assignedPeople.length) {
      // Everyone matched - email is about all of them, keep all
      return { people: assignedPeople, refined: false };
    }

    // Some people matched - refine to just those
    const matchedPeople = Array.from(matches.keys());
    const matchedTerms = Array.from(matches.values());

    return {
      people: matchedPeople,
      matchedTerm: matchedTerms.join(', '),
      refined: true
    };
  }

  /**
   * Assign person(s) based on subject, snippet, and sender information
   * Now supports source-based rules and multi-person assignment
   */
  assign(
    subject: string = '',
    snippet: string = '',
    fromEmail: string = '',
    fromName: string = '',
    bodyText: string = ''
  ): PersonAssignment {
    // === STEP 1: Check source assignment rules ===
    for (const rule of this.sourceAssignments) {
      if (this.matchesSourceRule(rule, fromEmail, subject, bodyText)) {
        const assignedPeople = rule.assignTo;

        // Try to refine if multiple people and refinement is enabled (default true)
        const shouldRefine = rule.refineWithAI !== false;

        if (shouldRefine && assignedPeople.length > 1) {
          const refined = this.refineWithContext(assignedPeople, subject, snippet, bodyText);

          if (refined.refined) {
            return {
              person: refined.people.join(', '),
              people: refined.people,
              reason: 'source_refined',
              matchedTerm: refined.matchedTerm,
              confidence: 0.85,
              sourceRule: rule.match.fromDomain || rule.match.fromEmail || 'custom',
            };
          }
        }

        // Return all assigned people (no refinement or single person)
        return {
          person: assignedPeople.join(', '),
          people: assignedPeople,
          reason: 'source_rule',
          matchedTerm: rule.match.fromDomain || rule.match.fromEmail,
          confidence: assignedPeople.length === 1 ? 0.90 : 0.75,
          sourceRule: rule.match.fromDomain || rule.match.fromEmail || 'custom',
        };
      }
    }

    // === STEP 2: Fall back to text-based matching ===
    const safeText = `${subject} ${snippet} ${fromEmail} ${fromName}`.toLowerCase();
    const tokens = new Set(safeText.split(/[^a-z0-9]+/).filter(Boolean));

    // Try exact name matches first (highest confidence)
    for (const member of this.familyMembers) {
      for (const alias of member.aliases) {
        const aliasLower = alias.toLowerCase();

        if (tokens.has(aliasLower)) {
          return {
            person: member.name,
            people: [member.name],
            reason: 'exact',
            matchedTerm: alias,
            confidence: 0.95,
          };
        }

        if (Array.from(tokens).some(token => token.includes(aliasLower))) {
          return {
            person: member.name,
            people: [member.name],
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

        if (aliasLower.length < 3) {
          if (tokens.has(aliasLower)) {
            return {
              person: member.name,
              people: [member.name],
              reason: 'alias',
              matchedTerm: alias,
              confidence: 0.80,
            };
          }
        } else {
          if (safeText.includes(aliasLower)) {
            return {
              person: member.name,
              people: [member.name],
              reason: 'alias',
              matchedTerm: alias,
              confidence: 0.80,
            };
          }
        }
      }
    }

    // Try grade aliases
    for (const member of this.familyMembers) {
      if (member.gradeAliases) {
        for (const grade of member.gradeAliases) {
          if (safeText.includes(grade.toLowerCase())) {
            return {
              person: member.name,
              people: [member.name],
              reason: 'grade',
              matchedTerm: grade,
              confidence: 0.70,
            };
          }
        }
      }
    }

    // Try group aliases (lower confidence)
    for (const member of this.familyMembers) {
      if (member.groupAliases) {
        for (const group of member.groupAliases) {
          if (safeText.includes(group.toLowerCase())) {
            return {
              person: member.name,
              people: [member.name],
              reason: 'group',
              matchedTerm: group,
              confidence: 0.60,
            };
          }
        }
      }
    }

    // No match found - safe fallback
    return {
      person: this.fallbackName,
      people: [this.fallbackName],
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
    return new PersonAssigner([], 'Family/Shared', []);
  }

  const members: FamilyMember[] = familyConfig.members.map((m: any) => ({
    name: m.name,
    aliases: m.aliases || [],
    groupAliases: m.groupAliases || [],
    grade: m.grade,
    gradeAliases: m.gradeAliases || [],
  }));

  const fallback = familyConfig.defaultAssignmentFallback || 'Family/Shared';
  const sourceAssignments: SourceAssignment[] = familyConfig.sourceAssignments || [];

  return new PersonAssigner(members, fallback, sourceAssignments);
}
