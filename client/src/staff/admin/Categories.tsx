import { useEffect, useState, type FormEvent } from 'react';
import { StaffLayout } from '../StaffLayout';
import { FormError, TextField } from '../../components/Field';
import { api, ApiError } from '../../lib/api';
import { AdminNote } from './Users';

interface C { id: number; name: string; active: boolean }
const msg = (e: unknown) => (e instanceof ApiError && !e.message.startsWith('errors.') ? e.message : 'Something went wrong. Please try again.');

// Report types. Hidden instead of deleted, because past reports still use them.
export default function Categories() {
  const [cats, setCats] = useState<C[]>([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState('');
  const load = () => api<C[]>('/admin/categories').then(setCats).catch((e) => setError(msg(e)));
  useEffect(() => { load(); }, []);
  const run = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); await load(); } catch (e) { setError(msg(e)); } };
  const add = (e: FormEvent) => { e.preventDefault(); run(async () => { await api('/admin/categories', { body: { name } }); setName(''); }); };

  return (
    <StaffLayout>
      <div className="flex max-w-4xl flex-col gap-6">
        <div><h1 className="text-[1.75rem] font-extrabold">Categories</h1><p className="text-muted">The types of concern reporters can choose. Hidden types stay on old reports.</p></div>
        <AdminNote />
        <FormError message={error} />
        <ul className="card flex flex-col !p-0">
          {cats.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 last:border-0">
              {editing?.id === c.id ? (
                <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api(`/admin/categories/${c.id}`, { method: 'PATCH', body: { name: editing.name } }); setEditing(null); }); }}>
                  <label className="sr-only" htmlFor={`c${c.id}`}>Name</label>
                  <input id={`c${c.id}`} className="input !min-h-11" value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} autoFocus />
                  <button className="btn btn-primary btn-sm">Save</button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <span className="flex items-center gap-3"><b className={c.active ? '' : 'text-muted line-through'}>{c.name}</b>{!c.active && <span className="badge badge-rev">Hidden</span>}</span>
                  <span className="flex gap-2">
                    <button type="button" className="btn btn-quiet btn-sm !min-h-9" onClick={() => setEditing({ id: c.id, name: c.name })}>Rename</button>
                    <button type="button" className="btn btn-quiet btn-sm !min-h-9" onClick={() => run(() => api(`/admin/categories/${c.id}`, { method: 'PATCH', body: { active: !c.active } }))}>{c.active ? 'Hide' : 'Show again'}</button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={add} noValidate className="card flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1"><TextField label="New category" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <button className="btn btn-primary" disabled={!name.trim()}>Add</button>
        </form>
      </div>
    </StaffLayout>
  );
}
