import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  ErrorBox,
  Field,
  Modal,
  Spinner,
  useTitle,
  useToast,
} from '@equipment-hire/client/ui';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import PageHeader from '../../components/PageHeader.jsx';

function CategoryDialog({ category, all, onClose }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    parentId: category?.parentId ?? null,
    sortOrder: category?.sortOrder ?? 0,
    isActive: category?.isActive ?? true,
  });
  const [errors, setErrors] = useState({});
  const m = useMutation({
    mutationFn: () => {
      const body = { ...v, slug: v.slug || undefined, description: v.description || null };
      return category
        ? api.put(`/admin/categories/${category.id}`, body)
        : api.post('/admin/categories', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
      qc.invalidateQueries({ queryKey: ['site'] });
      toast('Category saved');
      onClose();
    },
    onError: (e) => setErrors(e.fieldErrors ?? {}),
  });
  return (
    <Modal
      title={category ? `Edit ${category.name}` : 'New category'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => m.mutate()}
            disabled={m.isPending || !v.name}
          >
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Name" error={errors.name} required>
          <input
            className="input"
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
        </Field>
        <Field label="Web address" hint="Leave blank to generate" error={errors.slug}>
          <input
            className="input"
            value={v.slug}
            onChange={(e) => setV({ ...v, slug: e.target.value })}
          />
        </Field>
        <Field label="Description">
          <textarea
            className="input"
            value={v.description}
            onChange={(e) => setV({ ...v, description: e.target.value })}
          />
        </Field>
        <div className="grid-2">
          <Field label="Parent category">
            <select
              className="input"
              value={v.parentId ?? ''}
              onChange={(e) => setV({ ...v, parentId: e.target.value || null })}
            >
              <option value="">None (top level)</option>
              {all
                .filter((c) => c.id !== category?.id && !c.parentId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Sort order">
            <input
              className="input"
              type="number"
              min={0}
              value={v.sortOrder}
              onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value) || 0 })}
            />
          </Field>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={v.isActive}
            onChange={(e) => setV({ ...v, isActive: e.target.checked })}
          />
          <span>Show on the website</span>
        </label>
        <ErrorBox error={m.error} />
      </div>
    </Modal>
  );
}

export default function Categories() {
  useTitle('Categories', 'Admin');
  const { can } = useAuth();
  const [editing, setEditing] = useState(null);
  const q = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get('/admin/categories'),
  });
  if (q.isPending) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const all = q.data;
  const ordered = all
    .filter((c) => !c.parentId)
    .flatMap((p) => [p, ...all.filter((c) => c.parentId === p.id)]);
  const orphans = all.filter((c) => c.parentId && !all.some((p) => p.id === c.parentId));

  return (
    <>
      <PageHeader title="Categories">
        {can('category.manage') && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            New category
          </button>
        )}
      </PageHeader>
      <div className="card card-flush">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Web address</th>
              <th>Items</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...ordered, ...orphans].map((c) => (
              <tr key={c.id}>
                <td style={{ paddingLeft: c.parentId ? '2rem' : undefined }}>
                  <strong>{c.name}</strong>
                  {c.description && <div className="subtle">{c.description}</div>}
                </td>
                <td className="mono">/{c.slug}</td>
                <td>{c.equipmentCount}</td>
                <td>
                  {c.isActive ? <Badge tone="success">Visible</Badge> : <Badge>Hidden</Badge>}
                </td>
                <td className="right">
                  {can('category.manage') && (
                    <button className="btn btn-sm" onClick={() => setEditing(c)}>
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <CategoryDialog
          category={editing === 'new' ? null : editing}
          all={all}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
