import {
  TENANTS, PROPERTIES, KNOWN_MORTGAGE_LENDERS, INTERCOMPANY_KEYWORDS,
  OWNER_KEYWORDS, OWNER_NAMES, UTILITY_PROVIDERS, BROADBAND_PROVIDERS,
  MOBILE_PHONE_KEYWORDS, PROFESSIONAL_FEE_KEYWORDS, INSURANCE_KEYWORDS,
  MAINTENANCE_KEYWORDS, MANAGEMENT_FEE_KEYWORDS, GROUND_RENT_KEYWORDS,
  FURNISHING_KEYWORDS, ACQUISITION_KEYWORDS, NOMINAL_CODES,
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
  // Note: FreeAgent labels all director transfers as "Jordan Walker // Double Six Lets Lt"
  // regardless of who made them. We label generically; user can manually assign to Jordan/Keisha.
  if (has(desc, OWNER_KEYWORDS)) {
    // Try to detect specific director from description
    const isKeisha = desc.includes('keisha');
    const directorName = isKeisha ? 'Keisha Walker' : null; // null = ambiguous, could be either
    result.reportingCategory = directorName
      ? `Director Loan \u2014 ${directorName}`
      : 'Director Loan';
    result.freeagentNominal = NOMINAL_CODES.DIRECTOR_LOAN;
    result.incomeType = isCredit ? 'intercompany' : null;
    result.expenseType = !isCredit ? 'intercompany' : null;
    result.excludeFromPnL = true;
    result.confidence = isKeisha ? 'high' : 'medium';
    result.requiresReview = !isKeisha; // flag for review since we can't tell Jordan from Keisha
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
    result.freeagentNominal = NOMINAL_CODES.DIVIDEND;
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
    // Default to "Mortgage Interest Payable" since that's the allowable portion
    result.reportingCategory = 'Mortgage Interest Payable';
    result.freeagentNominal = NOMINAL_CODES.MORTGAGE_INTEREST;
    result.expenseType = 'mortgage';
    result.confidence = 'high';
    result.requiresReview = false;
    result.taxFlags.push({
      code: 'SECTION_24',
      message: 'Section 24 — only the interest portion of this mortgage payment is tax-deductible. Capital repayment is not an allowable expense. You may need to split this into interest vs capital.',
      severity: 'warning',
      dismissable: true,
    });
    return result;
  }

  // Utilities — Property (energy, water at rental properties = cost of sale)
  if (has(desc, UTILITY_PROVIDERS)) {
    const linkedProperty = matchProperty(tx.description);
    result.reportingCategory = linkedProperty ? 'Utilities \u2014 Property' : 'Utilities \u2014 Property';
    result.freeagentNominal = NOMINAL_CODES.UTILITIES_PROPERTY;
    result.expenseType = 'utilities';
    result.confidence = 'high';
    result.requiresReview = false;
    return result;
  }

  // Mobile Phone (employee)
  if (has(desc, MOBILE_PHONE_KEYWORDS)) {
    result.reportingCategory = 'Employee Mobile Phone';
    result.freeagentNominal = NOMINAL_CODES.MOBILE_PHONE;
    result.expenseType = 'other';
    result.confidence = 'high';
    result.requiresReview = false;
    return result;
  }

  // Broadband / Internet (office/admin utility)
  if (has(desc, BROADBAND_PROVIDERS)) {
    result.reportingCategory = 'Utilities \u2014 Broadband';
    result.freeagentNominal = NOMINAL_CODES.TELEPHONE;
    result.expenseType = 'utilities';
    result.confidence = 'high';
    result.requiresReview = false;
    return result;
  }

  // Professional Fees (accountancy, legal, surveyor)
  if (has(desc, PROFESSIONAL_FEE_KEYWORDS)) {
    // Distinguish accountancy from legal/other professional
    const isAccountancy = has(desc, ['accountant', 'accountancy', 'finance director', 'virtual finance', 'bookkeeping', 'tax return', 'self assessment']);
    result.reportingCategory = isAccountancy ? 'Accountancy Fees' : 'Professional Fees';
    result.freeagentNominal = isAccountancy ? NOMINAL_CODES.ACCOUNTANCY : NOMINAL_CODES.PROFESSIONAL_FEES;
    result.expenseType = 'professional_fees';
    result.confidence = 'high';
    result.requiresReview = false;

    // Check if it's acquisition-related (conveyancing, searches, stamp duty)
    if (has(desc, ACQUISITION_KEYWORDS) || has(desc, ['conveyancing', 'searches'])) {
      result.taxFlags.push({
        code: 'ACQUISITION_COST',
        message: 'This may be an acquisition cost (capital) rather than a revenue expense. Acquisition costs are not deductible against rental income.',
        severity: 'warning',
        dismissable: true,
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
      dismissable: true,
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
      dismissable: true,
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
      dismissable: true,
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
  // Income
  'Rent Income', 'Other Income',
  // Excluded from P&L
  'Intercompany Transfer', 'Director Loan', 'Dividend',
  'Director Loan \u2014 Jordan Walker', 'Director Loan \u2014 Keisha Walker',
  'Director Loan In', 'Director Loan Out',
  // Property costs
  'Mortgage Interest Payable', 'Mortgage Payment',
  'Utilities \u2014 Property', 'Utilities \u2014 Broadband', 'Employee Mobile Phone',
  'Maintenance & Repairs', 'Insurance', 'Management Fees',
  'Ground Rent / Service Charge', 'Furnishings',
  // Professional
  'Accountancy Fees', 'Professional Fees',
  // Staff & office
  'Directors\u2019 Salary', 'Directors\u2019 NIC',
  'Office Equipment', 'Office Costs',
  'Staff Party / Entertaining', 'Business Entertaining', 'Trivial Benefits',
  'Subscriptions', 'Printing & Postage', 'Web Hosting',
  'Bank Charges',
  // Capital
  'Acquisition Costs',
  // Fallback
  'General / Other',
];
