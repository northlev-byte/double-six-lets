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
];

export const OWNER_NAMES = ['jordan walker', 'keisha walker'];

export const UTILITY_PROVIDERS = [
  'united utilities', 'edf energy', 'edf', 'british gas', 'scottish power',
  'octopus', 'octopus energy', 'e.on', 'eon', 'sse', 'severn trent',
  'yorkshire water', 'thames water', 'bulb',
];

export const BROADBAND_PROVIDERS = [
  'virgin media', 'bt ', 'sky ', 'plusnet', 'vodafone', 'ee ',
  'talktalk', 'hyperoptic',
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

// FreeAgent nominal codes — correct for UK property letting company
export const NOMINAL_CODES = {
  RENT_RECEIVED: '001',            // Sales / Rent received
  MORTGAGE_INTEREST: '270',        // Loan Interest Paid (only interest portion)
  INSURANCE: '273',                // Insurance
  REPAIRS_MAINTENANCE: '285',      // Repairs & Maintenance
  GROUND_RENT: '289',              // Rent (ground rent / service charge)
  UTILITIES: '291',                // Light, Heat & Power
  TRAVEL: '294',                   // Motor & Travel
  PROFESSIONAL_FEES: '270',        // Professional Fees
  MANAGEMENT_FEES: '270',          // Agent / Management Fees
  GENERAL_ADMIN: '298',            // General Administrative
  SOFTWARE: '298',                 // Computer / IT Costs
  FURNISHINGS: '285',              // Fixtures & Fittings (treat as R&M for revenue)
  DIRECTOR_LOAN: '270',            // Directors Loan Account
  INTERCOMPANY: '270',             // Intercompany
  ACQUISITION: '270',              // Capital expenditure / acquisition costs
};
