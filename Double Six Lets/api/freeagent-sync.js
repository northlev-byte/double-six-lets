import { freeAgentApi } from './_lib/freeagent-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.FREEAGENT_REFRESH_TOKEN) {
    return res.status(200).json({ configured: false });
  }

  try {
    // Fetch key data in parallel for dashboard
    const [companyRes, expensesRes, billsRes, contactsRes] = await Promise.all([
      freeAgentApi('/v2/company').catch(() => null),
      freeAgentApi('/v2/expenses?from_date=' + thirtyDaysAgo() + '&per_page=10').catch(() => null),
      freeAgentApi('/v2/bills?view=open&per_page=10').catch(() => null),
      freeAgentApi('/v2/contacts?view=active&per_page=100').catch(() => null),
    ]);

    const expenses = (expensesRes?.expenses || []).map(e => ({
      description: e.description,
      amount: e.gross_value,
      date: e.dated_on,
      category: e.category,
    }));

    const bills = (billsRes?.bills || []).map(b => ({
      reference: b.reference,
      amount: b.total_value,
      date: b.dated_on,
      dueDate: b.due_on,
      contact: b.contact,
      status: b.status,
    }));

    const contacts = (contactsRes?.contacts || []).map(c => ({
      url: c.url,
      name: c.organisation_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
      email: c.email,
    }));

    const totalExpenses30d = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const openBillsCount = bills.length;
    const openBillsTotal = bills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);

    return res.status(200).json({
      configured: true,
      connected: true,
      company: companyRes?.company?.name || 'FreeAgent',
      stats: {
        expenses30d: expenses.length,
        expenses30dTotal: totalExpenses30d,
        openBills: openBillsCount,
        openBillsTotal,
        contactCount: contacts.length,
      },
      recentExpenses: expenses.slice(0, 5),
      openBills: bills.slice(0, 5),
      contacts,
    });
  } catch (err) {
    console.error('FreeAgent sync error:', err);
    return res.status(200).json({ configured: true, connected: false, error: err.message });
  }
}

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}
