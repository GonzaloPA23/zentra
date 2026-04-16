// PersonalReceptorPage.jsx
import { useForm } from 'react-hook-form';
import GenericCatalogPage from '../../components/GenericCatalogPage';
import { Loader2 } from 'lucide-react';

function PersonalForm({ defaults, onSubmit, onCancel, loading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ defaultValues: defaults || {} });
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
        { header: 'Cargo', accessor: 'cargo', render: r => r.cargo || '—' },
      ]}
      FormComponent={PersonalForm}
    />
  );
}
