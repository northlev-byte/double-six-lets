import { freeAgentApi } from './_lib/freeagent-auth.js';

export default async function handler(req, res) {
  // Check if FreeAgent is configured
  if (!process.env.FREEAGENT_REFRESH_TOKEN) {
    return res.status(200).json({ configured: false, error: 'FreeAgent not configured' });
  }

  try {
    if (req.method === 'GET') {
      const action = req.query.action;
      switch (action) {
        case 'categories': return handleCategories(res);
        case 'contacts': return handleContacts(res);
        case 'bank-accounts': return handleBankAccounts(res);
        case 'status': return handleStatus(res);
        case 'transactions': return handleTransactions(req, res);
        case 'invoices': return handleInvoices(res);
        case 'bills': return handleBills(res);
        case 'summary': return handleSummary(req, res);
        case 'expense-categories': return res.status(200).json({ categories: EXPENSE_CATEGORIES.map(c => ({ name: c.name, faCode: c.faCode })) });
        default: return res.status(400).json({ error: `Unknown GET action: ${action}` });
      }
    }

    if (req.method === 'POST') {
      const { action } = req.body;
      switch (action) {
        case 'create-expense': return handleCreateExpense(req.body, res);
        case 'create-bill': return handleCreateBill(req.body, res);
        case 'create-invoice': return handleCreateInvoice(req.body, res);
        case 'create-contact': return handleCreateContact(req.body, res);
        case 'explain-transaction': return handleExplainTransaction(req.body, res);
        default: return res.status(400).json({ error: `Unknown POST action: ${action}` });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('FreeAgent error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function handleStatus(res) {
  try {
    const data = await freeAgentApi('/v2/company');
    return res.status(200).json({
      configured: true,
      connected: true,
      company: data.company?.name || 'Connected',
      currency: data.company?.currency || 'GBP',
    });
  } catch (err) {
    return res.status(200).json({ configured: true, connected: false, error: err.message });
  }
}

async function handleCategories(res) {
  const data = await freeAgentApi('/v2/categories');
  const categories = (data.categories || []).map(c => ({
    url: c.url,
    description: c.description,
    nominalCode: c.nominal_code,
    group: c.group,
    autoSalesTaxRate: c.auto_sales_tax_rate,
  }));
  return res.status(200).json({ categories });
}

async function handleContacts(res) {
  const data = await freeAgentApi('/v2/contacts?view=active&per_page=100');
  const contacts = (data.contacts || []).map(c => ({
    url: c.url,
    name: c.organisation_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
    email: c.email,
    type: c.contact_name_on_invoices ? 'client' : 'supplier',
    organisationName: c.organisation_name,
    firstName: c.first_name,
    lastName: c.last_name,
  }));
  return res.status(200).json({ contacts });
}

async function handleBankAccounts(res) {
  const data = await freeAgentApi('/v2/bank_accounts');
  const accounts = (data.bank_accounts || []).map(a => ({
    url: a.url,
    name: a.name,
    type: a.type,
    currency: a.currency,
    currentBalance: a.current_balance,
  }));
  return res.status(200).json({ accounts });
}

async function handleCreateExpense(body, res) {
  const { category, amount, date, description, user } = body;
  if (!category || !amount || !date) {
    return res.status(400).json({ error: 'Missing category, amount, or date' });
  }

  const data = await freeAgentApi('/v2/expenses', 'POST', {
    expense: {
      user: user || undefined,
      category,
      dated_on: date,
      gross_value: String(amount),
      description: description || '',
      ec_status: 'UK/Non-EC',
    },
  });

  return res.status(200).json({ ok: true, expense: data.expense });
}

async function handleCreateBill(body, res) {
  const { contact, reference, date, dueDate, items, description } = body;
  if (!contact || !date || !items?.length) {
    return res.status(400).json({ error: 'Missing contact, date, or items' });
  }

  const billItems = items.map(item => ({
    category: item.category,
    total_value: String(item.amount),
    description: item.description || description || '',
    sales_tax_rate: item.salesTaxRate || undefined,
  }));

  const data = await freeAgentApi('/v2/bills', 'POST', {
    bill: {
      contact,
      reference: reference || '',
      dated_on: date,
      due_on: dueDate || date,
      bill_items: billItems,
    },
  });

  return res.status(200).json({ ok: true, bill: data.bill });
}

async function handleCreateInvoice(body, res) {
  const { contact, date, dueDate, paymentTerms, items, property } = body;
  if (!contact || !date || !items?.length) {
    return res.status(400).json({ error: 'Missing contact, date, or items' });
  }

  const invoiceItems = items.map(item => ({
    description: item.description || 'Rent',
    price: String(item.price),
    quantity: item.quantity || 1,
    item_type: item.itemType || 'Services',
  }));

  const invoice = {
    contact,
    dated_on: date,
    due_on: dueDate || date,
    payment_terms_in_days: paymentTerms || 30,
    invoice_items: invoiceItems,
  };
  if (property) invoice.property = property;

  const data = await freeAgentApi('/v2/invoices', 'POST', { invoice });
  return res.status(200).json({ ok: true, invoice: data.invoice });
}

async function handleExplainTransaction(body, res) {
  const { transactionId, category, description } = body;
  if (!transactionId || !category) {
    return res.status(400).json({ error: 'Missing transactionId or category' });
  }

  // Find the FreeAgent category URL from our expense category name
  const expCat = EXPENSE_CATEGORIES.find(c => c.name === category);
  if (!expCat) {
    return res.status(400).json({ error: `Unknown category: ${category}` });
  }

  // First get the transaction to know the amount and date
  try {
    const txData = await freeAgentApi(transactionId);
    const tx = txData.bank_transaction;
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    // Fetch FreeAgent categories to find the right URL by nominal code
    const catData = await freeAgentApi('/v2/categories');
    const faCat = (catData.categories || []).find(c => c.nominal_code === expCat.faCode);
    if (!faCat) return res.status(400).json({ error: `FreeAgent category not found for code ${expCat.faCode}` });

    // Check if already explained (unexplained_amount === 0 means fully explained)
    const unexplained = parseFloat(tx.unexplained_amount || tx.amount);
    if (Math.abs(unexplained) < 0.01) {
      // Already explained — find and delete existing explanation, then re-create
      try {
        const existingExps = await freeAgentApi(`/v2/bank_transaction_explanations?bank_transaction=${encodeURIComponent(transactionId)}`);
        const exps = existingExps.bank_transaction_explanations || [];
        for (const exp of exps) {
          await freeAgentApi(exp.url, 'DELETE');
        }
      } catch (delErr) {
        // If we can't delete, still try to create — FreeAgent may reject if truly duplicate
      }
    }

    // Create bank transaction explanation
    const data = await freeAgentApi('/v2/bank_transaction_explanations', 'POST', {
      bank_transaction_explanation: {
        bank_transaction: transactionId,
        category: faCat.url,
        dated_on: tx.dated_on,
        description: description || tx.description || '',
        gross_value: String(unexplained !== 0 ? unexplained : tx.amount),
      },
    });

    return res.status(200).json({ ok: true, explanation: data.bank_transaction_explanation, replaced: Math.abs(unexplained) < 0.01 });
  } catch (err) {
    return res.status(500).json({ error: `Failed to explain transaction: ${err.message}` });
  }
}

async function handleCreateContact(body, res) {
  const { organisationName, firstName, lastName, email } = body;
  if (!organisationName && !firstName) {
    return res.status(400).json({ error: 'Missing organisationName or firstName' });
  }

  const contact = {};
  if (organisationName) contact.organisation_name = organisationName;
  if (firstName) contact.first_name = firstName;
  if (lastName) contact.last_name = lastName;
  if (email) contact.email = email;

  const data = await freeAgentApi('/v2/contacts', 'POST', { contact });
  return res.status(200).json({ ok: true, contact: data.contact });
}

// -- Financial data handlers --

const PROPERTIES = [
  { name: '39 Esher Road', keywords: ['esher', 'l6 6de', 'l66de'] },
  { name: '49 Greene Way', keywords: ['greene', 'greene way'] },
  { name: '105 Ladywell', keywords: ['ladywell'] },
];

// Expense categories with FreeAgent nominal codes and keyword auto-matching
const EXPENSE_CATEGORIES = [
  { name: 'Mortgage / Finance', faCode: '270', keywords: ['mortgage', 'interest', 'loan', 'finance', 'lending', 'nationwide', 'santander', 'barclays', 'hsbc', 'natwest', 'halifax', 'capital repayment'] },
  { name: 'Insurance', faCode: '273', keywords: ['insurance', 'insure', 'policy', 'premium', 'cover', 'axa', 'aviva', 'direct line', 'rl360', 'landlord insurance'] },
  { name: 'Repairs & Maintenance', faCode: '285', keywords: ['repair', 'maintenance', 'plumber', 'plumbing', 'electrician', 'boiler', 'fix', 'handyman', 'builder', 'roofing', 'guttering', 'paint', 'decorator', 'screwfix', 'toolstation', 'b&q'] },
  { name: 'Letting Agent Fees', faCode: '270', keywords: ['letting agent', 'management fee', 'agent fee', 'commission', 'acorn', 'openrent', 'rightmove', 'zoopla', 'onthemarket'] },
  { name: 'Accountancy', faCode: '270', keywords: ['accountant', 'accountancy', 'bookkeeping', 'tax return', 'self assessment', 'hmrc', 'companies house', 'annual return'] },
  { name: 'Legal / Professional', faCode: '270', keywords: ['solicitor', 'legal', 'conveyancing', 'survey', 'valuation', 'stamp duty', 'sdlt', 'land registry', 'searches'] },
  { name: 'Utilities', faCode: '291', keywords: ['electric', 'gas', 'water', 'council tax', 'utility', 'british gas', 'edf', 'eon', 'sse', 'octopus', 'bulb', 'thames water', 'united utilities', 'severn trent'] },
  { name: 'Ground Rent / Service Charge', faCode: '289', keywords: ['ground rent', 'service charge', 'freeholder', 'management company', 'leasehold'] },
  { name: 'Furnishings', faCode: '285', keywords: ['furniture', 'furnish', 'carpet', 'curtain', 'blind', 'appliance', 'ikea', 'argos', 'amazon', 'john lewis', 'currys', 'ao.com'] },
  { name: 'Travel', faCode: '294', keywords: ['travel', 'mileage', 'petrol', 'fuel', 'parking', 'train', 'rail'] },
  { name: 'Software / Tech', faCode: '298', keywords: ['software', 'subscription', 'saas', 'google', 'microsoft', 'xero', 'freeagent', 'slack', 'zoom', 'domain', 'hosting', 'vercel', 'cloud'] },
  { name: 'Director Expenses — Jordan Walker', faCode: '270', keywords: ['jordan walker expenses', 'jw expenses'] },
  { name: 'Director Expenses — Keisha Walker', faCode: '270', keywords: ['keisha walker expenses', 'kw expenses'] },
  { name: 'Director Loan — Jordan Walker', faCode: '270', keywords: ['jordan walker'] },
  { name: 'Director Loan — Keisha Walker', faCode: '270', keywords: ['keisha walker'] },
  { name: 'Intercompany / Dividends', faCode: '270', keywords: ['double six holdings', 'dsh', 'holdings limited', 'holdings ltd', 'dividend', 'intercompany'] },
  { name: 'Rent Income', faCode: '001', keywords: ['rent', 'tenant', 'rental income', 'standing order'] },
  { name: 'General / Other', faCode: '298', keywords: [] },
];

function matchProperty(text) {
  const lower = (text || '').toLowerCase();
  for (const p of PROPERTIES) {
    if (p.keywords.some(k => lower.includes(k))) return p.name;
  }
  return 'Unassigned';
}

function suggestCategory(text, amount) {
  const lower = (text || '').toLowerCase();
  // If it's income, suggest Rent Income
  if (amount > 0) return 'Rent Income';
  for (const cat of EXPENSE_CATEGORIES) {
    if (cat.keywords.length && cat.keywords.some(k => lower.includes(k))) return cat.name;
  }
  return 'General / Other';
}

async function handleTransactions(req, res) {
  const from = req.query.from || taxYearStart();
  const to = req.query.to || today();

  // FreeAgent requires bank_account for transactions — fetch all accounts first
  let accounts = [];
  try {
    const accData = await freeAgentApi('/v2/bank_accounts');
    accounts = (accData.bank_accounts || []).map(a => a.url);
  } catch (e) { accounts = []; }

  let allTx = [];
  for (const acct of accounts) {
    let page = 1;
    while (page <= 5) {
      try {
        const data = await freeAgentApi(`/v2/bank_transactions?bank_account=${encodeURIComponent(acct)}&from_date=${from}&to_date=${to}&per_page=100&page=${page}`);
        const txs = data.bank_transactions || [];
        allTx = allTx.concat(txs);
        if (txs.length < 100) break;
        page++;
      } catch (e) { break; }
    }
  }

  const transactions = allTx.map(t => {
    const amt = parseFloat(t.amount || 0);
    const desc = `${t.description || ''} ${t.full_description || ''}`;
    const unexplained = parseFloat(t.unexplained_amount || t.amount);
    return {
      id: t.url, date: t.dated_on, amount: amt,
      description: t.description || '', category: t.category || '',
      bankAccount: t.bank_account || '',
      explained: Math.abs(unexplained) < 0.01,
      property: matchProperty(desc),
      suggestedCategory: suggestCategory(desc, amt),
    };
  });
  return res.status(200).json({ transactions });
}

async function handleInvoices(res) {
  let allInv = [];
  let page = 1;
  while (page <= 5) {
    const data = await freeAgentApi(`/v2/invoices?per_page=100&page=${page}`);
    const invs = data.invoices || [];
    allInv = allInv.concat(invs);
    if (invs.length < 100) break;
    page++;
  }
  const invoices = allInv.map(i => ({
    id: i.url, contact: i.contact, contactName: i.contact_name || '',
    amount: parseFloat(i.total_value || i.net_value || 0),
    status: i.status || 'Draft', datedOn: i.dated_on, dueOn: i.due_on,
    reference: i.reference || '',
    property: matchProperty(`${i.reference || ''} ${i.contact_name || ''} ${(i.invoice_items || []).map(x => x.description || '').join(' ')}`),
  }));
  return res.status(200).json({ invoices });
}

async function handleBills(res) {
  let allBills = [];
  let page = 1;
  while (page <= 5) {
    const data = await freeAgentApi(`/v2/bills?per_page=100&page=${page}`);
    const bills = data.bills || [];
    allBills = allBills.concat(bills);
    if (bills.length < 100) break;
    page++;
  }
  const result = allBills.map(b => ({
    id: b.url, contact: b.contact, contactName: b.contact_name || '',
    totalValue: parseFloat(b.total_value || 0), status: b.status || 'Open',
    datedOn: b.dated_on, dueOn: b.due_on, category: b.category || '',
    reference: b.reference || '',
    property: matchProperty(`${b.reference || ''} ${b.contact_name || ''} ${(b.bill_items || []).map(x => x.description || '').join(' ')}`),
  }));
  return res.status(200).json({ bills: result });
}

async function handleSummary(req, res) {
  const from = req.query.from || taxYearStart();
  const to = req.query.to || today();

  // Fetch all data in parallel with fallbacks
  const [txRes, invRes, billRes] = await Promise.all([
    handleTransactionsRaw(from, to).catch(() => []),
    handleInvoicesRaw().catch(() => []),
    handleBillsRaw().catch(() => []),
  ]);

  const byProperty = {};
  const propNames = ['39 Esher Road', '49 Greene Way', '105 Ladywell', 'Unassigned'];
  propNames.forEach(p => { byProperty[p] = { income: 0, expenses: 0, profit: 0, transactions: [] }; });

  let totalIncome = 0, totalExpenses = 0;

  // Process transactions
  txRes.forEach(t => {
    const prop = t.property;
    if (!byProperty[prop]) byProperty[prop] = { income: 0, expenses: 0, profit: 0, transactions: [] };
    byProperty[prop].transactions.push(t);
    if (t.amount > 0) { totalIncome += t.amount; byProperty[prop].income += t.amount; }
    else { totalExpenses += Math.abs(t.amount); byProperty[prop].expenses += Math.abs(t.amount); }
  });

  propNames.forEach(p => { if (byProperty[p]) byProperty[p].profit = byProperty[p].income - byProperty[p].expenses; });

  // Monthly totals
  const monthMap = {};
  txRes.forEach(t => {
    const m = (t.date || '').substring(0, 7);
    if (!m) return;
    if (!monthMap[m]) monthMap[m] = { month: m, income: 0, expenses: 0, profit: 0 };
    if (t.amount > 0) monthMap[m].income += t.amount;
    else monthMap[m].expenses += Math.abs(t.amount);
  });
  const monthlyTotals = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
  monthlyTotals.forEach(m => { m.profit = m.income - m.expenses; });

  // Expense breakdown by category
  const catMap = {};
  txRes.filter(t => t.amount < 0).forEach(t => {
    const cat = t.description || 'Other';
    catMap[cat] = (catMap[cat] || 0) + Math.abs(t.amount);
  });
  const expenseBreakdown = Object.entries(catMap).map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total).slice(0, 15);

  // Invoices
  const unpaidInvoices = invRes.filter(i => ['Draft', 'Sent', 'Viewed', 'Reminded'].includes(i.status));
  const overdueInvoices = unpaidInvoices.filter(i => i.dueOn && new Date(i.dueOn) < new Date());
  const upcomingBills = billRes.filter(b => ['Open', 'Overdue'].includes(b.status));

  return res.status(200).json({
    totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses,
    byProperty, monthlyTotals, expenseBreakdown,
    unpaidInvoices, overdueInvoices, upcomingBills,
    invoiceCount: invRes.length, billCount: billRes.length,
  });
}

// Raw data helpers (avoid double-serialisation)
async function handleTransactionsRaw(from, to) {
  // Fetch bank accounts first
  let accounts = [];
  try {
    const accData = await freeAgentApi('/v2/bank_accounts');
    accounts = (accData.bank_accounts || []).map(a => a.url);
  } catch (e) { accounts = []; }

  let allTx = [];
  for (const acct of accounts) {
    let page = 1;
    while (page <= 3) {
      try {
        const data = await freeAgentApi(`/v2/bank_transactions?bank_account=${encodeURIComponent(acct)}&from_date=${from}&to_date=${to}&per_page=100&page=${page}`);
        const txs = data.bank_transactions || [];
        allTx = allTx.concat(txs);
        if (txs.length < 100) break;
        page++;
      } catch (e) { break; }
    }
  }
  return allTx.map(t => {
    const amt = parseFloat(t.amount || 0);
    const desc = `${t.description || ''} ${t.full_description || ''}`;
    const unexplained = parseFloat(t.unexplained_amount || t.amount);
    return {
      id: t.url, date: t.dated_on, amount: amt,
      description: t.description || '', category: t.category || '',
      explained: Math.abs(unexplained) < 0.01,
      property: matchProperty(desc),
      suggestedCategory: suggestCategory(desc, amt),
    };
  });
}

async function handleInvoicesRaw() {
  let all = [], page = 1;
  while (page <= 5) {
    const data = await freeAgentApi(`/v2/invoices?per_page=100&page=${page}`);
    const items = data.invoices || [];
    all = all.concat(items);
    if (items.length < 100) break;
    page++;
  }
  return all.map(i => ({
    id: i.url, contactName: i.contact_name || '',
    amount: parseFloat(i.total_value || i.net_value || 0),
    status: i.status || 'Draft', datedOn: i.dated_on, dueOn: i.due_on,
    reference: i.reference || '',
    property: matchProperty(`${i.reference || ''} ${i.contact_name || ''}`),
  }));
}

async function handleBillsRaw() {
  let all = [], page = 1;
  while (page <= 5) {
    const data = await freeAgentApi(`/v2/bills?per_page=100&page=${page}`);
    const items = data.bills || [];
    all = all.concat(items);
    if (items.length < 100) break;
    page++;
  }
  return all.map(b => ({
    id: b.url, contactName: b.contact_name || '',
    totalValue: parseFloat(b.total_value || 0), status: b.status || 'Open',
    datedOn: b.dated_on, dueOn: b.due_on, reference: b.reference || '',
    property: matchProperty(`${b.reference || ''} ${b.contact_name || ''}`),
  }));
}

function taxYearStart() {
  const now = new Date();
  // Company financial year starts November 1 (year end is October 31)
  const month = now.getMonth(); // 0-indexed: 10 = November
  const year = month >= 10 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-11-01`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}
