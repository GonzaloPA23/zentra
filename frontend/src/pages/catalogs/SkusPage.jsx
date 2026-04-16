import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import GenericCatalogPage from '../../components/GenericCatalogPage';
import api from '../../utils/api';
import { Loader2 } from 'lucide-react';

function SkuForm({ defaults, onSubmit, onCancel, loading }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({ defaultValues: defaults || { zona: 'LIMA' } });
  const catId = watch('categoria_id');

  const { data: categorias } = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api.get('/catalogos/categorias').then(r => r.data.datos),
  });
  const { data: tiposMerc } = useQuery({
    queryKey: ['tipos-merc', catId],
    queryFn: () => api.get(`/catalogos/tipos-mercaderia?categoria_id=${catId}`).then(r => r.data.datos),
    enabled: !!catId,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="modal-body space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Nombre <span className="text-red-500">*</span></label>
            <input className={`input ${errors.nombre ? 'input-error' : ''}`}
              {...register('nombre', { required: 'Requerido' })} />
            {errors.nombre && <p className="error-msg">{errors.nombre.message}</p>}
          </div>
          <div>
            <label className="label">Código</label>
            <input className="input" placeholder="Código interno (opcional)"
              {...register('codigo')} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Categoría <span className="text-red-500">*</span></label>
            <select className={`input ${errors.categoria_id ? 'input-error' : ''}`}
              {...register('categoria_id', { required: 'Requerido' })}>
              <option value="">Seleccionar...</option>
              {(categorias ?? []).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {errors.categoria_id && <p className="error-msg">{errors.categoria_id.message}</p>}
          </div>
          <div>
            <label className="label">Tipo Mercadería</label>
            <select className="input" {...register('tipo_mercaderia_id')} disabled={!catId}>
              <option value="">Sin tipo</option>
              {(tiposMerc ?? []).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Zona</label>
            <select className="input" {...register('zona')}>
              <option value="LIMA">LIMA</option>
              <option value="PROVINCIA">PROVINCIA</option>
            </select>
          </div>
          <div>
            <label className="label">Unidad</label>
            <input className="input" placeholder="Ej: unidad, kg, caja..."
              {...register('unidad')} />
          </div>
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('tiene_lote')} defaultChecked={defaults?.tiene_lote} />
            Maneja lotes
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('tiene_vencimiento')} defaultChecked={defaults?.tiene_vencimiento} />
            Tiene fecha de vencimiento
          </label>
          {defaults?.id && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register('activo')} defaultChecked={defaults?.activo} />
              Activo
            </label>
          )}
        </div>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

export default function SkusPage() {
  return (
    <GenericCatalogPage
      title="SKUs"
      subtitle="Catálogo de productos/materiales por categoría"
      endpoint="/catalogos/skus"
      queryKey={['skus']}
      columns={[
        { header: '#', accessor: 'id', width: 60 },
        { header: 'Nombre', accessor: 'nombre', searchable: true },
        { header: 'Código', accessor: 'codigo', render: r => r.codigo || '—' },
        { header: 'Categoría', accessor: 'categoria_nombre', searchable: true },
        { header: 'Tipo Merc.', accessor: 'tipo_mercaderia_nombre', render: r => r.tipo_mercaderia_nombre || '—' },
        { header: 'Zona', accessor: 'zona', render: r => <span className="badge-gray badge">{r.zona}</span> },
        { header: 'Lote', render: r => r.tiene_lote ? '✓' : '—', width: 60 },
        { header: 'Venc.', render: r => r.tiene_vencimiento ? '✓' : '—', width: 60 },
      ]}
      FormComponent={SkuForm}
    />
  );
}
