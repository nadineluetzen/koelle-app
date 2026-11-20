import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabaseClient';
import { Bus, LogOut, Plus, Search, Trash2, Edit, FileDown, Users, Clock, MapPin } from 'lucide-react';
import './styles.css';

const CAPACITY = 52;

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
  const [capacity, setCapacity] = useState(CAPACITY);
  const [capacityInput, setCapacityInput] = useState(String(CAPACITY));
  const [savingCapacity, setSavingCapacity] = useState(false);

  const [showStopsManager, setShowStopsManager] = useState(false);
  const [stopForm, setStopForm] = useState(null);
  const [savingStop, setSavingStop] = useState(false);
  const [busyStops, setBusyStops] = useState(false);

  function newStop() {
    setStopForm({ id: null, time: '08:00', place: '', label: '' });
  }

  function editStop(stop) {
    setStopForm({ id: stop.id, time: stop.time || '', place: stop.place || '', label: stop.label || '' });
  }

  async function saveStop(e) {
    e.preventDefault();
    if (savingStop) return;
    const time = stopForm.time.trim();
    const place = stopForm.place.trim();
    const label = stopForm.label.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !place || !label) {
      alert('Bitte Uhrzeit (HH:MM), Ort und Treffpunkt vollständig eingeben.');
      return;
    }
    setSavingStop(true);
    const values = { time, place, label };
    const result = stopForm.id != null
      ? await supabase.from('stops').update(values).eq('id', stopForm.id).select('id')
      : await supabase.from('stops').insert({ ...values, sort_order: Math.max(0, ...stops.map(s => Number(s.sort_order) || 0)) + 1 }).select('id');
    setSavingStop(false);
    if (result.error || !result.data?.length) {
      alert('Haltestelle konnte nicht gespeichert werden: ' + (result.error?.message || 'Keine Änderung bestätigt.'));
      return;
    }
    setStopForm(null);
    await load();
  }

  async function deleteStop(stop) {
    if (busyStops) return;
    if (participants.some(p => Number(p.stop_id) === Number(stop.id))) {
      alert('Dieser Haltestelle sind noch Teilnehmer zugeordnet. Bitte diese zuerst einer anderen Haltestelle zuordnen oder entfernen.');
      return;
    }
    if (!window.confirm(`Haltestelle „${stop.place} – ${stop.label}“ wirklich löschen?`)) return;
    setBusyStops(true);
    const { data, error } = await supabase.from('stops').delete().eq('id', stop.id).select('id');
    setBusyStops(false);
    if (error || !data?.length) {
      alert('Löschen fehlgeschlagen: ' + (error?.message || 'Keine Löschung bestätigt.'));
      return;
    }
    await load();
  }

  async function moveStop(index, direction) {
    if (busyStops || index + direction < 0 || index + direction >= stops.length) return;
    const first = stops[index];
    const second = stops[index + direction];
    setBusyStops(true);
    // Tausche die Reihenfolge. Ein erneutes Laden zeigt immer den Datenbankstand.
    const a = await supabase.from('stops').update({ sort_order: second.sort_order }).eq('id', first.id).select('id');
    if (a.error || !a.data?.length) {
      setBusyStops(false);
      alert('Reihenfolge konnte nicht geändert werden: ' + (a.error?.message || 'Änderung nicht bestätigt.'));
      await load();
      return;
    }
    const b = await supabase.from('stops').update({ sort_order: first.sort_order }).eq('id', second.id).select('id');
    if (b.error || !b.data?.length) {
      // Best effort: den ersten Wert wiederherstellen.
      await supabase.from('stops').update({ sort_order: first.sort_order }).eq('id', first.id);
      alert('Reihenfolge konnte nicht vollständig geändert werden: ' + (b.error?.message || 'Änderung nicht bestätigt.'));
    }
    setBusyStops(false);
    await load();
  }


  async function saveCapacity() {
    const newCapacity = Number(capacityInput);
    if (!Number.isSafeInteger(newCapacity) || newCapacity < 1) {
      alert('Bitte eine gültige Anzahl an Busplätzen eingeben.');
      return;
    }

    setSavingCapacity(true);
    const { data, error } = await supabase
      .from('app_settings')
      .update({ capacity: newCapacity })
      .eq('id', 1)
      .select('capacity')
      .single();
    setSavingCapacity(false);

    if (error || !data) {
      alert('Speichern fehlgeschlagen: ' + (error?.message || 'Einstellung nicht gefunden.'));
      return;
    }
    setCapacity(data.capacity);
    setCapacityInput(String(data.capacity));
    alert('Busplätze erfolgreich gespeichert!');
  }

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: p }, { data: settings, error: settingsError }] = await Promise.all([
      supabase.from('stops').select('*').order('sort_order').order('id'),
      supabase.from('participants').select('*').order('name'),
      supabase.from('app_settings').select('capacity').eq('id', 1).single()
    ]);
    if (settingsError) {
      alert('Busplatzzahl konnte nicht geladen werden: ' + settingsError.message);
    } else if (settings) {
      setCapacity(settings.capacity);
      setCapacityInput(String(settings.capacity));
    }
    setStops(s || []);
    setParticipants(p || []);
    setLoading(false);
  }
  useEffect(()=>{ load(); }, []);

  const confirmed = participants.filter(p=>p.status==='confirmed');
const waiting = participants
  .filter(p => p.status === 'waiting')
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const free = Math.max(0, capacity - confirmed.length);

  const filtered = useMemo(()=>{
    const q = search.trim().toLowerCase();
    return q ? participants.filter(p => p.name.toLowerCase().includes(q) || (p.note||'').toLowerCase().includes(q)) : participants;
  }, [participants, search]);

  function openNew(status='confirmed') {
    setForm({ id:null, name:'', stop_id:stops[0]?.id || '', note:'', status: confirmed.length >= capacity ? 'waiting' : status });
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
        <div className="seatCard"><div><strong>{confirmed.length}</strong> / {capacity}<span>Plätze belegt</span></div><div><strong className="green">{free}</strong><span>Plätze frei</span></div><progress max={capacity} value={confirmed.length}/></div>
      
<div className="noPrint" style={{marginTop:12}}>
  <label>
    Busplätze:
    <input
      type="number"
      min="1"
      value={capacityInput}
      onChange={e => setCapacityInput(e.target.value)}
      style={{width:75, marginLeft:10, padding:6}}
    />
  </label>
  <button type="button" onClick={saveCapacity} disabled={savingCapacity || loading} style={{marginLeft:10, padding:6}}>{savingCapacity ? 'Speichert...' : 'Speichern'}</button>
</div>
</section>
      <section className="noPrint" style={{margin:'16px 0', padding:16, border:'1px solid #ddd', borderRadius:12}}>
        <button type="button" onClick={()=>setShowStopsManager(v=>!v)}>
          <MapPin size={16}/> {showStopsManager ? 'Haltestellenverwaltung schließen' : 'Haltestellen verwalten'}
        </button>
        {showStopsManager && <div style={{marginTop:14}}>
          <h2>Haltestellen verwalten</h2>
          <p>Hier könnt ihr Haltestellen hinzufügen, bearbeiten, löschen und ihre Reihenfolge ändern.</p>
          {stops.map((stop, index)=><div key={stop.id} style={{display:'flex', flexWrap:'wrap', alignItems:'center', gap:8, padding:'10px 0', borderBottom:'1px solid #ddd'}}>
            <span style={{flex:'1 1 220px'}}><b>{stop.time} Uhr</b> – {stop.place}, {stop.label}</span>
            <button type="button" disabled={busyStops || index===0} onClick={()=>moveStop(index,-1)} title="Nach oben">↑</button>
            <button type="button" disabled={busyStops || index===stops.length-1} onClick={()=>moveStop(index,1)} title="Nach unten">↓</button>
            <button type="button" disabled={busyStops} onClick={()=>editStop(stop)}><Edit size={15}/> Bearbeiten</button>
            <button type="button" disabled={busyStops} onClick={()=>deleteStop(stop)}><Trash2 size={15}/> Löschen</button>
          </div>)}
          <button type="button" disabled={busyStops} onClick={newStop} style={{marginTop:12}}><Plus size={16}/> Neue Haltestelle</button>
        </div>}
      </section>
      <section className="toolbar noPrint"><div className="search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Suche nach Namen oder Notiz..."/></div><button onClick={()=>openNew()}><Plus size={18}/> Teilnehmer hinzufügen</button></section>
      {loading ? <p>Lade Daten...</p> : <section className="lists">
        <div className="confirmed"><h2>Teilnehmer nach Haltestelle</h2><div className="stopGrid">{stops.map(s=>{ const list = filtered.filter(p=>p.status==='confirmed' && p.stop_id===s.id).sort((a,b)=>a.name.localeCompare(b.name,'de')); return <div className="stopCard" key={s.id}><h3>{s.time} Uhr</h3><p>{s.place} – {s.label}</p><span className="badge">{list.length} Personen</span>{list.map(p=><Person key={p.id} p={p} stopName={stopName} edit={edit} remove={remove} moveStatus={moveStatus}/>)}</div>})}</div></div>
<div className="wait"><h2>Warteliste ({waiting.length})</h2>{waiting.map((p,index)=><Person key={p.id} p={p} stopName={stopName} edit={edit} remove={remove} moveStatus={moveStatus} waiting position={index + 1} />)}</div>
      </section>}
    </main>
    {stopForm && <div className="modal noPrint">
      <form className="modalCard" onSubmit={saveStop}>
        <h2>{stopForm.id == null ? 'Haltestelle hinzufügen' : 'Haltestelle bearbeiten'}</h2>
        <label>Abfahrtszeit (HH:MM)</label>
        <input type="time" required value={stopForm.time} onChange={e=>setStopForm({...stopForm,time:e.target.value})}/>
        <label>Ort</label>
        <input required maxLength={100} value={stopForm.place} onChange={e=>setStopForm({...stopForm,place:e.target.value})} placeholder="z. B. Daleiden"/>
        <label>Treffpunkt</label>
        <input required maxLength={150} value={stopForm.label} onChange={e=>setStopForm({...stopForm,label:e.target.value})} placeholder="z. B. Kirche"/>
        <div className="row">
          <button type="button" className="secondary" onClick={()=>setStopForm(null)} disabled={savingStop}>Abbrechen</button>
          <button type="submit" disabled={savingStop}>{savingStop ? 'Speichert...' : 'Speichern'}</button>
        </div>
      </form>
    </div>}
    {showForm && <div className="modal noPrint"><form onSubmit={save} className="modalCard"><h2>{form.id ? 'Teilnehmer bearbeiten' : 'Teilnehmer hinzufügen'}</h2><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Name" required autoFocus/><select value={form.stop_id} onChange={e=>setForm({...form,stop_id:e.target.value})} required>{stops.map(s=><option value={s.id} key={s.id}>{s.time} Uhr – {s.place}, {s.label}</option>)}</select><input maxLength="100" value={form.note||''} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Kurze Notiz (optional)"/><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="confirmed">Teilnehmerliste</option><option value="waiting">Warteliste</option></select><div className="row"><button type="button" className="secondary" onClick={()=>setShowForm(false)}>Abbrechen</button><button>Speichern</button></div></form></div>}
  </div>
}

function Person({ p, stopName, edit, remove, moveStatus, waiting=false, position }) {
  return <div className="person"><div><b>{waiting ? `${position}. ${p.name}` : p.name}</b>{waiting && <small>{stopName(p.stop_id)}</small>}{p.note && <em>{p.note}</em>}</div><div className="actions noPrint"><button title="Bearbeiten" onClick={()=>edit(p)}><Edit size={15}/></button>{waiting ? <button onClick={()=>moveStatus(p,'confirmed')}>Übernehmen</button> : <button onClick={()=>moveStatus(p,'waiting')}>Warteliste</button>}<button title="Löschen" onClick={()=>remove(p.id)}><Trash2 size={15}/></button></div></div>
}

createRoot(document.getElementById('root')).render(<App />)
