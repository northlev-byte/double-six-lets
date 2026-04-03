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
