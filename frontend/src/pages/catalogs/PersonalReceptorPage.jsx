// PersonalReceptorPage.jsx
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import GenericCatalogPage from '../../components/GenericCatalogPage';
import api from '../../utils/api';

function PersonalForm({ defaults, onSubmit, onCancel, loading }) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      nombre: defaults?.nombre || '',
      cargo: defaults?.cargo || '',
      almacen_id: defaults?.almacen_id || '',
      categoria_id: defaults?.categoria_id || '',
      activo: defaults?.activo ?? true,
    },
  });

  const { data: almacenes = [] } = useQuery({
    queryKey: ['almacenes'],
    queryFn: () => api.get('/catalogos/almacenes').then(r => r.data.datos),
  });
  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api.get('/catalogos/categorias').then(r => r.data.datos),
  });

  const almacenId = watch('almacen_id');
  const almacenSeleccionado = almacenes.find(a => String(a.id) === String(almacenId));

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="modal-body space-y-4">
        <div>
          <label className="label">Nombre completo <span className="text-red-500">*</span></label>
          <input className={`input ${errors.nombre ? 'input-error' : ''}`}
            {...register('nombre', { required: 'Requerido' })} />
          {errors.nombre && <p className="error-msg">{errors.nombre.message}</p>}
        </div>
        <div>
          <label className="label">Cargo</label>
          <input className="input" placeholder="Ej: Almacenero, Supervisor..."
            {...register('cargo')} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Almacen / Ciudad <span className="text-red-500">*</span></label>
            <select
              className={`input ${errors.almacen_id ? 'input-error' : ''}`}
              {...register('almacen_id', { required: 'Requerido' })}
            >
              <option value="">Seleccionar almacen...</option>
              {almacenes.map(a => (
                <option key={a.id} value={a.id}>
                  {a.nombre} - {a.ciudad_nombre}
                </option>
              ))}
            </select>
            {errors.almacen_id && <p className="error-msg">{errors.almacen_id.message}</p>}
            {almacenSeleccionado && (
              <p className="text-xs text-gray-400 mt-1">
                Ciudad asociada: {almacenSeleccionado.ciudad_nombre}
              </p>
            )}
          </div>
          <div>
            <label className="label">Categoria <span className="text-red-500">*</span></label>
            <select
              className={`input ${errors.categoria_id ? 'input-error' : ''}`}
              {...register('categoria_id', { required: 'Requerido' })}
            >
              <option value="">Seleccionar categoria...</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            {errors.categoria_id && <p className="error-msg">{errors.categoria_id.message}</p>}
          </div>
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

export default function PersonalReceptorPage() {
  return (
    <GenericCatalogPage
      title="Personal Receptor"
      subtitle="Personas que pueden recibir mercadería"
      endpoint="/catalogos/personal-receptor"
      queryKey={['personal-receptor']}
      columns={[
        { header: '#', accessor: 'id', width: 60 },
        { header: 'Nombre', accessor: 'nombre', searchable: true },
        { header: 'Almacen', accessor: 'almacen_nombre', searchable: true, render: r => r.almacen_nombre || '-' },
        { header: 'Ciudad', accessor: 'ciudad_nombre', searchable: true, render: r => r.ciudad_nombre || '-' },
        { header: 'Categoria', accessor: 'categoria_nombre', searchable: true, render: r => r.categoria_nombre || '-' },
        { header: 'Cargo', accessor: 'cargo', render: r => r.cargo || '—' },
      ]}
      FormComponent={PersonalForm}
    />
  );
}
