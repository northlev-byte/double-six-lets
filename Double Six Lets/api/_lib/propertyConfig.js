// Single source of truth for all matching logic.
// Update these lists as new tenants, suppliers, or properties are added.

export const TENANTS = ['ilyas'];

export const PROPERTIES = {
  '39 Esher Road': { keywords: ['esher', 'l6 6de', 'l66de'], type: 'active' },
  '49 Greene Way': { keywords: ['greene way', 'greene', '49 greene'], type: 'active' },
  '105 Ladywell': { keywords: ['ladywell'], type: 'acquisition' },
};

export const KNOWN_MORTGAGE_LENDERS = [
  'onesavings', 'onesavings bank', 'tmw', 'tmw ddr', 'the mortgage works',
  'santander', 'halifax', 'nationwide', 'barclays mortgage',
];

export const INTERCOMPANY_KEYWORDS = [
  'double six holdings', 'holdings limited', 'holdings ltd',
];

export const OWNER_KEYWORDS = [
  'jordan walker // double six lets',
  'jordan walker // double six',
  'keisha walker // double six lets',
  'keisha walker // double six',
  'walker // double six lets',
];

export const OWNER_NAMES = ['jordan walker', 'keisha walker'];

export const UTILITY_PROVIDERS = [
  'united utilities', 'edf energy', 'edf', 'british gas', 'scottish power',
  'octopus', 'octopus energy', 'e.on', 'eon', 'sse', 'severn trent',
  'yorkshire water', 'thames water', 'bulb',
];

export const BROADBAND_PROVIDERS = [
  'virgin media', 'bt ', 'sky ', 'plusnet',
  'talktalk', 'hyperoptic',
];

export const MOBILE_PHONE_KEYWORDS = [
  'vodafone', 'ee ', 'three ', 'o2 ', 'giffgaff', 'tesco mobile',
  'id mobile', 'mobile phone', 'sim only',
];

export const PROFESSIONAL_FEE_KEYWORDS = [
  'finance director', 'virtual finance', 'accountant', 'accountancy',
  'solicitor', 'legal', 'capstone', 'surveyor', 'survey', 'valuation',
  'conveyancing', 'companies house', 'hmrc', 'land registry',
  'tax return', 'self assessment', 'bookkeeping',
];

export const INSURANCE_KEYWORDS = [
  'axa', 'direct line', 'aviva', 'nfu', 'landlord insurance',
  'rl360', 'insurance', 'insure', 'premium', 'policy',
];

export const MAINTENANCE_KEYWORDS = [
  'plumb', 'plumber', 'plumbing', 'electric', 'electrician',
  'builder', 'repair', 'maintenance', 'handyman', 'gas safe',
  'boiler', 'roofing', 'guttering', 'decorator', 'paint',
  'screwfix', 'toolstation', 'b&q',
];

export const MANAGEMENT_FEE_KEYWORDS = [
  'letting agent', 'management fee', 'agent fee', 'acorn',
  'openrent', 'rightmove', 'zoopla',
];

export const GROUND_RENT_KEYWORDS = [
  'ground rent', 'service charge', 'freeholder', 'management company', 'leasehold',
];

export const FURNISHING_KEYWORDS = [
  'furniture', 'furnish', 'carpet', 'curtain', 'blind', 'appliance',
  'ikea', 'argos', 'john lewis', 'currys', 'ao.com',
];

export const ACQUISITION_KEYWORDS = [
  'stamp duty', 'sdlt', 'completion', 'exchange', 'deposit',
];

// FreeAgent nominal codes — matched to actual FreeAgent category list
export const NOMINAL_CODES = {
  RENT_RECEIVED: '001',            // Sales (income_categories)
  MORTGAGE_INTEREST: '362',        // Interest Payable (admin_expenses)
  INSURANCE: '364',                // Insurance (admin_expenses)
  REPAIRS_MAINTENANCE: '101',      // Cost of Sales (property repairs/maintenance)
  GROUND_RENT: '251',              // Rent (admin_expenses — ground rent payable)
  UTILITIES_PROPERTY: '101',       // Cost of Sales (property utility bills)
  UTILITIES_ADMIN: '250',          // Office Costs (admin utility)
  TELEPHONE: '273',                // Internet & Telephone (admin_expenses)
  MOBILE_PHONE: '274',             // Mobile Phone (admin_expenses)
  TRAVEL: '365',                   // Travel (admin_expenses)
  ACCOUNTANCY: '292',              // Accountancy Fees (admin_expenses)
  PROFESSIONAL_FEES: '290',        // Legal and Professional Fees (admin_expenses)
  CONSULTANCY: '293',              // Consultancy Fees (admin_expenses)
  MANAGEMENT_FEES: '102',          // Commission Paid (cost_of_sales — letting agent fees)
  GENERAL_ADMIN: '280',            // Sundries (admin_expenses)
  SOFTWARE: '269',                 // Computer Software (admin_expenses)
  FURNISHINGS: '602',              // Capital Asset Purchase (general — fixtures)
  DIRECTOR_LOAN: '907',            // Director Loan Account (general)
  DIVIDEND: '908',                 // Dividend (general)
  INTERCOMPANY: '907',             // Director Loan Account (use for intercompany)
  ACQUISITION: '602',              // Capital Asset Purchase (general)
  BANK_CHARGES: '363',             // Bank/Finance Charges (admin_expenses)
  OFFICE_EQUIPMENT: '271',          // Office Equipment (admin_expenses)
  OFFICE_COSTS: '250',              // Office Costs (admin_expenses)
  STAFF_ENTERTAINING: '289',        // Staff Entertaining (admin_expenses — parties)
  BUSINESS_ENTERTAINING: '335',     // Business Entertaining (admin_expenses)
  TRIVIAL_BENEFITS: '280',          // Sundries (admin_expenses — trivial benefits)
  SUBSCRIPTIONS: '361',             // Subscriptions (admin_expenses)
  PRINTING: '276',                  // Printing (admin_expenses)
  POSTAGE: '358',                   // Postage (admin_expenses)
  WEB_HOSTING: '268',               // Web Hosting (admin_expenses)
  DIRECTORS_SALARY: '407',          // Directors' Salaries (general)
  DIRECTORS_NIC: '408',             // Directors' Employer NICs (general)
  MEETINGS: '285',                  // Accommodation and Meals (admin — meetings/conferences)
};
