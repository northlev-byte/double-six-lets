import {
  TENANTS, PROPERTIES, KNOWN_MORTGAGE_LENDERS, INTERCOMPANY_KEYWORDS,
  OWNER_KEYWORDS, OWNER_NAMES, UTILITY_PROVIDERS, BROADBAND_PROVIDERS,
  PROFESSIONAL_FEE_KEYWORDS, INSURANCE_KEYWORDS, MAINTENANCE_KEYWORDS,
  MANAGEMENT_FEE_KEYWORDS, GROUND_RENT_KEYWORDS, FURNISHING_KEYWORDS,
  ACQUISITION_KEYWORDS, NOMINAL_CODES,
} from './propertyConfig.js';

function lower(s) { return (s || '').toLowerCase(); }
function has(text, keywords) { return keywords.some(k => text.includes(k)); }

// Extract property hint from transaction description
function matchProperty(text) {
  const l = lower(text);
  for (const [name, cfg] of Object.entries(PROPERTIES)) {
    if (cfg.keywords.some(k => l.includes(k))) return name;
  }
  return null;
}

/**
 * Categorise a bank transaction for reporting and FreeAgent sync.
 * @param {{ description: string, amount: number, type?: string }} tx
 * @returns {object} categorisation result
 */
export function categoriseTransaction(tx) {
  const desc = lower(tx.description || '');
  const amount = parseFloat(tx.amount || 0);
  const isCredit = amount > 0;
  const propertyHint = matchProperty(tx.description) || 'Unassigned';

  // Default result
  const result = {
    reportingCategory: 'General / Other',
    freeagentNominal: NOMINAL_CODES.GENERAL_ADMIN,
    incomeType: null,
    expenseType: null,
    excludeFromPnL: false,
    propertyHint,
    confidence: 'low',
    requiresReview: true,
    taxFlags: [],
  };

  // ──────────────────────────────────────────────────
  // PRIORITY 1: INTERCOMPANY / EXCLUDE FROM P&L
  // ──────────────────────────────────────────────────

  // Owner drawings / transfers to/from company
  if (has(desc, OWNER_KEYWORDS)) {
    result.reportingCategory = 'Owner Drawing / Intercompany';
    result.freeagentNominal = NOMINAL_CODES.DIRECTOR_LOAN;
    result.incomeType = isCredit ? 'intercompany' : null;
    result.expenseType = !isCredit ? 'intercompany' : null;
    result.excludeFromPnL = true;
    result.confidence = 'high';
    result.requiresReview = false;
    return result;
  }

  // Intercompany transfers (Double Six Holdings)
  if (has(desc, INTERCOMPANY_KEYWORDS)) {
    result.reportingCategory = 'Intercompany Transfer';
    result.freeagentNominal = NOMINAL_CODES.INTERCOMPANY;
    result.incomeType = isCredit ? 'intercompany' : null;
    result.expenseType = !isCredit ? 'intercompany' : null;
    result.excludeFromPnL = true;
    result.confidence = 'high';
    result.requiresReview = false;
    return result;
  }

  // Dividends
  if (desc.includes('dividend')) {
    result.reportingCategory = 'Dividend';
    result.freeagentNominal = NOMINAL_CODES.INTERCOMPANY;
    result.incomeType = isCredit ? 'intercompany' : null;
    result.expenseType = !isCredit ? 'intercompany' : null;
    result.excludeFromPnL = true;
    result.confidence = 'high';
    result.requiresReview = false;
    return result;
  }

  // Director loan — owner name but NOT the owner-to-company keyword pattern
  if (has(desc, OWNER_NAMES) && !has(desc, OWNER_KEYWORDS)) {
    result.reportingCategory = isCredit ? 'Director Loan In' : 'Director Loan Out';
    result.freeagentNominal = NOMINAL_CODES.DIRECTOR_LOAN;
    result.incomeType = isCredit ? 'intercompany' : null;
    result.expenseType = !isCredit ? 'intercompany' : null;
    result.excludeFromPnL = true;
    result.confidence = 'medium';
    result.requiresReview = true;
    return result;
  }

  // ──────────────────────────────────────────────────
  // PRIORITY 2: RENTAL INCOME (credits, not intercompany)
  // ──────────────────────────────────────────────────

  if (isCredit) {
    // Check for tenant names
    const isTenant = has(desc, TENANTS);
    // Check for property keywords in credit description
    const hasPropertyRef = matchProperty(tx.description) !== null;

    if (isTenant || hasPropertyRef) {
      result.reportingCategory = 'Rent Income';
      result.freeagentNominal = NOMINAL_CODES.RENT_RECEIVED;
      result.incomeType = 'rental_income';
      result.confidence = isTenant ? 'high' : 'medium';
      result.requiresReview = !isTenant;
      return result;
    }

    // Unknown credit — could be rental, refund, or other
    result.reportingCategory = 'Other Income';
    result.incomeType = 'other_income';
    result.confidence = 'low';
    result.requiresReview = true;
    return result;
  }

  // ──────────────────────────────────────────────────
  // PRIORITY 3: EXPENSES (debits)
  // ──────────────────────────────────────────────────

  // Mortgage / Finance
  if (has(desc, KNOWN_MORTGAGE_LENDERS)) {
    result.reportingCategory = 'Mortgage Payment';
    result.freeagentNominal = NOMINAL_CODES.MORTGAGE_INTEREST;
    result.expenseType = 'mortgage';
    result.confidence = 'high';
    result.requiresReview = false;
    result.taxFlags.push({
      code: 'SECTION_24',
      message: 'Section 24 — only the interest portion of this mortgage payment is tax-deductible. Capital repayment is not an allowable expense.',
      severity: 'warning',
    });
    return result;
  }

  // Utilities (energy, water)
  if (has(desc, UTILITY_PROVIDERS)) {
    result.reportingCategory = 'Utilities';
    result.freeagentNominal = NOMINAL_CODES.UTILITIES;
    result.expenseType = 'utilities';
    result.confidence = 'high';
    result.requiresReview = false;
    return result;
  }

  // Broadband / Phone (still utilities category)
  if (has(desc, BROADBAND_PROVIDERS)) {
    result.reportingCategory = 'Utilities — Broadband';
    result.freeagentNominal = NOMINAL_CODES.UTILITIES;
    result.expenseType = 'utilities';
    result.confidence = 'high';
    result.requiresReview = false;
    return result;
  }

  // Professional Fees (accountancy, legal, surveyor)
  if (has(desc, PROFESSIONAL_FEE_KEYWORDS)) {
    result.reportingCategory = 'Professional Fees';
    result.freeagentNominal = NOMINAL_CODES.PROFESSIONAL_FEES;
    result.expenseType = 'professional_fees';
    result.confidence = 'high';
    result.requiresReview = false;

    // Check if it's acquisition-related (conveyancing, searches, stamp duty)
    if (has(desc, ACQUISITION_KEYWORDS) || has(desc, ['conveyancing', 'searches'])) {
      result.taxFlags.push({
        code: 'ACQUISITION_COST',
        message: 'This may be an acquisition cost (capital) rather than a revenue expense. Acquisition costs are not deductible against rental income.',
        severity: 'warning',
      });
    }
    return result;
  }

  // Insurance
  if (has(desc, INSURANCE_KEYWORDS)) {
    result.reportingCategory = 'Insurance';
    result.freeagentNominal = NOMINAL_CODES.INSURANCE;
    result.expenseType = 'insurance';
    result.confidence = 'high';
    result.requiresReview = false;
    return result;
  }

  // Maintenance / Repairs
  if (has(desc, MAINTENANCE_KEYWORDS)) {
    result.reportingCategory = 'Maintenance & Repairs';
    result.freeagentNominal = NOMINAL_CODES.REPAIRS_MAINTENANCE;
    result.expenseType = 'maintenance';
    result.confidence = 'medium';
    result.requiresReview = false;
    result.taxFlags.push({
      code: 'CAPEX_VS_REVENUE',
      message: 'Verify this is a repair (revenue, deductible) and not an improvement (capital, not immediately deductible).',
      severity: 'info',
    });
    return result;
  }

  // Management / Letting Agent Fees
  if (has(desc, MANAGEMENT_FEE_KEYWORDS)) {
    result.reportingCategory = 'Management Fees';
    result.freeagentNominal = NOMINAL_CODES.MANAGEMENT_FEES;
    result.expenseType = 'management_fees';
    result.confidence = 'high';
    result.requiresReview = false;
    return result;
  }

  // Ground Rent / Service Charge
  if (has(desc, GROUND_RENT_KEYWORDS)) {
    result.reportingCategory = 'Ground Rent / Service Charge';
    result.freeagentNominal = NOMINAL_CODES.GROUND_RENT;
    result.expenseType = 'other';
    result.confidence = 'high';
    result.requiresReview = false;
    return result;
  }

  // Furnishings
  if (has(desc, FURNISHING_KEYWORDS)) {
    result.reportingCategory = 'Furnishings';
    result.freeagentNominal = NOMINAL_CODES.FURNISHINGS;
    result.expenseType = 'other';
    result.confidence = 'medium';
    result.requiresReview = false;
    result.taxFlags.push({
      code: 'CAPEX_VS_REVENUE',
      message: 'Furnishings may qualify for Replacement Domestic Items Relief rather than immediate deduction.',
      severity: 'info',
    });
    return result;
  }

  // Acquisition-specific costs (stamp duty etc.) for properties being purchased
  if (has(desc, ACQUISITION_KEYWORDS)) {
    result.reportingCategory = 'Acquisition Costs';
    result.freeagentNominal = NOMINAL_CODES.ACQUISITION;
    result.expenseType = 'other';
    result.excludeFromPnL = true;
    result.confidence = 'medium';
    result.requiresReview = true;
    result.taxFlags.push({
      code: 'ACQUISITION_COST',
      message: 'Acquisition cost — capital expenditure, not deductible against rental income. Added to base cost for CGT purposes.',
      severity: 'warning',
    });
    return result;
  }

  // Fallthrough — unclassified expense
  result.reportingCategory = 'General / Other';
  result.freeagentNominal = NOMINAL_CODES.GENERAL_ADMIN;
  result.expenseType = 'other';
  result.confidence = 'low';
  result.requiresReview = true;
  return result;
}

// Re-export matchProperty for use by the API
export { matchProperty };

// List of all reporting categories (for frontend dropdown)
export const REPORTING_CATEGORIES = [
  'Rent Income', 'Other Income',
  'Intercompany Transfer', 'Owner Drawing / Intercompany', 'Dividend',
  'Director Loan In', 'Director Loan Out',
  'Mortgage Payment', 'Utilities', 'Utilities — Broadband',
  'Professional Fees', 'Insurance', 'Maintenance & Repairs',
  'Management Fees', 'Ground Rent / Service Charge', 'Furnishings',
  'Acquisition Costs', 'General / Other',
];
