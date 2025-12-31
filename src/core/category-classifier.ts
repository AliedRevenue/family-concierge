/**
 * Email Category Classifier
 * Categorizes emails into predefined categories using keyword matching and heuristics
 * No LLM calls - pure rule-based classification
 */

import type {
  EmailCategory,
  EmailCategorization,
  CategoryPreferences,
} from '../types/index.js';
import {
  SENSITIVITY_THRESHOLDS,
  DEFAULT_CATEGORY_PREFERENCES,
} from '../types/index.js';

/**
 * Category keyword signals and patterns
 * Used for heuristic-based scoring (no ML models)
 */
export const CATEGORY_SIGNALS: Record<string, {
  keywords: string[];
  domains?: string[];
  senderPatterns?: string[];
  negativeKeywords?: string[];
}> = {
  school: {
    keywords: [
      'assembly', 'field trip', 'picture day', 'parent conference',
      'early release', 'dismissal', 'class', 'grade', 'homework',
      'teacher', 'classroom', 'school event', 'curriculum', 'report card',
      'parent-teacher', 'registration', 'enrollment', 'class schedule',
      'absence', 'tardy', 'recess', 'lunch', 'special event', 'spirit week',
      'performance', 'concert', 'play', 'graduation', 'promotion'
    ],
    domains: ['waterfordschool.org', 'veracross.com', 'schoolloop.com', 'parentvue.com'],
    senderPatterns: ['school', 'teacher', 'principal', 'office', 'waterford'],
  },

  sports_activities: {
    keywords: [
      'soccer', 'basketball', 'baseball', 'lacrosse', 'tennis', 'swimming',
      'practice', 'game', 'tournament', 'match', 'team', 'coach',
      'tryouts', 'roster', 'schedule', 'sports', 'athletics', 'recreation',
      'league', 'club', 'activity', 'youth', 'competition', 'playoff',
      'season', 'uniform', 'equipment', 'registration', 'parent volunteer'
    ],
    domains: ['teamsnap.com', 'sportstorm.com', 'clicktime.com', 'myteams.com'],
    senderPatterns: ['coach', 'team', 'sports', 'athletic', 'league'],
  },

  medical_health: {
    keywords: [
      'doctor', 'appointment', 'vaccine', 'immunization', 'clinic',
      'health', 'medical', 'prescription', 'medication', 'surgery',
      'dentist', 'checkup', 'visit', 'hospital', 'pediatrician',
      'wellness', 'screening', 'lab results', 'pharmacy', 'allergies',
      'treatment', 'specialist', 'therapy', 'insurance', 'deductible'
    ],
    domains: ['healthoneclinics.com', 'adexa.com', 'mychart.org'],
    senderPatterns: ['doctor', 'clinic', 'hospital', 'health', 'dental', 'medical'],
    negativeKeywords: ['school nurse', 'school health'],
  },

  friends_social: {
    keywords: [
      'playdate', 'friend', 'birthday', 'party', 'hangout', 'meetup',
      'invitation', 'invite', 'gathering', 'get together', 'coffee',
      'lunch', 'dinner', 'social', 'coming over', 'visiting', 'sleepover',
      'celebrate', 'celebrate birthday', 'cake', 'games'
    ],
    senderPatterns: ['friend', 'parent', 'mom', 'dad'],
    negativeKeywords: ['school', 'class', 'team', 'activity', 'sports', 'activity'],
  },

  logistics: {
    keywords: [
      'carpool', 'pickup', 'dropoff', 'transportation', 'commute',
      'parking', 'travel', 'flight', 'hotel', 'reservation',
      'confirmation', 'itinerary', 'booking', 'luggage', 'directions',
      'route', 'schedule', 'timing', 'transport', 'arrange'
    ],
    domains: ['uber.com', 'lyft.com', 'airbnb.com', 'booking.com', 'hotels.com', 'expedia.com'],
    senderPatterns: ['travel', 'transportation', 'booking', 'uber', 'lyft'],
  },

  forms_admin: {
    keywords: [
      'form', 'application', 'registration', 'permission slip',
      'signature required', 'submit', 'deadline', 'enrollment',
      'consent', 'agreement', 'policy', 'handbook', 'procedures',
      'documentation', 'checklist', 'requirements', 'complete',
      'fill out', 'sign', 'return', 'submission', 'completed by'
    ],
    senderPatterns: ['admin', 'office', 'enrollment'],
  },

  financial_billing: {
    keywords: [
      'invoice', 'bill', 'payment', 'charge', 'fee', 'cost', 'price',
      'tuition', 'balance', 'statement', 'receipt', 'refund',
      'account', 'due', 'overdue', 'billing', 'subscription',
      'credit card', 'transaction', 'payment plan', 'installment'
    ],
    domains: ['stripe.com', 'paypal.com', 'squarespace.com'],
    senderPatterns: ['billing', 'finance', 'payment', 'accounting'],
    negativeKeywords: ['school'],
  },

  community_optional: {
    keywords: [
      'pta', 'pto', 'church', 'scout', 'boy scout', 'girl scout',
      'neighborhood', 'community', 'volunteer', 'fundraiser',
      'homeowners', 'hoa', 'association', 'club', 'group',
      'meeting', 'donation', 'membership'
    ],
    domains: ['scouting.org', 'pta.org', 'churchname.org'],
    senderPatterns: ['pta', 'pto', 'scout', 'church', 'hoa', 'community'],
  },
};

/**
 * Classify an email into one or more categories
 */
export class CategoryClassifier {
  /**
   * Score how well an email matches a category
   * Range: 0.0 (no match) to 1.0 (perfect match)
   */
  private scoreCategoryMatch(
    combinedText: string,
    from: string,
    signals: (typeof CATEGORY_SIGNALS)[keyof typeof CATEGORY_SIGNALS]
  ): number {
    let score = 0;

    // Keyword matches (0.4 max)
    const keywordMatches = signals.keywords.filter(kw => combinedText.includes(kw)).length;
    const keywordScore = Math.min(keywordMatches / signals.keywords.length, 0.4);
    score += keywordScore;

    // Domain matches (0.3 max)
    if (signals.domains) {
      const domainMatched = signals.domains.some(d => from.includes(d.toLowerCase()));
      score += domainMatched ? 0.3 : 0;
    }

    // Sender pattern matches (0.2 max)
    if (signals.senderPatterns) {
      const patternMatches = signals.senderPatterns.filter(p =>
        from.includes(p.toLowerCase())
      ).length;
      const patternScore = Math.min(patternMatches / signals.senderPatterns.length, 0.2);
      score += patternScore;
    }

    // Negative keywords (penalty)
    if (signals.negativeKeywords) {
      const negativeMatches = signals.negativeKeywords.filter(nk =>
        combinedText.includes(nk)
      ).length;
      const penalty = Math.min(negativeMatches * 0.1, 0.3);
      score -= penalty;
    }

    return Math.max(0, Math.min(score, 1.0));
  }

  /**
   * Determine if email should be saved based on category thresholds
   */
  private shouldSaveEmail(
    primaryCategory: EmailCategory,
    secondaryCategories: EmailCategory[],
    categoryScores: Record<EmailCategory, number>,
    categoryPrefs: CategoryPreferences
  ): boolean {
    // Check primary category
    const primaryEnabled = categoryPrefs.enabled.includes(primaryCategory);
    const primarySensitivity = categoryPrefs.sensitivity[primaryCategory];
    const primaryThreshold = SENSITIVITY_THRESHOLDS[primarySensitivity];
    const primaryPasses = primaryEnabled && categoryScores[primaryCategory] >= primaryThreshold;

    if (primaryPasses) return true;

    // Check secondary categories
    for (const secondary of secondaryCategories) {
      const secondaryEnabled = categoryPrefs.enabled.includes(secondary);
      const secondarySensitivity = categoryPrefs.sensitivity[secondary];
      const secondaryThreshold = SENSITIVITY_THRESHOLDS[secondarySensitivity];
      const secondaryPasses = secondaryEnabled && categoryScores[secondary] >= secondaryThreshold;

      if (secondaryPasses) return true;
    }

    return false;
  }

  /**
   * Generate human-readable reasons why email is being saved
   */
  private determineSaveReasons(
    primaryCategory: EmailCategory,
    secondaryCategories: EmailCategory[],
    categoryScores: Record<EmailCategory, number>,
    categoryPrefs: CategoryPreferences
  ): string[] {
    const reasons: string[] = [];

    // Primary category reason
    if (categoryPrefs.enabled.includes(primaryCategory)) {
      const threshold = SENSITIVITY_THRESHOLDS[categoryPrefs.sensitivity[primaryCategory]];
      const score = Math.round(categoryScores[primaryCategory] * 100) / 100;
      if (score >= threshold) {
        reasons.push(`${primaryCategory}@${score.toFixed(2)}`);
      }
    }

    // Secondary category reasons
    for (const secondary of secondaryCategories) {
      if (categoryPrefs.enabled.includes(secondary)) {
        const threshold = SENSITIVITY_THRESHOLDS[categoryPrefs.sensitivity[secondary]];
        const score = Math.round(categoryScores[secondary] * 100) / 100;
        if (score >= threshold) {
          reasons.push(`${secondary}@${score.toFixed(2)}`);
        }
      }
    }

    return reasons;
  }

  /**
   * Classify an email into categories
   */
  public categorize(
    subject: string,
    from: string,
    body: string,
    categoryPrefs?: CategoryPreferences
  ): EmailCategorization {
    const prefs = categoryPrefs || DEFAULT_CATEGORY_PREFERENCES;
    const combinedText = `${subject} ${body}`.toLowerCase();
    const fromLower = from.toLowerCase();

    // Score each category
    const categoryScores: Record<string, number> = {};

    for (const [categoryKey, signals] of Object.entries(CATEGORY_SIGNALS)) {
      categoryScores[categoryKey] = this.scoreCategoryMatch(combinedText, fromLower, signals);
    }

    // Determine primary category (highest score)
    const sortedCategories = Object.entries(categoryScores).sort(([, a], [, b]) => b - a);

    const primaryCategory = sortedCategories[0][0] as EmailCategory;
    const secondaryCategories = sortedCategories
      .slice(1, 3) // Up to 2 secondary categories
      .filter(([, score]) => score > 0.5) // Only meaningful matches
      .map(([cat]) => cat as EmailCategory);

    // Determine if should save
    const shouldSave = this.shouldSaveEmail(
      primaryCategory,
      secondaryCategories,
      categoryScores as Record<EmailCategory, number>,
      prefs
    );

    const saveReasons = shouldSave
      ? this.determineSaveReasons(
          primaryCategory,
          secondaryCategories,
          categoryScores as Record<EmailCategory, number>,
          prefs
        )
      : undefined;

    return {
      primaryCategory,
      secondaryCategories,
      categoryScores: categoryScores as Record<EmailCategory, number>,
      finalConfidence: categoryScores[primaryCategory],
      shouldSave,
      saveReasons,
    };
  }
}

export default CategoryClassifier;
