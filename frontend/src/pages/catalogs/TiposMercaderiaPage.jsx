import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import GenericCatalogPage from '../../components/GenericCatalogPage';
import api from '../../utils/api';
import { Loader2 } from 'lucide-react';

function TipoMercaderiaForm({ defaults, onSubmit, onCancel, loading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ defaultValues: defaults || {} });

  const { data: categorias } = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api.get('/catalogos/categorias').then(r => r.data.datos),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="modal-body space-y-4">
        <div>
          <label className="label">Categoría <span className="text-red-500">*</span></label>
          <select className={`input ${errors.categoria_id ? 'input-error' : ''}`}
            {...register('categoria_id', { required: 'Requerido' })}>
            <option value="">Seleccionar categoría...</option>
            {(categorias ?? []).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          {errors.categoria_id && <p className="error-msg">{errors.categoria_id.message}</p>}
        </div>
        <div>
          <label className="label">Nombre <span className="text-red-500">*</span></label>
          <input className={`input ${errors.nombre ? 'input-error' : ''}`}
            placeholder="Ej: ACTIVOS, CANJES, MERCADERISMO..."
            {...register('nombre', { required: 'Requerido' })} />
          {errors.nombre && <p className="error-msg">{errors.nombre.message}</p>}
        </div>
        {defaults?.id && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('activo')} defaultChecked={defaults?.activo} />
            Activo
          </label>
        )}
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

export default function TiposMercaderiaPage() {
  return (
    <GenericCatalogPage
      title="Tipos de Mercadería"
      subtitle="Tipos asociados a cada categoría (ACTIVOS, CANJES, MERCARISMO, etc.)"
      endpoint="/catalogos/tipos-mercaderia"
      queryKey={['tipos-mercaderia']}
      columns={[
        { header: '#', accessor: 'id', width: 60 },
        { header: 'Categoría', accessor: 'categoria_nombre', searchable: true },
        { header: 'Nombre', accessor: 'nombre', searchable: true },
      ]}
      FormComponent={TipoMercaderiaForm}
    />
  );
}
