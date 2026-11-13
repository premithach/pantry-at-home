import { useEffect, useState } from 'react'
import axios from 'axios'
import { ArrowDownUp, Bell, Carrot, Check, ChevronDown, CircleHelp, Clock3, CookingPot, ImagePlus, Leaf, LayoutDashboard, LoaderCircle, MoreHorizontal, Plus, Search, Settings2, ShoppingBasket, Sparkles, Trash2, X } from 'lucide-react'
import './App.css'
import './Interactions.css'

axios.defaults.baseURL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const savedAccessToken = localStorage.getItem('pantry-access-token')
if (savedAccessToken) axios.defaults.headers.common.Authorization = `Bearer ${savedAccessToken}`
axios.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401 && !error.config?.url?.includes('/api/auth/login')) {
    localStorage.removeItem('pantry-access-token')
    delete axios.defaults.headers.common.Authorization
    window.dispatchEvent(new Event('pantry-auth-expired'))
  }
  return Promise.reject(error)
})

const categories = ['All items', 'Veggies', 'Fruits', 'Dairy', 'Meat & fish', 'Bakery', 'Cupboard', 'Other']
const legacyCategoryLabels = { Produce: 'Veggies', Pantry: 'Cupboard', Protein: 'Meat & fish' }
const displayCategory = (category) => legacyCategoryLabels[category] || category || 'Other'
const storageKeys = ['recipes', 'photos', 'shopping-list', 'expiry-days', 'diet', 'name', 'last-unit', 'user-id']
storageKeys.forEach((key) => {
  const currentKey = `pantry-${key}`
  const legacyKey = `pantrypal-${key}`
  if (localStorage.getItem(currentKey) === null && localStorage.getItem(legacyKey) !== null) localStorage.setItem(currentKey, localStorage.getItem(legacyKey))
})
const accountStorageKey = (userId, key) => `pantry-${userId}-${key}`
;['recipes', 'photos', 'shopping-list', 'expiry-days', 'diet', 'name', 'last-unit'].forEach((key) => {
  const oldKey = `pantry-${key}`
  const accountKey = accountStorageKey(1, key)
  if (localStorage.getItem(accountKey) === null && localStorage.getItem(oldKey) !== null) localStorage.setItem(accountKey, localStorage.getItem(oldKey))
})
const foodImageFor = (name = '', category = '') => {
  const normalized = name.toLowerCase()
  const images = [[/chill?ies?|chill?i|jalape[nñ]o|hot pepper|chili pepper/, '🌶️'], [/egg/, '🥚'], [/milk/, '🥛'], [/spinach|kale|lettuce|greens/, '🥬'], [/tomato/, '🍅'], [/pasta|penne|spaghetti|noodle/, '🍝'], [/parmesan|cheese|mozzarella|feta/, '🧀'], [/avocado/, '🥑'], [/olive oil|oil/, '🫒'], [/bread|toast/, '🍞'], [/apple/, '🍎'], [/banana/, '🍌'], [/carrot/, '🥕'], [/onion/, '🧅'], [/garlic/, '🧄'], [/rice/, '🍚'], [/chicken/, '🍗'], [/fish|salmon/, '🐟'], [/yogurt/, '🥣'], [/butter/, '🧈'], [/potato/, '🥔'], [/mushroom/, '🍄'], [/lemon/, '🍋']]
  const byCategory = { Veggies: '🥦', Fruits: '🍎', Dairy: '🧈', 'Meat & fish': '🍗', Bakery: '🥖', Cupboard: '🥫', Other: '🧺', Produce: '🥦', Pantry: '🥫', Protein: '🍗' }
  return images.find(([pattern]) => pattern.test(normalized))?.[1] || byCategory[category] || '🧺'
}
const readSavedRecipeData = (userId = 1) => {
  try {
    const saved = JSON.parse(localStorage.getItem(accountStorageKey(userId, 'recipes')) || 'null')
    return Array.isArray(saved?.recipes) ? saved : null
  } catch { return null }
}
const prettyDate = (date) => date ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(date)) : '—'
const todayShort = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()
const todayLong = `${todayShort}, ${new Date().getFullYear()}`
const expiryState = (date) => {
  if (!date) return { label: 'No date', kind: 'date-normal' }
  const days = Math.ceil((new Date(`${date.slice(0, 10)}T23:59:59`) - new Date()) / 86400000)
  if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, kind: 'date-expired' }
  if (days === 0) return { label: 'Expires today', kind: 'date-soon' }
  if (days <= 3) return { label: `In ${days} day${days === 1 ? '' : 's'}`, kind: 'date-soon' }
  return { label: prettyDate(date), kind: 'date-normal' }
}
const pantryLoadError = (error) => error.response?.status === 403
  ? 'The local API port is returning a forbidden response. Check the backend port and proxy settings.'
  : 'Could not reach the pantry server. Check that the backend is running on port 5050.'

function App() {
  const [items, setItems] = useState([])
  const [authReady, setAuthReady] = useState(() => !localStorage.getItem('pantry-access-token'))
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginName, setLoginName] = useState('')
  const [loginMode, setLoginMode] = useState('login')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [summary, setSummary] = useState(null)
  const [categoryCounts, setCategoryCounts] = useState({})
  const [activeCategory, setActiveCategory] = useState('All items')
  const [sortMode, setSortMode] = useState('recent')
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState(false)
  const [savingItem, setSavingItem] = useState(false)
  const [editing, setEditing] = useState(null)
  const [notice, setNotice] = useState('')
  const [noticeKind, setNoticeKind] = useState('error')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [photoDraft, setPhotoDraft] = useState('')
  const [photos, setPhotos] = useState(() => { try { return JSON.parse(localStorage.getItem(accountStorageKey(1, 'photos')) || '{}') } catch { return {} } })
  const [shoppingList, setShoppingList] = useState(() => { try { return JSON.parse(localStorage.getItem(accountStorageKey(1, 'shopping-list')) || '[]') } catch { return [] } })
  const [shoppingDraft, setShoppingDraft] = useState('')
  const [shoppingOpen, setShoppingOpen] = useState(false)
  const [shoppingMessage, setShoppingMessage] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savedRecipes] = useState(readSavedRecipeData)
  const [recipes, setRecipes] = useState(savedRecipes?.recipes || null)
  const [recipeNotice, setRecipeNotice] = useState(savedRecipes?.notice || '')
  const [recipesLoading, setRecipesLoading] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [expiryAlertDays, setExpiryAlertDays] = useState(() => Number(localStorage.getItem(accountStorageKey(1, 'expiry-days')) || 4))
  const [expiryDraft, setExpiryDraft] = useState(() => localStorage.getItem(accountStorageKey(1, 'expiry-days')) || '4')
  const [dietDraft, setDietDraft] = useState(() => localStorage.getItem(accountStorageKey(1, 'diet')) || 'No preference')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [pantryName, setPantryName] = useState(() => localStorage.getItem(accountStorageKey(1, 'name')) || 'My kitchen')
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState(() => localStorage.getItem(accountStorageKey(1, 'name')) || 'My kitchen')
  const [form, setForm] = useState({ name: '', quantity: '1', unit: 'pcs', category: 'Veggies', expiryDate: '' })
  const [lastUnit, setLastUnit] = useState(() => localStorage.getItem(accountStorageKey(1, 'last-unit')) || 'pcs')
  const [userId, setUserId] = useState(() => Number(localStorage.getItem('pantry-user-id') || 1))

  useEffect(() => {
    if (!notice || noticeKind !== 'success') return undefined
    const timer = setTimeout(() => setNotice(''), 4500)
    return () => clearTimeout(timer)
  }, [notice, noticeKind])

  useEffect(() => {
    const expired = () => { setIsSignedIn(false); setLoginError('Your sign-in expired. Enter your pantry password again.') }
    window.addEventListener('pantry-auth-expired', expired)
    const token = localStorage.getItem('pantry-access-token')
    if (!token) return () => window.removeEventListener('pantry-auth-expired', expired)
    axios.get('/api/auth/session').then(({ data }) => { setUserId(data.id); localStorage.setItem('pantry-user-id', String(data.id)); setIsSignedIn(true) }).catch(() => localStorage.removeItem('pantry-access-token')).finally(() => setAuthReady(true))
    return () => window.removeEventListener('pantry-auth-expired', expired)
  }, [])

  useEffect(() => {
    if (!isSignedIn) return
    const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(accountStorageKey(userId, key)) || JSON.stringify(fallback)) } catch { return fallback } }
    const saved = readSavedRecipeData(userId)
    const name = localStorage.getItem(accountStorageKey(userId, 'name')) || 'My kitchen'
    queueMicrotask(() => {
      setPhotos(readJson('photos', {}))
      setShoppingList(readJson('shopping-list', []))
      setRecipes(saved?.recipes || null); setRecipeNotice(saved?.notice || '')
      setExpiryAlertDays(Number(localStorage.getItem(accountStorageKey(userId, 'expiry-days')) || 4))
      setExpiryDraft(localStorage.getItem(accountStorageKey(userId, 'expiry-days')) || '4')
      setDietDraft(localStorage.getItem(accountStorageKey(userId, 'diet')) || 'No preference')
      setPantryName(name); setRenameDraft(name)
      setLastUnit(localStorage.getItem(accountStorageKey(userId, 'last-unit')) || 'pcs')
    })
  }, [isSignedIn, userId])

  const loadItems = async ({ category = activeCategory, search = query, sort = sortMode } = {}) => {
    try {
      const { data } = await axios.get('/api/ingredients', { params: { userId, category, q: search || undefined, sortBy: sort === 'urgent' ? 'expiryDate' : sort === 'name' ? 'name' : 'createdAt', sortOrder: sort === 'recent' ? 'desc' : 'asc' } })
      setItems(data)
      setNotice('')
    } catch (error) {
      setNotice(pantryLoadError(error))
    } finally { setLoading(false) }
  }
  const loadDashboard = async () => {
    try {
      const [summaryResponse, categoriesResponse] = await Promise.all([
        axios.get('/api/ingredients/summary', { params: { userId, days: expiryAlertDays } }),
        axios.get('/api/ingredients/categories', { params: { userId } }),
      ])
      setSummary(summaryResponse.data)
      setCategoryCounts(Object.fromEntries(categoriesResponse.data.categories.map(({ name, count }) => [name, count])))
    } catch (error) { setNotice(pantryLoadError(error)) }
  }
  useEffect(() => {
    if (!isSignedIn) return undefined
    let cancelled = false
    const timeout = setTimeout(() => axios.get('/api/ingredients', { params: { userId, category: activeCategory, q: query || undefined, sortBy: sortMode === 'urgent' ? 'expiryDate' : sortMode === 'name' ? 'name' : 'createdAt', sortOrder: sortMode === 'recent' ? 'desc' : 'asc' } }).then(({ data }) => {
      if (!cancelled) { setItems(data); setNotice('') }
    }).catch((error) => {
      if (!cancelled) setNotice(pantryLoadError(error))
    }).finally(() => { if (!cancelled) setLoading(false) })
    , query ? 250 : 0)
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [activeCategory, sortMode, query, userId, isSignedIn])
  useEffect(() => {
    if (!isSignedIn) return undefined
    let cancelled = false
    Promise.all([
      axios.get('/api/ingredients/summary', { params: { userId, days: expiryAlertDays } }),
      axios.get('/api/ingredients/categories', { params: { userId } }),
    ]).then(([summaryResponse, categoriesResponse]) => {
      if (cancelled) return
      setSummary(summaryResponse.data)
      setCategoryCounts(Object.fromEntries(categoriesResponse.data.categories.map(({ name, count }) => [name, count])))
    }).catch((error) => { if (!cancelled) setNotice(pantryLoadError(error)) })
    return () => { cancelled = true }
  }, [userId, expiryAlertDays, isSignedIn])

  const filtered = sortMode === 'urgent'
    ? [...items].sort((a, b) => (a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity) - (b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity))
    : items
  const soon = summary?.expiringItems || []
  const total = summary?.total ?? items.length
  const expiringCount = summary?.expiringSoon ?? 0
  const expiredCount = summary?.expired ?? 0
  const freshnessPercent = summary?.freshnessPercent ?? 100
  const fresh = Math.round(total * freshnessPercent / 100)
  const recipeLines = recipes || [
    { title: 'A little green pasta', text: items.filter((i) => ['Veggies', 'Produce', 'Dairy', 'Cupboard', 'Pantry'].includes(i.category)).slice(0, 4).map((i) => i.name).join(', ') || 'Spinach, lemon & parmesan', time: '20 min', minutes: 20, icon: '🍝', ingredients: items.filter((i) => ['Veggies', 'Produce', 'Dairy', 'Cupboard', 'Pantry'].includes(i.category)).slice(0, 4).map((i) => i.name), steps: ['Boil pasta in salted water until just tender.', 'Warm a little oil in a pan and soften the greens or vegetables.', 'Toss everything together with a splash of pasta water and finish with cheese.'] },
    { title: 'The no-fuss fridge frittata', text: items.filter((i) => ['Meat & fish', 'Protein', 'Veggies', 'Produce'].includes(i.category)).slice(0, 4).map((i) => i.name).join(', ') || 'Eggs, herbs & whatever’s left', time: '15 min', minutes: 15, icon: '🍳', ingredients: items.filter((i) => ['Meat & fish', 'Protein', 'Veggies', 'Produce'].includes(i.category)).slice(0, 4).map((i) => i.name), steps: ['Whisk eggs with salt and pepper.', 'Cook chopped vegetables in an oven-safe pan until tender.', 'Pour in the eggs, cook gently until set, and finish with cheese or herbs.'] },
  ]

  const openNew = () => { setEditing(null); setPhotoDraft(''); setForm({ name: '', quantity: '1', unit: lastUnit, category: 'Veggies', expiryDate: '' }); setDialog(true) }
  const openEdit = async (item) => {
    try {
      const { data } = await axios.get(`/api/ingredients/${item.id}`)
      setEditing(data); setPhotoDraft(photos[data.id] || ''); setForm({ name: data.name, quantity: String(data.quantity), unit: data.unit, category: displayCategory(data.category), expiryDate: data.expiryDate ? data.expiryDate.slice(0, 10) : '' }); setDialog(true)
    } catch (error) { setNoticeKind('error'); setNotice(error.response?.data?.error || 'Could not load this pantry item.') }
  }
  const saveItem = async (event) => {
    event.preventDefault()
    if (savingItem) return
    setSavingItem(true)
    const payload = { ...form, quantity: Number(form.quantity), expiryDate: form.expiryDate || null, ...(editing ? {} : { userId }) }
    try {
      const wasEditing = Boolean(editing)
      const savedName = form.name.trim()
      const { data: savedItem } = editing ? await axios.put(`/api/ingredients/${editing.id}`, payload) : await axios.post('/api/ingredients', payload)
      let photoWasSaved = true
      try {
        const nextPhotos = { ...photos }
        if (photoDraft) nextPhotos[savedItem.id] = photoDraft
        else delete nextPhotos[savedItem.id]
        localStorage.setItem(accountStorageKey(userId, 'photos'), JSON.stringify(nextPhotos)); setPhotos(nextPhotos)
      } catch { photoWasSaved = false }
      try { localStorage.setItem(accountStorageKey(userId, 'last-unit'), form.unit.trim()) } catch { /* The pantry record is already saved. */ }
      setLastUnit(form.unit.trim())
      if (!wasEditing) { setActiveCategory('All items'); setQuery('') }
      setDialog(false); await Promise.all([loadItems(wasEditing ? undefined : { category: 'All items', search: '' }), loadDashboard()])
      setNoticeKind('success'); setNotice(`${wasEditing ? `${savedName} updated` : `${savedName} added to your pantry`}.${photoWasSaved ? '' : ' The item photo could not be saved in this browser.'}`)
    } catch (error) { setNoticeKind('error'); setNotice(error.response?.data?.error || 'Could not save this item. Check the server and your pantry user ID.') }
    finally { setSavingItem(false) }
  }
  const removeItem = async (item) => {
    if (deletingId !== null) return
    setDeletingId(item.id)
    try {
      await axios.delete(`/api/ingredients/${item.id}`)
      const nextPhotos = { ...photos }; delete nextPhotos[item.id]; localStorage.setItem(accountStorageKey(userId, 'photos'), JSON.stringify(nextPhotos)); setPhotos(nextPhotos)
      setDeleteTarget(null)
      await Promise.all([loadItems(), loadDashboard()])
      setNoticeKind('success'); setNotice(`${item.name} deleted successfully.`)
    } catch { setNoticeKind('error'); setNotice('That item could not be removed. Please try again.') }
    finally { setDeletingId(null) }
  }
  const findRecipes = async () => {
    if (!items.length) { setRecipeNotice('Add a few pantry items first and we’ll find something lovely to make.'); return }
    setRecipesLoading(true)
    try {
      const expiringNames = soon.map((item) => item.name)
      const { data } = await axios.post('/api/recipes/suggestions', { ingredients: items.map((item) => item.name), dietaryPreference: localStorage.getItem(accountStorageKey(userId, 'diet')) || 'No preference', prioritize: expiringNames }, { timeout: 50000 })
      const saved = { recipes: data.recipes || [], notice: data.notice || '' }
      setRecipes(saved.recipes)
      setRecipeNotice(saved.notice)
      localStorage.setItem(accountStorageKey(userId, 'recipes'), JSON.stringify(saved))
      document.querySelector('.ideas-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch (error) {
      const saved = { recipes: recipes || [], notice: error.response?.data?.error || 'Recipe ideas are taking a moment. Please try again.' }
      setRecipeNotice(saved.notice)
      localStorage.setItem(accountStorageKey(userId, 'recipes'), JSON.stringify(saved))
    }
    finally { setRecipesLoading(false) }
  }
  const openPreferences = () => {
    setExpiryDraft(String(expiryAlertDays))
    setDietDraft(localStorage.getItem(accountStorageKey(userId, 'diet')) || 'No preference')
    setPreferencesOpen(true)
    setProfileMenuOpen(false)
  }
  const savePreferences = (event) => {
    event.preventDefault()
    const days = Number(expiryDraft)
    if (!Number.isInteger(days) || days < 1 || days > 60) return
    localStorage.setItem(accountStorageKey(userId, 'expiry-days'), String(days))
    localStorage.setItem(accountStorageKey(userId, 'diet'), dietDraft)
    setExpiryAlertDays(days)
    setPreferencesOpen(false)
    setNoticeKind('success'); setNotice('Preferences saved.')
  }
  const setShoppingItems = (next) => { setShoppingList(next); localStorage.setItem(accountStorageKey(userId, 'shopping-list'), JSON.stringify(next)) }
  const addRecipeMissingToShopping = (recipe) => {
    const owned = new Set(items.map((item) => item.name.toLowerCase()))
    const missing = (recipe.ingredients || []).filter((name) => !owned.has(name.toLowerCase()))
    const known = new Set(shoppingList.map((name) => name.toLowerCase()))
    const additions = missing.filter((name) => !known.has(name.toLowerCase()))
    setShoppingItems([...shoppingList, ...additions])
    setShoppingMessage(missing.length === 0 ? 'You already have everything for this recipe.' : additions.length ? `Added ${additions.length} missing ${additions.length === 1 ? 'ingredient' : 'ingredients'} to your list.` : 'Those ingredients are already on your shopping list.')
    setSelectedRecipe(null); setShoppingOpen(true)
  }
  const showExpiringItems = () => {
    setActiveCategory('All items'); setQuery(''); setSortMode('urgent')
    requestAnimationFrame(() => document.querySelector('.inventory')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const savePantryName = (event) => {
    event.preventDefault()
    const name = renameDraft.trim()
    if (!name) return
    localStorage.setItem(accountStorageKey(userId, 'name'), name)
    setPantryName(name)
    setRenameOpen(false)
    setNoticeKind('success'); setNotice('Pantry name updated.')
  }
  const refreshPantry = async () => {
    setProfileMenuOpen(false)
    await Promise.all([loadItems(), loadDashboard()])
  }
  const signIn = async (event) => {
    event.preventDefault()
    setLoginLoading(true); setLoginError('')
    try {
      const endpoint = loginMode === 'signup' ? '/api/auth/signup' : '/api/auth/login'
      const payload = loginMode === 'signup' ? { name: loginName, email: loginEmail, password: loginPassword } : { email: loginEmail, password: loginPassword }
      const { data } = await axios.post(endpoint, payload)
      localStorage.setItem('pantry-access-token', data.token)
      localStorage.setItem('pantry-user-id', String(data.id))
      axios.defaults.headers.common.Authorization = `Bearer ${data.token}`
      setUserId(data.id); setLoginPassword(''); setLoading(true); setIsSignedIn(true)
    } catch (error) { setLoginError(error.response?.data?.error || 'Could not sign in. Check your connection and try again.') }
    finally { setLoginLoading(false); setAuthReady(true) }
  }
  const signOut = () => {
    localStorage.removeItem('pantry-access-token')
    delete axios.defaults.headers.common.Authorization
    setIsSignedIn(false); setProfileMenuOpen(false); setLoginError('')
  }

  if (!authReady) return <main className="auth-screen"><div className="auth-card"><span className="brand-mark"><Leaf size={21} /></span><p>Opening your pantry…</p></div></main>
  if (!isSignedIn) return <main className="auth-screen"><form className="auth-card" onSubmit={signIn}><span className="brand-mark"><Leaf size={21} /></span><p className="eyebrow">YOUR KITCHEN</p><h1>{loginMode === 'signup' ? 'Create your account' : 'Welcome to Pantry'}</h1><p>{loginMode === 'signup' ? 'Start a pantry of your own. It only takes a moment.' : 'Sign in with your email and password.'}</p>{loginMode === 'signup' && <label>Your name<input type="text" autoComplete="name" autoFocus required maxLength={80} value={loginName} onChange={(event) => setLoginName(event.target.value)} /></label>}<label>Email<input type="email" autoComplete="email" autoFocus={loginMode === 'login'} required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete={loginMode === 'signup' ? 'new-password' : 'current-password'} minLength={loginMode === 'signup' ? 12 : undefined} required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />{loginMode === 'signup' && <small>Use at least 12 characters.</small>}</label>{loginError && <p className="auth-error" role="alert">{loginError}</p>}<button className="primary-button" type="submit" disabled={loginLoading}>{loginLoading ? (loginMode === 'signup' ? 'Creating account…' : 'Signing in…') : (loginMode === 'signup' ? 'Create account' : 'Sign in')}</button><p className="auth-switch">{loginMode === 'signup' ? 'Already have an account?' : 'New to Pantry?'} <button type="button" onClick={() => { setLoginMode(loginMode === 'signup' ? 'login' : 'signup'); setLoginError('') }}>{loginMode === 'signup' ? 'Sign in' : 'Create an account'}</button></p></form></main>

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#top" aria-label="Pantry home"><span className="brand-mark"><Leaf size={21} /></span><span>pantry<small>MAKE ROOM FOR GOOD FOOD</small></span></a>
      <div className="side-label">YOUR KITCHEN</div>
      <button className="nav-link selected"><LayoutDashboard size={18} />Overview <span className="nav-dot" /></button>
      <button className="nav-link" onClick={() => { setActiveCategory('All items'); document.querySelector('.inventory')?.scrollIntoView({ behavior: 'smooth' }) }}><CookingPot size={18} />My pantry <span className="nav-count">{total}</span></button>
      <button className="nav-link" onClick={() => document.querySelector('.recipe-card')?.scrollIntoView({ behavior: 'smooth' })}><Sparkles size={18} />What to cook</button>
      <div className="sidebar-bottom"><div className="weekly-card"><div className="weekly-icon"><Leaf size={18} /></div><p>A little less waste,<br /><strong>a lot more good.</strong></p><div className="weekly-meter"><span /></div><small>{fresh} fresh things in your kitchen</small></div><button className="nav-link muted" onClick={() => { setShoppingMessage(''); setShoppingOpen(true) }}><ShoppingBasket size={18} />Shopping list <span className="nav-count">{shoppingList.length}</span></button><button className="nav-link muted" onClick={openPreferences}><Settings2 size={18} />Preferences</button><div className="profile-shell"><div className="profile"><button className="profile-main" onClick={() => setProfileMenuOpen(!profileMenuOpen)} aria-expanded={profileMenuOpen}><span className="avatar">P</span><span><strong>{pantryName}</strong><small>Home pantry</small></span></button><button className="profile-more" onClick={() => setProfileMenuOpen(!profileMenuOpen)} aria-label="Open pantry menu" aria-expanded={profileMenuOpen}><MoreHorizontal size={18} /></button></div>{profileMenuOpen && <div className="profile-menu" role="menu"><button role="menuitem" onClick={refreshPantry}>Refresh pantry</button><button role="menuitem" onClick={() => { setRenameDraft(pantryName); setRenameOpen(true); setProfileMenuOpen(false) }}>Rename pantry</button><button role="menuitem" onClick={openPreferences}>Preferences</button><button role="menuitem" onClick={signOut}>Sign out</button></div>}</div></div>
    </aside>

    <main className="main-content" id="top">
      <header className="topbar"><div className="breadcrumb">Your kitchen <span>/</span> <strong>Overview</strong></div><div className="top-actions"><span className="today-label">{todayShort}</span><button className="icon-button notification" aria-label={soon.length ? `View ${expiringCount} items nearing expiry` : 'No items nearing expiry'} onClick={showExpiringItems}><Bell size={18} />{soon.length > 0 && <i />}</button><button className="mobile-settings icon-button" onClick={openPreferences} aria-label="Preferences"><Settings2 size={17} /></button><div className="mobile-profile-anchor"><button className="mobile-profile-menu icon-button" onClick={() => setProfileMenuOpen(!profileMenuOpen)} aria-label="Open pantry menu" aria-expanded={profileMenuOpen}><MoreHorizontal size={18} /></button>{profileMenuOpen && <div className="mobile-menu"><button onClick={refreshPantry}>Refresh pantry</button><button onClick={() => { setRenameDraft(pantryName); setRenameOpen(true); setProfileMenuOpen(false) }}>Rename pantry</button><button onClick={openPreferences}>Preferences</button><button onClick={signOut}>Sign out</button></div>}</div><button className="help-button" onClick={() => setHelpOpen(true)}><CircleHelp size={17} /> Help</button></div></header>
      <div className="page-wrap">
        <section className="welcome-row"><div><div className="eyebrow"><span /> {todayLong}</div><h1>Your kitchen,<br className="mobile-break" /> at a glance<span>.</span></h1><p className="subtitle">A good meal starts with knowing what you have.</p></div><button className="primary-button" onClick={openNew}><Plus size={18} /> Add an item</button></section>

        {notice && <div className={`notice ${noticeKind}`} role={noticeKind === 'success' ? 'status' : 'alert'}><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16} /></button></div>}
        <section className="summary-grid" aria-label="Pantry summary">
          <div className="summary-card"><div className="summary-top"><span>IN YOUR PANTRY</span><span className="summary-icon green"><Carrot size={17} /></span></div><div className="summary-value">{total}<small> items</small></div><div className="summary-foot">A little something for every meal</div></div>
          <div className="summary-card"><div className="summary-top"><span>USE THESE SOON</span><span className="summary-icon peach"><Clock3 size={17} /></span></div><div className="summary-value">{expiringCount}<small> items</small></div><div className="summary-foot">{expiredCount ? `${expiredCount} past the use-by date` : soon.length ? `${soon[0].name} is coming up` : 'Everything has time to spare'}</div></div>
          <div className="summary-card freshness"><div className="summary-top"><span>LOOKING FRESH</span><span className="summary-icon yellow"><Sparkles size={17} /></span></div><div className="summary-value">{freshnessPercent}<small>%</small></div><div className="freshness-bar"><span style={{ width: `${freshnessPercent}%` }} /></div><div className="summary-foot">Your pantry is in good shape</div></div>
        </section>

        <section className="inventory section-block">
          <div className="section-heading"><div><div className="eyebrow">THE GOOD STUFF</div><h2>In your pantry <span className="heading-count">{total}</span></h2></div><button className="text-button" onClick={() => { setActiveCategory('All items'); setQuery(''); document.querySelector('.inventory')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>See everything <span>↗</span></button></div>
          <div className="inventory-tools"><div className="tabs" role="tablist">{categories.map((category) => <button key={category} className={activeCategory === category ? 'tab active' : 'tab'} role="tab" aria-selected={activeCategory === category} onClick={() => setActiveCategory(category)}>{category}<span className="tab-count">{categoryCounts[category] ?? 0}</span></button>)}</div><div className="tool-buttons"><label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find something..." /></label><label className="sort-button sort-select"><ArrowDownUp size={15} /><select aria-label="Sort pantry items" value={sortMode} onChange={(event) => setSortMode(event.target.value)}><option value="recent">Recently added</option><option value="urgent">Expiring soon</option><option value="name">Name A–Z</option></select><ChevronDown size={13} /></label></div></div>
          <div className="table-wrap"><table><thead><tr><th>INGREDIENT</th><th>QUANTITY</th><th>HOME</th><th>USE BY</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {loading ? <tr><td colSpan="5" className="empty-state">Opening the pantry…</td></tr> : filtered.length === 0 ? <tr><td colSpan="5" className="empty-state"><span className="empty-emoji">{query ? '🔎' : '🧺'}</span><strong>{query ? 'Nothing by that name' : 'It’s a little quiet in here.'}</strong><span>{query ? 'Try another search.' : 'Add your first ingredient and let’s get cooking.'}</span>{!query && <button className="text-button" onClick={openNew}>Add an item <span>↗</span></button>}</td></tr> : filtered.map((item) => <tr key={item.id}><td><div className="ingredient-cell"><span className={`food-emoji ${item.category?.toLowerCase() || 'other'}`}>{photos[item.id] ? <img src={photos[item.id]} alt="" /> : foodImageFor(item.name, item.category)}</span><span><strong>{item.name}</strong><small>{displayCategory(item.category)}</small></span></div></td><td className="quantity">{Number(item.quantity)} <span>{item.unit}</span></td><td><span className="category-pill">{displayCategory(item.category)}</span></td><td><span className={expiryState(item.expiryDate).kind}>{expiryState(item.expiryDate).kind !== 'date-normal' ? <Clock3 size={13} /> : null}{expiryState(item.expiryDate).label}</span></td><td><div className="row-actions"><button aria-label={`Edit ${item.name}`} disabled={deletingId !== null} onClick={() => openEdit(item)}><Settings2 size={15} /></button><span className="delete-action-anchor"><button aria-label={`Delete ${item.name}`} disabled={deletingId !== null} onClick={() => setDeleteTarget(deleteTarget?.id === item.id ? null : item)}><Trash2 size={15} /></button>{deleteTarget?.id === item.id && <div className="delete-popconfirm" role="dialog" aria-label={`Confirm deleting ${item.name}`}><strong>Remove {item.name} from your pantry?</strong><span>This will permanently remove it from your pantry.</span><div><button type="button" onClick={() => setDeleteTarget(null)}>Keep item</button><button type="button" className="confirm-delete" disabled={deletingId === item.id} onClick={() => removeItem(item)}>{deletingId === item.id ? 'Removing…' : 'Remove item'}</button></div></div>}</span></div></td></tr>)}
          </tbody></table></div>
        </section>

        <section className="bottom-grid"><div className="recipe-card"><div className="recipe-copy"><div className="eyebrow"><Sparkles size={13} /> A LITTLE INSPIRATION</div><div className="recipe-title-row"><h2>Something good<br />is already here.</h2>{recipesLoading && <span className="recipe-loading" role="status" aria-live="polite"><LoaderCircle size={15} className="spin" /> Finding ideas</span>}</div><p>Ideas made from what you’ve got on hand.</p><button className="recipe-button" onClick={findRecipes} disabled={recipesLoading} aria-busy={recipesLoading}>{recipesLoading ? 'Finding ideas…' : 'Find a recipe'} <span>↗</span></button></div><div className="recipe-art"><div className="plate"><span>🥗</span></div><span className="art-sprig sprig-one">✳</span><span className="art-sprig sprig-two">✦</span></div></div><div className="ideas-panel"><div className="section-heading compact"><div><div className="eyebrow">FROM YOUR SHELVES</div><h2>Little ideas</h2></div><button className="round-arrow" onClick={findRecipes} aria-label="Find more ideas" disabled={recipesLoading} aria-busy={recipesLoading}>↗</button></div>{recipeNotice && <p className="recipe-notice" role="status">{recipeNotice}</p>}{Array.isArray(recipes) && recipes.length === 0 && <p className="recipe-empty">No recipe ideas fit these ingredients and preferences yet. Try another preference or add a few pantry items.</p>}{recipeLines.map((recipe, index) => <button type="button" className="idea-row" key={recipe.title} onClick={() => setSelectedRecipe(recipe)} aria-label={`Open recipe: ${recipe.title}`}><span className="idea-emoji">{recipe.icon || ['🍋', '🍳', '🥘'][index % 3]}</span><span className="idea-copy"><strong>{recipe.title}</strong><small>{recipe.text || recipe.description}</small></span><span className="idea-time">{recipe.time || `${recipe.minutes} min`}</span></button>)}</div></section>

        <footer><span>Made with care for the things in your fridge.</span><span><Leaf size={13} /> A little less waste, one meal at a time.</span></footer>
      </div>
    </main>

    {dialog && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDialog(false)}><form className="item-modal" onSubmit={saveItem}><div className="modal-heading"><div><div className="eyebrow">YOUR KITCHEN</div><h2>{editing ? 'Tweak an ingredient' : 'Add to the pantry'}</h2></div><button type="button" className="icon-button" onClick={() => setDialog(false)} aria-label="Close"><X size={19} /></button></div><label>Ingredient name<input required autoFocus list="common-ingredients" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ripe avocados" /><datalist id="common-ingredients">{['Tomatoes','Onions','Potatoes','Rice','Eggs','Milk','Chillies','Spinach','Olive oil','Bread'].map((name) => <option key={name} value={name} />)}</datalist></label><div className="form-row"><label>Amount<input type="number" min="0" step="0.01" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label><label>Unit<input required list="common-units" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs, g, ml..." /><datalist id="common-units"><option value="pcs" /><option value="g" /><option value="kg" /><option value="ml" /><option value="L" /><option value="pack" /></datalist></label></div><div className="form-row"><label>Where it lives<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label><label>Use by<input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></label></div><label className="photo-picker"><span><ImagePlus size={17} /> {photoDraft ? 'Change item photo' : 'Add an item photo'}</span><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1200000) { setNoticeKind('error'); setNotice('Choose an image smaller than 1.2 MB.'); return } const reader = new FileReader(); reader.onload = () => setPhotoDraft(String(reader.result)); reader.readAsDataURL(file) }} /></label>{photoDraft && <div className="photo-preview-wrap"><img className="photo-preview" src={photoDraft} alt="Selected ingredient" /><button type="button" className="remove-photo" onClick={() => setPhotoDraft('')}>Remove photo</button></div>}<div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setDialog(false)}>Cancel</button><button type="submit" className="primary-button" disabled={savingItem}><Check size={16} /> {savingItem ? 'Saving…' : editing ? 'Save changes' : 'Add ingredient'}</button></div></form></div>}
    {selectedRecipe && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedRecipe(null)}><article className="recipe-detail-modal" role="dialog" aria-modal="true" aria-labelledby="recipe-detail-title"><div className="recipe-detail-top"><span className="eyebrow"><Sparkles size={13} /> FROM YOUR PANTRY</span><button type="button" className="icon-button" onClick={() => setSelectedRecipe(null)} aria-label="Close recipe"><X size={18} /></button></div><h2 id="recipe-detail-title">{selectedRecipe.title}</h2><p className="recipe-detail-description">{selectedRecipe.description || selectedRecipe.text}</p><span className="recipe-detail-time"><Clock3 size={14} /> Ready in {selectedRecipe.minutes || Number.parseInt(selectedRecipe.time, 10) || 20} minutes</span><section><h3>What you’ll use</h3><ul>{(selectedRecipe.ingredients?.length ? selectedRecipe.ingredients : (selectedRecipe.text || '').split(',').filter(Boolean)).map((ingredient) => <li key={ingredient}>{ingredient}</li>)}</ul></section><section><h3>How to make it</h3><ol>{(selectedRecipe.steps?.length ? selectedRecipe.steps : ['Gather your ingredients and prep them into bite-size pieces.', 'Cook gently in a pan with a little oil, seasoning as you go.', 'Taste, adjust the seasoning, and serve while warm.']).map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></section><div className="recipe-modal-actions"><button type="button" className="cancel-button" onClick={() => addRecipeMissingToShopping(selectedRecipe)}><ShoppingBasket size={15} /> Add missing to list</button><button type="button" className="primary-button recipe-done" onClick={() => setSelectedRecipe(null)}>Done</button></div></article></div>}
    {preferencesOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPreferencesOpen(false)}><form className="item-modal preferences-modal" onSubmit={savePreferences}><div className="modal-heading"><div><div className="eyebrow">MAKE IT YOURS</div><h2>Preferences</h2></div><button type="button" className="icon-button" onClick={() => setPreferencesOpen(false)} aria-label="Close preferences"><X size={18} /></button></div><p className="modal-description">Choose when Pantry should flag ingredients that are nearing their use-by date.</p><label>Show “use these soon” for ingredients expiring within<input type="number" min="1" max="60" required value={expiryDraft} onChange={(event) => setExpiryDraft(event.target.value)} /><small>days</small></label><label>Recipe preference<select value={dietDraft} onChange={(event) => setDietDraft(event.target.value)}><option>No preference</option><option>Vegetarian</option><option>Vegan</option><option>Gluten-free</option><option>Dairy-free</option></select><small>Used to tailor recipe suggestions</small></label><div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setPreferencesOpen(false)}>Cancel</button><button type="submit" className="primary-button"><Check size={16} /> Save preferences</button></div></form></div>}
    {helpOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setHelpOpen(false)}><section className="item-modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="modal-heading"><div><div className="eyebrow">A QUICK GUIDE</div><h2 id="help-title">A few helpful things</h2></div><button type="button" className="icon-button" onClick={() => setHelpOpen(false)} aria-label="Close help"><X size={18} /></button></div><ul><li><strong>Keep your pantry current.</strong> Add ingredients with their quantity, home, and use-by date.</li><li><strong>Use things in time.</strong> Choose “Expiring soon” to bring dated items to the top.</li><li><strong>Find something to cook.</strong> Recipe ideas use your pantry and preferences.</li><li><strong>Plan what to buy.</strong> Send missing recipe ingredients to your shopping list.</li></ul><p>Your items are stored in the pantry database. Photos and the shopping list stay in this browser.</p><button type="button" className="primary-button" onClick={() => setHelpOpen(false)}>Got it</button></section></div>}
    {shoppingOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShoppingOpen(false)}><section className="item-modal shopping-modal" role="dialog" aria-modal="true" aria-labelledby="shopping-title"><div className="modal-heading"><div><div className="eyebrow">A LITTLE SHOPPING</div><h2 id="shopping-title">Shopping list</h2></div><button type="button" className="icon-button" onClick={() => setShoppingOpen(false)} aria-label="Close shopping list"><X size={18} /></button></div><p className="shopping-description">Keep track of ingredients you need to pick up. Add items here, or open a recipe and choose “Add missing to list” to bring over anything you don’t already have in your pantry. Remove an item with × when you no longer need it.</p>{shoppingMessage && <p className="shopping-feedback" role="status">{shoppingMessage}</p>}<form className="shopping-add" onSubmit={(event) => { event.preventDefault(); const name = shoppingDraft.trim(); if (!name) return; const alreadyListed = shoppingList.some((item) => item.toLowerCase() === name.toLowerCase()); if (!alreadyListed) { setShoppingItems([...shoppingList, name]); setShoppingMessage(`${name} added to your list.`) } else setShoppingMessage(`${name} is already on your list.`); setShoppingDraft('') }}><input aria-label="Add to shopping list" value={shoppingDraft} onChange={(event) => setShoppingDraft(event.target.value)} placeholder="Add something to buy…" /><button className="primary-button" type="submit"><Plus size={16} /> Add</button></form>{shoppingList.length ? <ul className="shopping-items">{shoppingList.map((item) => <li key={item}><span>{item}</span><button type="button" onClick={() => { setShoppingItems(shoppingList.filter((entry) => entry !== item)); setShoppingMessage(`${item} removed from your list.`) }} aria-label={`Remove ${item}`}><X size={16} /></button></li>)}</ul> : <p className="shopping-empty">Nothing on the list yet. Add an item or send missing recipe ingredients here.</p>}</section></div>}
    {renameOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setRenameOpen(false)}><form className="item-modal" onSubmit={savePantryName}><div className="modal-heading"><div><div className="eyebrow">YOUR KITCHEN</div><h2>Name this pantry</h2></div><button type="button" className="icon-button" onClick={() => setRenameOpen(false)} aria-label="Close"><X size={18} /></button></div><label>Pantry name<input autoFocus required maxLength="40" value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} /></label><div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setRenameOpen(false)}>Cancel</button><button type="submit" className="primary-button"><Check size={16} /> Save name</button></div></form></div>}
  </div>
}

export default App
