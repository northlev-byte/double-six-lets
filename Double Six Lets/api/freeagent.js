import { freeAgentApi } from './_lib/freeagent-auth.js';
import { categoriseTransaction, matchProperty, REPORTING_CATEGORIES } from './_lib/categoriseTransaction.js';
import { PROPERTIES, NOMINAL_CODES } from './_lib/propertyConfig.js';

export default async function handler(req, res) {
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
        case 'reporting-categories': return res.status(200).json({ categories: REPORTING_CATEGORIES });
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
        case 'explain-bulk': return handleExplainBulk(req.body, res);
        case 'ai-categorise': return handleAICategorise(req.body, res);
        default: return res.status(400).json({ error: `Unknown POST action: ${action}` });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('FreeAgent error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── Status & lookups ─────────────────────────────────

async function handleStatus(res) {
  try {
    const data = await freeAgentApi('/v2/company');
    return res.status(200).json({
      configured: true, connected: true,
      company: data.company?.name || 'Connected',
      currency: data.company?.currency || 'GBP',
    });
  } catch (err) {
    return res.status(200).json({ configured: true, connected: false, error: err.message });
  }
}

async function handleCategories(res) {
  const cats = await getAllFACategories();
  return res.status(200).json({ categories: cats.map(c => ({ url: c.url, description: c.description, nominalCode: c.nominal_code, group: c._group })) });
}

async function handleContacts(res) {
  const data = await freeAgentApi('/v2/contacts?view=active&per_page=100');
  const contacts = (data.contacts || []).map(c => ({
    url: c.url,
    name: c.organisation_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
    email: c.email, type: c.contact_name_on_invoices ? 'client' : 'supplier',
    organisationName: c.organisation_name,
    firstName: c.first_name, lastName: c.last_name,
  }));
  return res.status(200).json({ contacts });
}

async function handleBankAccounts(res) {
  const data = await freeAgentApi('/v2/bank_accounts');
  const accounts = (data.bank_accounts || []).map(a => ({
    url: a.url, name: a.name, type: a.type,
    currency: a.currency, currentBalance: a.current_balance,
  }));
  return res.status(200).json({ accounts });
}

// ── Create records ───────────────────────────────────

async function handleCreateExpense(body, res) {
  const { category, amount, date, description, user } = body;
  if (!category || !amount || !date) {
    return res.status(400).json({ error: 'Missing category, amount, or date' });
  }
  const data = await freeAgentApi('/v2/expenses', 'POST', {
    expense: {
      user: user || undefined, category, dated_on: date,
      gross_value: String(amount), description: description || '',
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
    category: item.category, total_value: String(item.amount),
    description: item.description || description || '',
    sales_tax_rate: item.salesTaxRate || undefined,
  }));
  const data = await freeAgentApi('/v2/bills', 'POST', {
    bill: { contact, reference: reference || '', dated_on: date,
      due_on: dueDate || date, bill_items: billItems },
  });
  return res.status(200).json({ ok: true, bill: data.bill });
}

async function handleCreateInvoice(body, res) {
  const { contact, date, dueDate, paymentTerms, items, property } = body;
  if (!contact || !date || !items?.length) {
    return res.status(400).json({ error: 'Missing contact, date, or items' });
  }
  const invoiceItems = items.map(item => ({
    description: item.description || 'Rent', price: String(item.price),
    quantity: item.quantity || 1, item_type: item.itemType || 'Services',
  }));
  const invoice = { contact, dated_on: date, due_on: dueDate || date,
    payment_terms_in_days: paymentTerms || 30, invoice_items: invoiceItems };
  if (property) invoice.property = property;
  const data = await freeAgentApi('/v2/invoices', 'POST', { invoice });
  return res.status(200).json({ ok: true, invoice: data.invoice });
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

// ── Explain (sync category to FreeAgent) ─────────────

// Cache FreeAgent categories to avoid repeated fetches
let faCatCache = null;
let faCatCacheExpiry = 0;

async function getAllFACategories() {
  if (faCatCache && Date.now() < faCatCacheExpiry) return faCatCache;
  const data = await freeAgentApi('/v2/categories');
  // FreeAgent groups categories under keys: admin_expenses_categories, cost_of_sales_categories, income_categories, general_categories
  let all = [];
  for (const key of Object.keys(data || {})) {
    const arr = data[key];
    if (Array.isArray(arr)) {
      arr.forEach(c => { c._group = key; all.push(c); });
    }
  }
  faCatCache = all;
  faCatCacheExpiry = Date.now() + 5 * 60 * 1000;
  return faCatCache;
}

async function explainSingleTransaction(transactionId, nominalCode, description) {
  const txData = await freeAgentApi(transactionId);
  const tx = txData.bank_transaction;
  if (!tx) throw new Error('Transaction not found');

  const allCats = await getAllFACategories();
  const faCat = allCats.find(c => c.nominal_code === nominalCode);
  if (!faCat) throw new Error(`FreeAgent category not found for nominal code ${nominalCode}`);

  const unexplained = parseFloat(tx.unexplained_amount || tx.amount);
  let replaced = false;

  // If already explained, delete existing explanations first
  if (Math.abs(unexplained) < 0.01) {
    replaced = true;
    try {
      const existing = await freeAgentApi(`/v2/bank_transaction_explanations?bank_transaction=${encodeURIComponent(transactionId)}`);
      for (const exp of (existing.bank_transaction_explanations || [])) {
        await freeAgentApi(exp.url, 'DELETE');
      }
    } catch (e) { /* continue anyway */ }
  }

  const data = await freeAgentApi('/v2/bank_transaction_explanations', 'POST', {
    bank_transaction_explanation: {
      bank_transaction: transactionId, category: faCat.url,
      dated_on: tx.dated_on,
      description: description || tx.description || '',
      gross_value: String(unexplained !== 0 ? unexplained : tx.amount),
    },
  });

  return { ok: true, explanation: data.bank_transaction_explanation, replaced };
}

async function handleExplainTransaction(body, res) {
  const { transactionId, nominalCode, category, description } = body;
  if (!transactionId) return res.status(400).json({ error: 'Missing transactionId' });

  // Accept either nominalCode directly or category name for backwards compat
  let nominal = nominalCode;
  if (!nominal && category) {
    // Legacy path: look up from categoriseTransaction or hardcoded mapping
    const cat = categoriseTransaction({ description: category, amount: -1 });
    nominal = cat.freeagentNominal;
  }
  if (!nominal) return res.status(400).json({ error: 'Missing nominalCode or category' });

  try {
    const result = await explainSingleTransaction(transactionId, nominal, description);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: `Failed to explain transaction: ${err.message}` });
  }
}

async function handleExplainBulk(body, res) {
  const { transactions } = body;
  if (!transactions?.length) return res.status(400).json({ error: 'No transactions provided' });

  const results = [];
  for (const tx of transactions) {
    try {
      const r = await explainSingleTransaction(tx.transactionId, tx.nominalCode, tx.description);
      results.push({ transactionId: tx.transactionId, ok: true, replaced: r.replaced });
    } catch (err) {
      results.push({ transactionId: tx.transactionId, ok: false, error: err.message });
    }
  }

  const succeeded = results.filter(r => r.ok).length;
  return res.status(200).json({ ok: true, total: results.length, succeeded, failed: results.length - succeeded, results });
}

// ── AI Categorisation ────────────────────────────────

async function handleAICategorise(body, res) {
  const { transactions } = body;
  if (!transactions?.length) return res.status(400).json({ error: 'No transactions provided' });

  const proxyUrl = 'https://dsl-proxy.vercel.app/api/proxy';
  const categories = REPORTING_CATEGORIES.join(', ');

  const prompt = `You are an expert UK property accountant. Categorise each of these bank transactions for a residential property letting company called "Double Six Lets Ltd".

For each transaction return the most accurate category from this list: ${categories}

Also determine:
- excludeFromPnL: true if this should NOT count toward trading profit (intercompany transfers, owner drawings, dividends, director loans, acquisition costs)
- confidence: "high", "medium", or "low"
- reason: brief explanation of why you chose this category

IMPORTANT CONTEXT:
- "Double Six Holdings Limited" is the parent holding company — transfers to/from it are intercompany, NOT trading income
- "Jordan Walker" and "Keisha Walker" are directors — transfers involving them are director loans, NOT trading income
- "Onesavings Bank" and "TMW" / "The Mortgage Works" are mortgage lenders
- "Your Virtual Finance Director" is the company's accountant
- Properties: 39 Esher Road, 49 Greene Way, 105 Ladywell
- Known tenant: Ilyas (49 Greene Way)

Return ONLY valid JSON: { "results": [ { "transactionId": "...", "category": "...", "excludeFromPnL": bool, "confidence": "...", "reason": "..." } ] }`;

  const txList = transactions.map(t => `ID: ${t.id}\nDesc: ${t.description}\nAmount: £${t.amount}\nDate: ${t.date}`).join('\n---\n');

  try {
    const aiRes = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 2000,
        messages: [{ role: 'user', content: `${prompt}\n\nTransactions:\n${txList}` }],
      }),
    });
    const data = await aiRes.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in AI response');
    const parsed = JSON.parse(match[0]);
    return res.status(200).json({ ok: true, ...parsed });
  } catch (err) {
    return res.status(500).json({ error: `AI categorisation failed: ${err.message}` });
  }
}

// ── Transaction data (with smart categorisation) ─────

function cleanDescription(fullDesc, shortDesc) {
  // Prefer full_description, fall back to short description
  let d = (fullDesc || shortDesc || '').replace(/\s+/g, ' ').trim();
  // If description is just slashes, amounts, or junk, try the other field
  const junkPattern = /^[\/\s£\d.,]+$/;
  if (junkPattern.test(d) && fullDesc && shortDesc) {
    d = (shortDesc || '').replace(/\s+/g, ' ').trim();
  }
  // If still junk, combine both
  if (junkPattern.test(d)) {
    d = `${shortDesc || ''} ${fullDesc || ''}`.replace(/\s+/g, ' ').trim();
  }
  return d || 'Unknown transaction';
}

function enrichTransaction(raw) {
  const amt = parseFloat(raw.amount || 0);
  const desc = `${raw.description || ''} ${raw.full_description || ''}`;
  const unexplained = parseFloat(raw.unexplained_amount || raw.amount);
  const cat = categoriseTransaction({ description: desc, amount: amt });

  return {
    id: raw.url, date: raw.dated_on, amount: amt,
    description: cleanDescription(raw.full_description, raw.description),
    category: raw.category || '', bankAccount: raw.bank_account || '',
    explained: Math.abs(unexplained) < 0.01,
    property: cat.propertyHint || 'Unassigned',
    // Smart categorisation fields
    reportingCategory: cat.reportingCategory,
    freeagentNominal: cat.freeagentNominal,
    incomeType: cat.incomeType,
    expenseType: cat.expenseType,
    excludeFromPnL: cat.excludeFromPnL,
    confidence: cat.confidence,
    requiresReview: cat.requiresReview,
    taxFlags: cat.taxFlags,
  };
}

async function fetchAllBankTransactions(from, to, maxPages = 5) {
  let accounts = [];
  try {
    const accData = await freeAgentApi('/v2/bank_accounts');
    accounts = (accData.bank_accounts || []).map(a => a.url);
  } catch (e) { accounts = []; }

  let allTx = [];
  for (const acct of accounts) {
    let page = 1;
    while (page <= maxPages) {
      try {
        const data = await freeAgentApi(`/v2/bank_transactions?bank_account=${encodeURIComponent(acct)}&from_date=${from}&to_date=${to}&per_page=100&page=${page}`);
        const txs = data.bank_transactions || [];
        allTx = allTx.concat(txs);
        if (txs.length < 100) break;
        page++;
      } catch (e) { break; }
    }
  }
  return allTx;
}

async function handleTransactions(req, res) {
  const from = req.query.from || taxYearStart();
  const to = req.query.to || today();
  const raw = await fetchAllBankTransactions(from, to);
  const transactions = raw.map(enrichTransaction);
  return res.status(200).json({ transactions });
}

// ── Invoices & Bills ─────────────────────────────────

async function handleInvoices(res) {
  let all = [], page = 1;
  while (page <= 5) {
    const data = await freeAgentApi(`/v2/invoices?per_page=100&page=${page}`);
    const items = data.invoices || [];
    all = all.concat(items);
    if (items.length < 100) break;
    page++;
  }
  const invoices = all.map(i => ({
    id: i.url, contact: i.contact, contactName: i.contact_name || '',
    amount: parseFloat(i.total_value || i.net_value || 0),
    status: i.status || 'Draft', datedOn: i.dated_on, dueOn: i.due_on,
    reference: i.reference || '',
    property: matchProperty(`${i.reference || ''} ${i.contact_name || ''} ${(i.invoice_items || []).map(x => x.description || '').join(' ')}`) || 'Unassigned',
  }));
  return res.status(200).json({ invoices });
}

async function handleBills(res) {
  let all = [], page = 1;
  while (page <= 5) {
    const data = await freeAgentApi(`/v2/bills?per_page=100&page=${page}`);
    const items = data.bills || [];
    all = all.concat(items);
    if (items.length < 100) break;
    page++;
  }
  const result = all.map(b => ({
    id: b.url, contact: b.contact, contactName: b.contact_name || '',
    totalValue: parseFloat(b.total_value || 0), status: b.status || 'Open',
    datedOn: b.dated_on, dueOn: b.due_on, category: b.category || '',
    reference: b.reference || '',
    property: matchProperty(`${b.reference || ''} ${b.contact_name || ''} ${(b.bill_items || []).map(x => x.description || '').join(' ')}`) || 'Unassigned',
  }));
  return res.status(200).json({ bills: result });
}

// ── Financial Summary (accountant-accurate) ──────────

async function handleSummary(req, res) {
  const from = req.query.from || taxYearStart();
  const to = req.query.to || today();

  const [rawTx, invRes, billRes] = await Promise.all([
    fetchAllBankTransactions(from, to, 3).catch(() => []),
    fetchInvoicesRaw().catch(() => []),
    fetchBillsRaw().catch(() => []),
  ]);

  const txRes = rawTx.map(enrichTransaction);

  // Separate trading vs excluded transactions
  const tradingTx = txRes.filter(t => !t.excludeFromPnL);
  const excludedTx = txRes.filter(t => t.excludeFromPnL);

  // Property breakdown — only from trading transactions
  const propNames = ['39 Esher Road', '49 Greene Way', '105 Ladywell', 'Unassigned'];
  const byProperty = {};
  propNames.forEach(p => { byProperty[p] = { income: 0, expenses: 0, profit: 0, transactions: [] }; });

  // Add Intercompany as a virtual "property" tab
  byProperty['Intercompany'] = { income: 0, expenses: 0, profit: 0, transactions: [] };

  let rentalIncome = 0, otherIncome = 0, intercompanyIn = 0, intercompanyOut = 0;
  let totalAllowableExpenses = 0;

  txRes.forEach(t => {
    const prop = t.excludeFromPnL ? 'Intercompany' : (t.property || 'Unassigned');
    if (!byProperty[prop]) byProperty[prop] = { income: 0, expenses: 0, profit: 0, transactions: [] };
    byProperty[prop].transactions.push(t);

    if (t.excludeFromPnL) {
      if (t.amount > 0) intercompanyIn += t.amount;
      else intercompanyOut += Math.abs(t.amount);
    } else {
      if (t.amount > 0) {
        if (t.incomeType === 'rental_income') rentalIncome += t.amount;
        else otherIncome += t.amount;
        byProperty[prop].income += t.amount;
      } else {
        totalAllowableExpenses += Math.abs(t.amount);
        byProperty[prop].expenses += Math.abs(t.amount);
      }
    }
  });

  // Calculate profit per property
  [...propNames, 'Intercompany'].forEach(p => {
    if (byProperty[p]) byProperty[p].profit = byProperty[p].income - byProperty[p].expenses;
  });

  // Monthly totals (trading only)
  const monthMap = {};
  tradingTx.forEach(t => {
    const m = (t.date || '').substring(0, 7);
    if (!m) return;
    if (!monthMap[m]) monthMap[m] = { month: m, income: 0, expenses: 0, profit: 0 };
    if (t.amount > 0) monthMap[m].income += t.amount;
    else monthMap[m].expenses += Math.abs(t.amount);
  });
  const monthlyTotals = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
  monthlyTotals.forEach(m => { m.profit = m.income - m.expenses; });

  // Expense breakdown by reporting category (trading only)
  const catMap = {};
  tradingTx.filter(t => t.amount < 0).forEach(t => {
    const cat = t.reportingCategory || 'General / Other';
    catMap[cat] = (catMap[cat] || 0) + Math.abs(t.amount);
  });
  const expenseBreakdown = Object.entries(catMap).map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  // Tax flags summary
  const taxFlags = [];
  txRes.forEach(t => {
    if (t.taxFlags?.length) {
      t.taxFlags.forEach(f => taxFlags.push({ ...f, transactionId: t.id, description: t.description, amount: t.amount, date: t.date }));
    }
  });

  // Review count
  const requiresReviewCount = txRes.filter(t => t.requiresReview).length;

  // Invoices
  const unpaidInvoices = invRes.filter(i => ['Draft', 'Sent', 'Viewed', 'Reminded'].includes(i.status));
  const overdueInvoices = unpaidInvoices.filter(i => i.dueOn && new Date(i.dueOn) < new Date());
  const upcomingBills = billRes.filter(b => ['Open', 'Overdue'].includes(b.status));

  const totalTradingIncome = rentalIncome + otherIncome;
  const netProfit = totalTradingIncome - totalAllowableExpenses;

  return res.status(200).json({
    // Accountant-accurate headline numbers
    rentalIncome,
    otherIncome,
    totalTradingIncome,
    totalAllowableExpenses,
    netProfit,
    // Intercompany (excluded from P&L)
    intercompanyIn,
    intercompanyOut,
    intercompanyNet: intercompanyIn - intercompanyOut,
    // Legacy compat
    totalIncome: totalTradingIncome,
    totalExpenses: totalAllowableExpenses,
    // Breakdowns
    byProperty, monthlyTotals, expenseBreakdown,
    // Tax & review
    taxFlags, requiresReviewCount,
    // Invoices / bills
    unpaidInvoices, overdueInvoices, upcomingBills,
    invoiceCount: invRes.length, billCount: billRes.length,
    // Categories for frontend
    reportingCategories: REPORTING_CATEGORIES,
  });
}

// ── Raw data helpers ─────────────────────────────────

async function fetchInvoicesRaw() {
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
    property: matchProperty(`${i.reference || ''} ${i.contact_name || ''}`) || 'Unassigned',
  }));
}

async function fetchBillsRaw() {
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
    property: matchProperty(`${b.reference || ''} ${b.contact_name || ''}`) || 'Unassigned',
  }));
}

function taxYearStart() {
  const now = new Date();
  const month = now.getMonth();
  const year = month >= 10 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-11-01`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}
