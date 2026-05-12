/* ============================================================
   Onix Finance — Supabase Client
   Drop this file in the same folder as all your HTML files.
   Every page imports this to talk to the database.
   ============================================================ */

const SUPABASE_URL = 'https://ckayfqplkpplgojdhjlu.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrYXlmcXBsa3BwbGdvamRoamx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwOTUzNDUsImV4cCI6MjA5MzY3MTM0NX0.E5lmNud0ERUqaxy829d1dB3AqGw9EEFjHFSB7zDJdFE'

/* Load Supabase from CDN — no npm or build tools needed */
const { createClient } = window.supabase
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/* ── Auth helpers ─────────────────────────────────────────── */

async function getSession() {
  const { data: { session } } = await _supabase.auth.getSession()
  return session
}

async function getProfile(userId) {
  const { data, error } = await _supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) console.error('Profile fetch error:', error)
  return data
}

async function signOut() {
  localStorage.removeItem('onix-user')
  await _supabase.auth.signOut()
  window.location.href = 'login.html'
}

/* ── Auth gate helpers ────────────────────────────────────── */

/* Call this at the top of client-portal.html */
async function requireClient() {
  const session = await getSession()
  if (!session) { window.location.replace('login.html'); return null }
  const profile = await getProfile(session.user.id)
  if (!profile || profile.role !== 'client' || profile.status !== 'active') {
    localStorage.removeItem('onix-user')
    await _supabase.auth.signOut()
    window.location.replace('login.html')
    return null
  }
  return { session, profile }
}

/* Call this at the top of admin-portal.html */
async function requireAdmin() {
  const session = await getSession()
  if (!session) { window.location.replace('login.html'); return null }
  const profile = await getProfile(session.user.id)
  if (!profile || profile.role !== 'admin') {
    localStorage.removeItem('onix-user')
    await _supabase.auth.signOut()
    window.location.replace('login.html')
    return null
  }
  return { session, profile }
}

/* ── Data fetching — Client ───────────────────────────────── */

async function getMyLoan(userId) {
  // A user can technically have more than one loan in the DB. Pick the most
  // recently created ACTIVE one for the dashboard summary. Falls back to the
  // most recent of any status if none are active.
  const { data, error } = await _supabase
    .from('loans')
    .select('*, loan_documents(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) { console.error('Loan fetch error:', error); return null }
  if (!data || !data.length) return null
  return data.find(l => l.status === 'active') || data[0]
}

async function getMyLoans(userId) {
  const { data, error } = await _supabase
    .from('loans')
    .select('*, loan_documents(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) { console.error('Loans fetch error:', error); return [] }
  return data || []
}

async function getMyInvestments(userId) {
  const { data, error } = await _supabase
    .from('investments')
    .select('*, investment_documents(*)')
    .eq('user_id', userId)
  if (error) console.error('Investments fetch error:', error)
  return data || []
}

async function getOpenRaises() {
  const { data, error } = await _supabase
    .from('raises')
    .select('*, raise_documents(*)')
    .eq('status', 'open')
  if (error) console.error('Raises fetch error:', error)
  return data || []
}

async function submitLoanApplication(userId, formData) {
  const { data, error } = await _supabase
    .from('loan_applications')
    .insert([{ user_id: userId, ...formData }])
  if (error) { console.error('Application submit error:', error); return false }
  return true
}

async function submitRaiseInterest(userId, raiseId) {
  const { data, error } = await _supabase
    .from('raise_interests')
    .insert([{ user_id: userId, raise_id: raiseId }])
  if (error) { console.error('Interest submit error:', error); return false }
  return true
}

/* ── Data fetching — Admin ────────────────────────────────── */

async function getAllClients() {
  const { data, error } = await _supabase
    .from('profiles')
    .select('*')
    .eq('role', 'client')
    .order('created_at', { ascending: false })
  if (error) console.error('Clients fetch error:', error)
  return data || []
}

async function getPendingClients() {
  const { data, error } = await _supabase
    .from('profiles')
    .select('*')
    .eq('role', 'client')
    .eq('status', 'pending')
  if (error) console.error('Pending clients error:', error)
  return data || []
}

async function approveClient(userId) {
  const { error } = await _supabase
    .from('profiles')
    .update({ status: 'active' })
    .eq('id', userId)
  return !error
}

async function rejectClient(userId) {
  const { error } = await _supabase
    .from('profiles')
    .update({ status: 'rejected' })
    .eq('id', userId)
  return !error
}

async function getAllLoans() {
  const { data, error } = await _supabase
    .from('loans')
    .select('*, profiles(full_name, email), loan_documents(*)')
    .order('created_at', { ascending: false })
  if (error) console.error('All loans error:', error)
  return data || []
}

async function getAllInvestments() {
  const { data, error } = await _supabase
    .from('investments')
    .select('*, profiles(full_name, email), investment_documents(*)')
    .order('created_at', { ascending: false })
  if (error) console.error('All investments error:', error)
  return data || []
}

async function getAllApplications() {
  const { data, error } = await _supabase
    .from('loan_applications')
    .select('*, profiles(full_name, email)')
    .order('submitted_at', { ascending: false })
  if (error) console.error('Applications error:', error)
  return data || []
}

async function getAllRaises() {
  const { data, error } = await _supabase
    .from('raises')
    .select('*, raise_documents(*)')
    .order('created_at', { ascending: false })
  if (error) console.error('Raises error:', error)
  return data || []
}

/* ── Expose everything globally ───────────────────────────── */
window.OnixDB = {
  client: _supabase,
  getSession,
  getProfile,
  signOut,
  requireClient,
  requireAdmin,
  getMyLoan,
  getMyLoans,
  getMyInvestments,
  getOpenRaises,
  submitLoanApplication,
  submitRaiseInterest,
  getAllClients,
  getPendingClients,
  approveClient,
  rejectClient,
  getAllLoans,
  getAllInvestments,
  getAllApplications,
  getAllRaises,
}
