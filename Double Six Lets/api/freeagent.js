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

function matchProperty(text) {
  const lower = (text || '').toLowerCase();
  for (const p of PROPERTIES) {
    if (p.keywords.some(k => lower.includes(k))) return p.name;
  }
  return 'Unassigned';
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

  const transactions = allTx.map(t => ({
    id: t.url, date: t.dated_on, amount: parseFloat(t.amount || 0),
    description: t.description || '', category: t.category || '',
    bankAccount: t.bank_account || '', explained: !!t.category,
    property: matchProperty(`${t.description} ${t.full_description || ''}`),
  }));
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
  return allTx.map(t => ({
    id: t.url, date: t.dated_on, amount: parseFloat(t.amount || 0),
    description: t.description || '', category: t.category || '',
    property: matchProperty(`${t.description} ${t.full_description || ''}`),
  }));
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
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-06`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}
