import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabaseClient';
import { Bus, LogOut, Plus, Search, Trash2, Edit, FileDown, Users, Clock, MapPin } from 'lucide-react';
import './styles.css';

const CAPACITY = 40;

function niceName(email='') {
  if (email.toLowerCase().includes('jana')) return 'Jana';
  if (email.toLowerCase().includes('nadine')) return 'Nadine';
  return email.split('@')[0] || 'Benutzer';
}

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!session) return <Login />;
  return <Dashboard user={session.user} />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  async function login(e) {
    e.preventDefault();
    setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg('Login fehlgeschlagen: ' + error.message);
  }

  return <main className="loginPage">
    <form className="loginCard" onSubmit={login}>
      <h1>🎭 11.11. Kölle</h1>
      <p>Login für Nadine und Jana</p>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-Mail" type="email" required />
      <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Passwort" type="password" required />
      <button>Einloggen</button>
      {msg && <div className="error">{msg}</div>}
    </form>
  </main>
}

function Dashboard({ user }) {
  const [stops, setStops] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ id:null, name:'', stop_id:'', note:'', status:'confirmed' });
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from('stops').select('*').order('sort_order'),
      supabase.from('participants').select('*').order('name')
    ]);
    setStops(s || []); setParticipants(p || []); setLoading(false);
  }
  useEffect(()=>{ load(); }, []);

  const confirmed = participants.filter(p=>p.status==='confirmed');
  const waiting = participants.filter(p=>p.status==='waiting');
  const free = Math.max(0, CAPACITY - confirmed.length);

  const filtered = useMemo(()=>{
    const q = search.trim().toLowerCase();
    return q ? participants.filter(p => p.name.toLowerCase().includes(q) || (p.note||'').toLowerCase().includes(q)) : participants;
  }, [participants, search]);

  function openNew(status='confirmed') {
    setForm({ id:null, name:'', stop_id:stops[0]?.id || '', note:'', status: confirmed.length >= CAPACITY ? 'waiting' : status });
    setShowForm(true);
  }
  function edit(p) { setForm({ ...p, stop_id: p.stop_id || '' }); setShowForm(true); }

  async function save(e) {
    e.preventDefault();
    const payload = { name: form.name.trim(), stop_id: Number(form.stop_id), note: (form.note||'').trim().slice(0,100), status: form.status };
    if (!payload.name) return;
    if (form.id) await supabase.from('participants').update(payload).eq('id', form.id);
    else await supabase.from('participants').insert(payload);
    setShowForm(false); await load();
  }
  async function remove(id) { if(confirm('Teilnehmer wirklich löschen?')) { await supabase.from('participants').delete().eq('id', id); await load(); }}
  async function logout() { await supabase.auth.signOut(); }
  function stopName(id) { const s = stops.find(x=>x.id===id); return s ? `${s.place} – ${s.label}` : 'Ohne Haltestelle'; }
  function moveStatus(p, status) { supabase.from('participants').update({status}).eq('id', p.id).then(load); }
  function getLastName(name = '') {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

function printPdf() {
  const confirmedOnly = participants.filter(p => p.status === 'confirmed');

  let html = `
    <html>
      <head>
        <title>11.11. Kölle - Busliste</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 30px;
            color: #111;
          }
          h1 {
            font-size: 24px;
            margin-bottom: 5px;
          }
          
          h2 {
  font-size: 14px;
  margin-top: 10px;
  margin-bottom: 4px;
  border-bottom: 1px solid #ccc;
  padding-bottom: 2px;
}
          ul {
  list-style: none;
  padding: 0;
  margin: 2px 0 4px 0;
}
          li {
  font-size: 11px;
  padding: 1px 0;
}
          .checkbox {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 1px solid #333;
            margin-right: 10px;
            vertical-align: middle;
          }
          .note {
            color: #666;
            font-size: 13px;
            margin-left: 8px;
          }
          .stop-count {
  font-size: 10px;
  font-weight: bold;
  margin: 2px 0 8px 0;
}
        </style>
      </head>
      <body>
        <h1>11.11. Kölle – Busliste</h1>
          `;

  stops.forEach(stop => {
    const list = confirmedOnly
      .filter(p => p.stop_id === stop.id)
      .sort((a, b) => getLastName(a.name).localeCompare(getLastName(b.name), 'de'));

    html += `<h2>${stop.time} Uhr – ${stop.place}, ${stop.label}</h2>`;
    html += `<ul>`;

    list.forEach(p => {
      html += `
        <li>
          <span class="checkbox"></span>
          ${getLastName(p.name)}, ${p.name.split(' ').slice(0, -1).join(' ')}
          ${p.note ? `<span class="note">(${p.note})</span>` : ''}
        </li>
      `;
    });
html += `<div class="stop-count">Anzahl: ${list.length} Personen</div>`;
    html += `</ul>`;
  });

  html += `
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

  return <div className="app">
    <aside className="sidebar noPrint">
      <div className="brand">🎭<span>11.11.<br/>Kölle</span></div>
      <button className="nav active"><Users size={18}/> Übersicht</button>
      <button className="nav" onClick={()=>openNew()}><Plus size={18}/> Teilnehmer hinzufügen</button>
      <button className="nav" onClick={printPdf}><FileDown size={18}/> PDF / Drucken</button>
      <div className="userBox">Angemeldet als<br/><b>{niceName(user.email)}</b><button onClick={logout}><LogOut size={16}/> Abmelden</button></div>
    </aside>
    <main className="content">
          <div className="mobileTopbar noPrint">
        <span>Angemeldet als <b>{niceName(user.email)}</b></span>
        <button onClick={logout}><LogOut size={16}/> Abmelden</button>
      </div>
      <section className="hero">
        <div className="heroText"><h1>11.11. Kölle</h1>
          <div className="infoGrid"><div className="glass"><h3><Clock size={18}/> Abfahrten</h3>{stops.map(s=><p key={s.id}><b>{s.time} Uhr</b><span>{s.place} – {s.label}</span></p>)}</div><div className="glass">
  <h3>🚌 Rückfahrt</h3>

  <div className="return-trip">
    <div>🕒 ca. 19:00 Uhr</div>
    <div>📍 Köln</div>
  </div>
</div></div></div>
        <div className="seatCard"><div><strong>{confirmed.length}</strong> / {CAPACITY}<span>Plätze belegt</span></div><div><strong className="green">{free}</strong><span>Plätze frei</span></div><progress max={CAPACITY} value={confirmed.length}/></div>
      </section>
      <section className="toolbar noPrint"><div className="search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Suche nach Namen oder Notiz..."/></div><button onClick={()=>openNew()}><Plus size={18}/> Teilnehmer hinzufügen</button></section>
      {loading ? <p>Lade Daten...</p> : <section className="lists">
        <div className="confirmed"><h2>Teilnehmer nach Haltestelle</h2><div className="stopGrid">{stops.map(s=>{ const list = filtered.filter(p=>p.status==='confirmed' && p.stop_id===s.id).sort((a,b)=>a.name.localeCompare(b.name,'de')); return <div className="stopCard" key={s.id}><h3>{s.time} Uhr</h3><p>{s.place} – {s.label}</p><span className="badge">{list.length} Personen</span>{list.map(p=><Person key={p.id} p={p} stopName={stopName} edit={edit} remove={remove} moveStatus={moveStatus}/>)}</div>})}</div></div>
        <div className="wait"><h2>Warteliste ({waiting.length})</h2>{waiting.sort((a,b)=>a.name.localeCompare(b.name,'de')).map(p=><Person key={p.id} p={p} stopName={stopName} edit={edit} remove={remove} moveStatus={moveStatus} waiting />)}</div>
      </section>}
    </main>
    {showForm && <div className="modal noPrint"><form onSubmit={save} className="modalCard"><h2>{form.id ? 'Teilnehmer bearbeiten' : 'Teilnehmer hinzufügen'}</h2><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Name" required autoFocus/><select value={form.stop_id} onChange={e=>setForm({...form,stop_id:e.target.value})} required>{stops.map(s=><option value={s.id} key={s.id}>{s.time} Uhr – {s.place}, {s.label}</option>)}</select><input maxLength="100" value={form.note||''} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Kurze Notiz (optional)"/><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="confirmed">Teilnehmerliste</option><option value="waiting">Warteliste</option></select><div className="row"><button type="button" className="secondary" onClick={()=>setShowForm(false)}>Abbrechen</button><button>Speichern</button></div></form></div>}
  </div>
}

function Person({ p, stopName, edit, remove, moveStatus, waiting=false }) {
  return <div className="person"><div><b>{p.name}</b>{waiting && <small>{stopName(p.stop_id)}</small>}{p.note && <em>{p.note}</em>}</div><div className="actions noPrint"><button title="Bearbeiten" onClick={()=>edit(p)}><Edit size={15}/></button>{waiting ? <button onClick={()=>moveStatus(p,'confirmed')}>Übernehmen</button> : <button onClick={()=>moveStatus(p,'waiting')}>Warteliste</button>}<button title="Löschen" onClick={()=>remove(p.id)}><Trash2 size={15}/></button></div></div>
}

createRoot(document.getElementById('root')).render(<App />)