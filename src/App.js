import React, { useEffect, useState, useMemo } from 'react';

const API_BASE = 'https://jsonplaceholder.typicode.com/users';

function useFetchUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch(API_BASE)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!mounted) return;
        // Normalize: split name into first/last, set department
        const normalized = data.map((u) => {
          const [first = '', ...rest] = (u.name || '').split(' ');
          const last = rest.join(' ');
          return {
            id: u.id,
            firstName: first,
            lastName: last,
            email: u.email || '',
            department: u.company?.name ?? 'General',
          };
        });
        setUsers(normalized);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || 'Failed to fetch');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => (mounted = false);
  }, []);

  return { users, setUsers, loading, error };
}

function validateEmail(email) {
  // Simple RFC-ish check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function App() {
  const { users, setUsers, loading, error } = useFetchUsers();

  // UI state
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterValues, setFilterValues] = useState({ firstName: '', lastName: '', email: '', department: '' });
  const [sortBy, setSortBy] = useState({ column: 'id', dir: 'asc' });

  // Modal / form state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null => add
  const [formState, setFormState] = useState({ firstName: '', lastName: '', email: '', department: '' });
  const [formErrors, setFormErrors] = useState({});
  const [apiMessage, setApiMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  // Derived: filtered & sorted users
  const processed = useMemo(() => {
    let list = [...users];

    // Global search (checks first/last/email/department)
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((u) =>
        [u.firstName, u.lastName, u.email, u.department].join(' ').toLowerCase().includes(q)
      );
    }

    // Filters
    if (filterValues.firstName) {
      list = list.filter((u) => u.firstName.toLowerCase().includes(filterValues.firstName.toLowerCase()));
    }
    if (filterValues.lastName) {
      list = list.filter((u) => u.lastName.toLowerCase().includes(filterValues.lastName.toLowerCase()));
    }
    if (filterValues.email) {
      list = list.filter((u) => u.email.toLowerCase().includes(filterValues.email.toLowerCase()));
    }
    if (filterValues.department) {
      list = list.filter((u) => u.department.toLowerCase().includes(filterValues.department.toLowerCase()));
    }

    // Sorting
    list.sort((a, b) => {
      const col = sortBy.column;
      if(col === 'id') {
        const av = Number(a[col] ?? 0);
        const bv = Number(b[col] ?? 0);
        if (av < bv) return sortBy.dir === 'asc' ? -1 : 1;
        if (av > bv) return sortBy.dir === 'asc' ? 1 : -1;
        return 0;
      }
      const av = (a[col] ?? '').toString().toLowerCase();
      const bv = (b[col] ?? '').toString().toLowerCase();
      if (av < bv) return sortBy.dir === 'asc' ? -1 : 1;
      if (av > bv) return sortBy.dir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [users, query, filterValues, sortBy]);

  // Pagination
  const total = processed.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages]);
  const paged = useMemo(() => processed.slice((page - 1) * perPage, page * perPage), [processed, page, perPage]);

  // Handlers
  function openAdd() {
    setEditingUser(null);
    setFormState({ firstName: '', lastName: '', email: '', department: '' });
    setFormErrors({});
    setModalOpen(true);
  }

  function openEdit(user) {
    setEditingUser(user);
    setFormState({ firstName: user.firstName, lastName: user.lastName, email: user.email, department: user.department });
    setFormErrors({});
    setModalOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
    setEditingUser(null);
    setFormErrors({});
  }

  function validateForm() {
    const errs = {};
    if (!formState.firstName.trim()) errs.firstName = 'First name is required';
    if (!formState.lastName.trim()) errs.lastName = 'Last name is required';
    if (!formState.email.trim()) errs.email = 'Email is required';
    else if (!validateEmail(formState.email)) errs.email = 'Email is invalid';
    if (!formState.department.trim()) errs.department = 'Department is required';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submitForm(e) {
    e && e.preventDefault();
    if (!validateForm()) return;
    setBusy(true);
    setApiMessage(null);
    try {
      if (editingUser) {
        // PUT
        const res = await fetch(`${API_BASE}/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...editingUser, ...formState }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const updated = await res.json();
        // Update local list (JSONPlaceholder returns the object back)
        setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? { ...u, ...formState } : u)));
        setApiMessage('User updated (simulated)');
      } else {
        // POST
        const res = await fetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formState),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const created = await res.json();
        // JSONPlaceholder responds with an id; append to local list
        const newId = created.id ?? Date.now();
        setUsers((prev) => [{ id: newId, ...formState }, ...prev]);
        setApiMessage('User added (simulated)');
      }
      closeModal();
    } catch (err) {
      setApiMessage(`API error: ${err.message}`);
    } finally {
      setBusy(false);
      setTimeout(() => {
        setApiMessage(null);
      }, 3000);
    }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Delete user ${user.firstName} ${user.lastName}?`)) return;
    setBusy(true);
    setApiMessage(null);
    try {
      const res = await fetch(`${API_BASE}/${user.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 200 && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setApiMessage('User deleted (simulated)');
    } catch (err) {
      setApiMessage(`API error: ${err.message}`);
    } finally {
      setBusy(false);
      setTimeout(() => {
        setApiMessage(null);
      }, 3000);
    }
  }

  function toggleSort(column) {
    setSortBy((s) => {
      if (s.column === column) return { column, dir: s.dir === 'asc' ? 'desc' : 'asc' };
      return { column, dir: 'asc' };
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">User Management Dashboard</h1>
          <div className="flex items-center gap-2">
            <button onClick={openAdd} className="px-3 py-2 rounded bg-indigo-600 text-white">Add User</button>
          </div>
        </header>

        <section className="bg-white shadow rounded p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                className="border rounded px-3 py-2 w-full sm:w-64"
                placeholder="Search users..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button onClick={() => setFiltersOpen((s) => !s)} className="px-3 py-2 border rounded">Filters</button>
              <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="border rounded px-2 py-2">
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="text-sm text-gray-600">{loading ? 'Loading...' : `${total} user(s)`}</div>
          </div>

          {filtersOpen && (
            <div className="mb-4 p-3 border rounded bg-gray-50">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input placeholder="First name" value={filterValues.firstName} onChange={(e)=>setFilterValues(v=>({...v, firstName: e.target.value}))} className="border rounded px-2 py-1"/>
                <input placeholder="Last name" value={filterValues.lastName} onChange={(e)=>setFilterValues(v=>({...v, lastName: e.target.value}))} className="border rounded px-2 py-1"/>
                <input placeholder="Email" value={filterValues.email} onChange={(e)=>setFilterValues(v=>({...v, email: e.target.value}))} className="border rounded px-2 py-1"/>
                <input placeholder="Department" value={filterValues.department} onChange={(e)=>setFilterValues(v=>({...v, department: e.target.value}))} className="border rounded px-2 py-1"/>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={()=>{setFilterValues({firstName:'', lastName:'', email:'', department:''});}} className="px-3 py-1 border rounded">Clear</button>
                <button onClick={()=>setFiltersOpen(false)} className="px-3 py-1 border rounded">Close</button>
              </div>
            </div>
          )}

          {error && <div className="p-2 mb-2 text-red-700">Error: {error}</div>}
          {apiMessage && <div className="p-2 mb-2 text-green-700">{apiMessage}</div>}

          <div className="overflow-x-auto">
            <table className="w-full table-auto border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="p-2 border-b" onClick={()=>toggleSort('id')}>ID {sortBy.column==='id'?(sortBy.dir==='asc'?'↑':'↓'):''}</th>
                  <th className="p-2 border-b" onClick={()=>toggleSort('firstName')}>First Name {sortBy.column==='firstName'?(sortBy.dir==='asc'?'↑':'↓'):''}</th>
                  <th className="p-2 border-b" onClick={()=>toggleSort('lastName')}>Last Name {sortBy.column==='lastName'?(sortBy.dir==='asc'?'↑':'↓'):''}</th>
                  <th className="p-2 border-b" onClick={()=>toggleSort('email')}>Email {sortBy.column==='email'?(sortBy.dir==='asc'?'↑':'↓'):''}</th>
                  <th className="p-2 border-b" onClick={()=>toggleSort('department')}>Department {sortBy.column==='department'?(sortBy.dir==='asc'?'↑':'↓'):''}</th>
                  <th className="p-2 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="p-2 border-b">{u.id}</td>
                    <td className="p-2 border-b">{u.firstName}</td>
                    <td className="p-2 border-b">{u.lastName}</td>
                    <td className="p-2 border-b">{u.email}</td>
                    <td className="p-2 border-b">{u.department}</td>
                    <td className="p-2 border-b">
                      <div className="flex gap-2">
                        <button onClick={()=>openEdit(u)} className="px-2 py-1 border rounded">Edit</button>
                        <button onClick={()=>deleteUser(u)} className="px-2 py-1 border rounded">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">Page {page} of {totalPages}</div>
            <div className="flex items-center gap-2">
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="px-2 py-1 border rounded">Prev</button>
              <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="px-2 py-1 border rounded">Next</button>
            </div>
          </div>
        </section>

        {/* Modal */}
        {modalOpen && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
            <div className="bg-white rounded shadow-lg w-full max-w-lg p-4">
              <h2 className="text-lg font-semibold mb-2">{editingUser ? 'Edit User' : 'Add User'}</h2>
              <form onSubmit={submitForm}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm">First Name</label>
                    <input className="border rounded px-2 py-1 w-full" value={formState.firstName} onChange={(e)=>setFormState(s=>({...s, firstName: e.target.value}))} />
                    {formErrors.firstName && <div className="text-red-600 text-sm">{formErrors.firstName}</div>}
                  </div>
                  <div>
                    <label className="block text-sm">Last Name</label>
                    <input className="border rounded px-2 py-1 w-full" value={formState.lastName} onChange={(e)=>setFormState(s=>({...s, lastName: e.target.value}))} />
                    {formErrors.lastName && <div className="text-red-600 text-sm">{formErrors.lastName}</div>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm">Email</label>
                    <input className="border rounded px-2 py-1 w-full" value={formState.email} onChange={(e)=>setFormState(s=>({...s, email: e.target.value}))} />
                    {formErrors.email && <div className="text-red-600 text-sm">{formErrors.email}</div>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm">Department</label>
                    <input className="border rounded px-2 py-1 w-full" value={formState.department} onChange={(e)=>setFormState(s=>({...s, department: e.target.value}))} />
                    {formErrors.department && <div className="text-red-600 text-sm">{formErrors.department}</div>}
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={closeModal} className="px-3 py-1 border rounded">Cancel</button>
                  <button type="submit" disabled={busy} className="px-3 py-1 bg-indigo-600 text-white rounded">{busy ? 'Saving...' : 'Save'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
