import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { formatCurrency } from '../lib/seedStudio';
import type { ServiceCategory } from '../types/spa';

const CATEGORIES: ('All' | ServiceCategory)[] = [
  'All',
  'Massage',
  'Facial',
  'Body Ritual',
  'Hydrotherapy',
  'Add-On',
];

export function ServicesView() {
  const { services, createService, toggleServiceActive } = useStudio();
  const [categoryFilter, setCategoryFilter] = useState<'All' | ServiceCategory>('All');
  const [showAddModal, setShowAddModal] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('Massage');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [bufferMinutes, setBufferMinutes] = useState(15);
  const [price, setPrice] = useState(145);
  const [roomType, setRoomType] = useState('Standard Suite');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredServices = useMemo(
    () =>
      services.filter((s) => categoryFilter === 'All' || s.category === categoryFilter),
    [services, categoryFilter],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createService({
        name,
        category,
        durationMinutes: Number(durationMinutes),
        bufferMinutes: Number(bufferMinutes),
        price: Number(price),
        roomType,
        description,
      });
      setName('');
      setDescription('');
      setShowAddModal(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Treatment Menu &amp; Suite Catalog
          </h2>
          <p className="text-sm text-slate-500">
            Configure massage durations, room turnaround buffers, pricing, and online booking visibility.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Treatment</span>
        </button>
      </div>

      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit overflow-x-auto max-w-full">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              categoryFilter === cat
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Treatment</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Suite Type</th>
                <th className="py-3 px-4 text-right">Duration · Buffer</th>
                <th className="py-3 px-4 text-right">Price</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredServices.map((svc) => (
                <tr key={svc.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 max-w-md">
                    <p className="font-medium text-slate-900">{svc.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{svc.description}</p>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                    {svc.category}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                    {svc.roomType}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                    {svc.durationMinutes}m · +{svc.bufferMinutes}m
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                    {formatCurrency(svc.price)}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleServiceActive(svc.id, !svc.active)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border cursor-pointer ${
                        svc.active
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {svc.active ? 'Published' : 'Archived'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">Add Treatment</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Treatment Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Prenatal Restorative Massage"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Massage">Massage</option>
                    <option value="Facial">Facial</option>
                    <option value="Body Ritual">Body Ritual</option>
                    <option value="Hydrotherapy">Hydrotherapy</option>
                    <option value="Add-On">Add-On</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Suite Type</label>
                  <input
                    type="text"
                    required
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Minutes</label>
                  <input
                    type="number"
                    min={15}
                    max={240}
                    required
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Buffer (m)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    required
                    value={bufferMinutes}
                    onChange={(e) => setBufferMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Price ($)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Publish Treatment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
