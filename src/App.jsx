import { useEffect, useMemo, useRef, useState } from 'react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

function useAutoRefresh(callback, enabled, intervalMs) {
  useEffect(() => {
    if (!enabled) return
    callback()
    const id = setInterval(callback, intervalMs)
    return () => clearInterval(id)
  }, [enabled, intervalMs])
}

function Beeper() {
  const ctxRef = useRef(null)
  const beep = (frequency = 880, duration = 200) => {
    try {
      const ctx = ctxRef.current || new (window.AudioContext || window.webkitAudioContext)()
      ctxRef.current = ctx
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.connect(g)
      g.connect(ctx.destination)
      o.type = 'sine'
      o.frequency.value = frequency
      o.start()
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000)
      setTimeout(() => o.stop(), duration)
    } catch {}
  }
  return { beep }
}

function SummaryCard({ label, value, color }) {
  return (
    <div className={`flex-1 rounded-xl p-4 text-white shadow-sm ${color}`}>
      <div className="text-sm opacity-90">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  )
}

function App() {
  const [sections, setSections] = useState([])
  const [alerts, setAlerts] = useState([])
  const [inspections, setInspections] = useState([])
  const [summary, setSummary] = useState({ total: 0, safe: 0, faulty: 0, critical: 0 })
  const [loading, setLoading] = useState(false)
  const [auto, setAuto] = useState(true)
  const [intervalMs, setIntervalMs] = useState(5000)
  const [theme, setTheme] = useState('light')
  const [creating, setCreating] = useState({ name: '', color_safe: '#16a34a', color_faulty: '#dc2626' })
  const [selected, setSelected] = useState(null)
  const [soundOn, setSoundOn] = useState(true)
  const beeper = Beeper()
  const lastAlertId = useRef(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [sRes, aRes, sumRes] = await Promise.all([
        fetch(`${BACKEND}/api/sections`),
        fetch(`${BACKEND}/api/alerts?only_open=true`),
        fetch(`${BACKEND}/api/summary`),
      ])
      const s = await sRes.json()
      const a = await aRes.json()
      const sm = await sumRes.json()
      setSections(s)
      setAlerts(a)
      setSummary(sm)

      // Fetch recent inspections for selected or all
      const inspRes = await fetch(`${BACKEND}/api/inspections?limit=50`)
      const insp = await inspRes.json()
      setInspections(insp)

      // Sound on new alerts
      if (soundOn && a.length > 0) {
        const newest = a[0].id
        if (lastAlertId.current && newest !== lastAlertId.current) {
          beeper.beep(1046, 220)
          setTimeout(() => beeper.beep(784, 220), 240)
        }
        lastAlertId.current = newest
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  useAutoRefresh(fetchAll, auto, intervalMs)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!creating.name.trim()) return
    const res = await fetch(`${BACKEND}/api/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creating),
    })
    if (res.ok) {
      setCreating({ name: '', color_safe: '#16a34a', color_faulty: '#dc2626' })
      fetchAll()
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this section?')) return
    const res = await fetch(`${BACKEND}/api/sections/${id}`, { method: 'DELETE' })
    if (res.ok) fetchAll()
  }

  const markSection = async (id, status) => {
    await fetch(`${BACKEND}/api/sections/${id}/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchAll()
  }

  const updateColors = async (id, color_safe, color_faulty) => {
    await fetch(`${BACKEND}/api/sections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color_safe, color_faulty }),
    })
    fetchAll()
  }

  const summaryCards = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <SummaryCard label="Total" value={summary.total} color="bg-slate-700" />
      <SummaryCard label="Safe" value={summary.safe} color="bg-green-600" />
      <SummaryCard label="Faulty" value={summary.faulty} color="bg-red-600" />
      <SummaryCard label="Critical (repeat)" value={summary.critical} color="bg-amber-600" />
    </div>
  )

  const SectionTile = ({ section }) => {
    const isFaulty = section.status === 'faulty'
    const color = isFaulty ? section.color_faulty : section.color_safe
    return (
      <button
        onClick={() => setSelected(section)}
        className="rounded-xl p-4 shadow border transition transform hover:-translate-y-0.5"
        style={{ background: theme === 'dark' ? '#0b1220' : '#fff', borderColor: theme === 'dark' ? '#1f2a44' : '#e5e7eb' }}
      >
        <div className="flex items-start justify-between">
          <div className="font-semibold text-left" style={{ color: theme === 'dark' ? '#e5e7eb' : '#0f172a' }}>{section.name}</div>
          <span className="text-xs px-2 py-1 rounded-full text-white" style={{ background: color }}>
            {isFaulty ? 'Faulty' : 'Safe'}
          </span>
        </div>
        <div className="mt-3 h-2 w-full rounded" style={{ background: color }} />
        <div className="mt-3 text-xs opacity-80" style={{ color: theme === 'dark' ? '#cbd5e1' : '#334155' }}>
          Last check: {section.last_check ? new Date(section.last_check).toLocaleString() : '—'}
        </div>
        {section.persistent_faults >= 3 && (
          <div className="mt-2 text-xs font-medium text-amber-600">Critical: repeated faults</div>
        )}
        <div className="mt-3 flex gap-2">
          <button onClick={(e)=>{e.stopPropagation(); markSection(section.id,'safe')}} className="text-xs px-2 py-1 rounded bg-green-600 text-white">Mark Safe</button>
          <button onClick={(e)=>{e.stopPropagation(); markSection(section.id,'faulty')}} className="text-xs px-2 py-1 rounded bg-red-600 text-white">Mark Faulty</button>
        </div>
      </button>
    )
  }

  const SelectedPanel = () => {
    if (!selected) return null
    const s = selected
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={()=>setSelected(null)}>
        <div className="w-full max-w-xl rounded-2xl p-6 shadow-xl" style={{ background: theme==='dark'? '#0b1220':'#ffffff' }} onClick={e=>e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold" style={{ color: theme==='dark'? '#e5e7eb':'#0f172a' }}>Section details</h3>
            <button className="text-sm px-3 py-1 rounded bg-slate-200" onClick={()=>setSelected(null)}>Close</button>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-sm opacity-80">Name</div>
              <div className="font-medium">{s.name}</div>
            </div>
            <div>
              <div className="text-sm opacity-80">Status</div>
              <div className="font-medium">{s.status}</div>
            </div>
            <div>
              <div className="text-sm opacity-80">Last check</div>
              <div className="font-medium">{s.last_check ? new Date(s.last_check).toLocaleString() : '—'}</div>
            </div>
            <div>
              <div className="text-sm opacity-80">Persistent faults</div>
              <div className="font-medium">{s.persistent_faults}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 rounded border">
              <div className="text-sm font-medium mb-2">Colors</div>
              <div className="flex items-center gap-3 mb-2">
                <label className="text-xs w-20">Safe</label>
                <input type="color" value={s.color_safe} onChange={(e)=>setSelected({...s, color_safe: e.target.value})} />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs w-20">Faulty</label>
                <input type="color" value={s.color_faulty} onChange={(e)=>setSelected({...s, color_faulty: e.target.value})} />
              </div>
              <button className="mt-3 text-sm px-3 py-1 rounded bg-blue-600 text-white" onClick={()=>updateColors(s.id, s.color_safe, s.color_faulty)}>Save</button>
            </div>
            <div className="p-3 rounded border">
              <div className="text-sm font-medium mb-2">Actions</div>
              <div className="flex gap-2">
                <button className="text-sm px-3 py-1 rounded bg-green-600 text-white" onClick={()=>markSection(s.id,'safe')}>Mark Safe</button>
                <button className="text-sm px-3 py-1 rounded bg-red-600 text-white" onClick={()=>markSection(s.id,'faulty')}>Mark Faulty</button>
                <button className="text-sm px-3 py-1 rounded bg-slate-600 text-white" onClick={()=>window.print()}>Print</button>
                <button className="text-sm px-3 py-1 rounded bg-slate-200" onClick={()=>handleDelete(s.id)}>Delete</button>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-medium mb-2">Recent inspections</div>
            <div className="max-h-48 overflow-auto border rounded">
              {inspections.filter(i=>i.section_id===s.id).map(i=> (
                <div key={i.id} className="px-3 py-2 text-sm flex justify-between border-b last:border-b-0">
                  <span>{i.status}</span>
                  <span className="opacity-70">{new Date(i.inspected_at).toLocaleString()}</span>
                </div>
              ))}
              {inspections.filter(i=>i.section_id===s.id).length === 0 && (
                <div className="px-3 py-6 text-center text-sm opacity-70">No inspections yet</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={theme==='dark' ? 'bg-slate-900 text-slate-100 min-h-screen' : 'bg-slate-50 text-slate-900 min-h-screen'}>
      <header className="sticky top-0 z-40 backdrop-blur bg-white/60 dark:bg-slate-900/60 border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xl font-bold">Smart Railway Track Inspection</div>
            <span className="text-xs opacity-70">Realtime dashboard</span>
          </div>
          <div className="flex items-center gap-2">
            <a href={`${BACKEND}/api/export/sections`} className="px-3 py-1 rounded bg-slate-200 text-sm">Export Sections CSV</a>
            <a href={`${BACKEND}/api/export/inspections`} className="px-3 py-1 rounded bg-slate-200 text-sm">Export Inspections CSV</a>
            <button onClick={()=>setSoundOn(s=>!s)} className="px-3 py-1 rounded bg-slate-200 text-sm">{soundOn?'Sound On':'Sound Off'}</button>
            <button onClick={()=>setTheme(t=> t==='light'?'dark':'light')} className="px-3 py-1 rounded bg-slate-800 text-white text-sm">{theme==='light'?'Dark':'Light'} mode</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {summaryCards}

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="rounded-2xl p-4 border bg-white shadow-sm" style={{ background: theme==='dark'? '#0b1220':'#ffffff', borderColor: theme==='dark'? '#1f2a44':'#e5e7eb' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Track sections</h3>
                <div className="flex items-center gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)} /> Auto-refresh
                  </label>
                  <select className="border rounded px-2 py-1" value={intervalMs} onChange={e=>setIntervalMs(Number(e.target.value))}>
                    <option value={3000}>3s</option>
                    <option value={5000}>5s</option>
                    <option value={10000}>10s</option>
                  </select>
                  <button onClick={fetchAll} className="px-3 py-1 rounded bg-slate-800 text-white">Refresh</button>
                </div>
              </div>
              {sections.length === 0 ? (
                <div className="p-6 text-center text-sm opacity-70">No sections yet. Add one using the form on the right.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sections.map(s => <SectionTile key={s.id} section={s} />)}
                </div>
              )}
            </div>

            <div className="rounded-2xl p-4 border bg-white shadow-sm" style={{ background: theme==='dark'? '#0b1220':'#ffffff', borderColor: theme==='dark'? '#1f2a44':'#e5e7eb' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Open alerts</h3>
                <button onClick={fetchAll} className="px-3 py-1 rounded bg-slate-800 text-white text-sm">Check</button>
              </div>
              <div className="space-y-2 max-h-60 overflow-auto">
                {alerts.length === 0 && <div className="text-sm opacity-70">No open alerts</div>}
                {alerts.map(a => (
                  <div key={a.id} className="p-3 rounded border flex items-center justify-between" style={{ borderColor: theme==='dark'? '#1f2a44':'#e5e7eb' }}>
                    <div>
                      <div className="text-sm font-medium">{a.message}</div>
                      <div className="text-xs opacity-70">Severity: {a.severity}</div>
                    </div>
                    <button onClick={async()=>{await fetch(`${BACKEND}/api/alerts/ack/${a.id}`,{method:'POST'}); fetchAll()}} className="text-sm px-3 py-1 rounded bg-green-600 text-white">Acknowledge</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl p-4 border bg-white shadow-sm" style={{ background: theme==='dark'? '#0b1220':'#ffffff', borderColor: theme==='dark'? '#1f2a44':'#e5e7eb' }}>
              <div className="font-semibold mb-3">Add / manage sections</div>
              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <label className="text-sm">Name</label>
                  <input value={creating.name} onChange={e=>setCreating({...creating, name:e.target.value})} className="w-full mt-1 px-3 py-2 border rounded" placeholder="e.g., S1" />
                </div>
                <div className="flex items-center gap-3">
                  <div>
                    <div className="text-xs opacity-80">Safe color</div>
                    <input type="color" value={creating.color_safe} onChange={e=>setCreating({...creating, color_safe:e.target.value})} />
                  </div>
                  <div>
                    <div className="text-xs opacity-80">Faulty color</div>
                    <input type="color" value={creating.color_faulty} onChange={e=>setCreating({...creating, color_faulty:e.target.value})} />
                  </div>
                </div>
                <button className="w-full px-3 py-2 rounded bg-blue-600 text-white">Add Section</button>
              </form>
              <div className="mt-4 text-xs opacity-70">Tip: Click a section tile to view details, change colors, or print.</div>
            </div>

            <div className="rounded-2xl p-4 border bg-white shadow-sm" style={{ background: theme==='dark'? '#0b1220':'#ffffff', borderColor: theme==='dark'? '#1f2a44':'#e5e7eb' }}>
              <div className="font-semibold mb-3">Inspection history (latest)</div>
              <div className="max-h-80 overflow-auto divide-y">
                {inspections.length === 0 && <div className="text-sm opacity-70">No inspections yet</div>}
                {inspections.map(i => (
                  <div key={i.id} className="py-2 text-sm flex items-center justify-between">
                    <div className="flex-1">{i.status}</div>
                    <div className="flex-1 text-center opacity-80">{i.detail || '—'}</div>
                    <div className="flex-1 text-right opacity-70">{new Date(i.inspected_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <SelectedPanel />
    </div>
  )
}

export default App
