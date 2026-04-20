import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Eye, FileSpreadsheet, Pencil, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import api, { getMensajeError } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import SortableFilterHeader from '../components/SortableFilterHeader';
import { downloadBlobResponse } from '../utils/download';
import { formatSafeDate } from '../utils/date';

const ESTADOS = {
  pendiente: 'badge-yellow',
  en_transito: 'badge-blue',
  aprobado: 'badge-green',
  rechazado: 'badge-red',
};

const LABELS = {
  pendiente: 'Pendiente',
  en_transito: 'En tránsito',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
};

const EMPTY_FILTERS = {
  fecha_ini: '',
  fecha_fin: '',
  q_almacen_origen: '',
  q_categoria: '',
  q_tipo_accion: '',
  q_sku: '',
  q_estado: '',
  q_registrado_por: '',
  sort_by: 'fecha',
  sort_dir: 'desc',
  page: 1,
};

function nextSortState(current, key) {
  if (current.sort_by === key) {
    return { sort_by: key, sort_dir: current.sort_dir === 'asc' ? 'desc' : 'asc' };
  }

  return { sort_by: key, sort_dir: key === 'fecha' ? 'desc' : 'asc' };
}

export default function RegistrosPageV2() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [deleting, setDeleting] = useState(null);

  const canCreate = hasRole('superadmin', 'admin', 'almacenero');
  const canEdit = hasRole('superadmin', 'admin');
  const canDownload = hasRole('superadmin', 'admin', 'supervisor');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['registros', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      return api.get(`/registros?${params.toString()}`).then((response) => response.data);
    },
  });

  const mutDel = useMutation({
    mutationFn: (id) => api.delete(`/registros/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registros'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['auditoria-registros'] });
      toast.success('Registro eliminado');
      setDeleting(null);
    },
    onError: (error) => {
      toast.error(getMensajeError(error));
      setDeleting(null);
    },
  });

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleSort = (key) => {
    setFilters((prev) => ({ ...prev, ...nextSortState(prev, key), page: 1 }));
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });

      const response = await api.get(`/registros/export/excel?${params.toString()}`, {
        responseType: 'blob',
      });

      downloadBlobResponse(response, `zentra_registros_${Date.now()}.xlsx`);
    } catch (error) {
      toast.error(getMensajeError(error));
    }
  };

  const rows = Array.isArray(data?.datos) ? data.datos : [];
  const pag = data?.paginacion ?? {};
  const sortConfig = { key: filters.sort_by, direction: filters.sort_dir };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registros</h1>
          <p className="text-sm text-gray-500 mt-1">Módulo 1 · Gestión de movimientos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canDownload && (
            <button onClick={handleExport} className="btn-secondary btn-sm">
              <FileSpreadsheet size={14} /> Exportar Excel
            </button>
          )}
          {canCreate && (
            <button onClick={() => navigate('/registros/nuevo')} className="btn-primary btn-sm">
              <Plus size={14} /> Nuevo Registro
            </button>
          )}
        </div>
      </div>

      <div className="card-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Fecha inicio</label>
            <input
              type="date"
              className="input"
              value={filters.fecha_ini}
              onChange={(e) => updateFilter('fecha_ini', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Fecha fin</label>
            <input
              type="date"
              className="input"
              value={filters.fecha_fin}
              onChange={(e) => updateFilter('fecha_fin', e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button className="btn-secondary w-full" onClick={() => setFilters(EMPTY_FILTERS)}>
              Limpiar filtros
            </button>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <SortableFilterHeader
                label="Fecha"
                sortKey="fecha"
                sortConfig={sortConfig}
                onSort={handleSort}
                filterType="none"
              />
              <SortableFilterHeader
                label="Almacén Origen"
                sortKey="almacen_origen"
                sortConfig={sortConfig}
                onSort={handleSort}
                filterValue={filters.q_almacen_origen}
                onFilterChange={(value) => updateFilter('q_almacen_origen', value)}
              />
              <SortableFilterHeader
                label="Categoría"
                sortKey="categoria"
                sortConfig={sortConfig}
                onSort={handleSort}
                filterValue={filters.q_categoria}
                onFilterChange={(value) => updateFilter('q_categoria', value)}
              />
              <SortableFilterHeader
                label="Tipo Acción"
                sortKey="tipo_accion"
                sortConfig={sortConfig}
                onSort={handleSort}
                filterValue={filters.q_tipo_accion}
                onFilterChange={(value) => updateFilter('q_tipo_accion', value)}
              />
              <SortableFilterHeader
                label="SKU"
                sortKey="sku"
                sortConfig={sortConfig}
                onSort={handleSort}
                filterValue={filters.q_sku}
                onFilterChange={(value) => updateFilter('q_sku', value)}
              />
              <SortableFilterHeader
                label="Cantidad"
                sortKey="cantidad"
                sortConfig={sortConfig}
                onSort={handleSort}
                filterType="none"
              />
              <SortableFilterHeader
                label="Estado"
                sortKey="estado"
                sortConfig={sortConfig}
                onSort={handleSort}
                filterValue={filters.q_estado}
                onFilterChange={(value) => updateFilter('q_estado', value)}
                placeholder="Todos"
                options={[
                  { value: 'pendiente', label: 'Pendiente' },
                  { value: 'en_transito', label: 'En tránsito' },
                  { value: 'aprobado', label: 'Aprobado' },
                  { value: 'rechazado', label: 'Rechazado' },
                ]}
              />
              <SortableFilterHeader
                label="Registrado por"
                sortKey="registrado_por"
                sortConfig={sortConfig}
                onSort={handleSort}
                filterValue={filters.q_registrado_por}
                onFilterChange={(value) => updateFilter('q_registrado_por', value)}
              />
              <SortableFilterHeader label="Acciones" filterType="none" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                    Cargando registros...
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400">
                  No hay registros para mostrar.
                </td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap">
                  {formatSafeDate(row.fecha)}
                </td>
                <td className="max-w-[180px] truncate" title={row.almacen_origen}>
                  {row.almacen_origen}
                </td>
                <td>{row.categoria_nombre}</td>
                <td>
                  <span className="badge-gray badge">{row.tipo_accion}</span>
                </td>
                <td className="max-w-[220px] truncate" title={row.sku_nombre}>
                  {row.sku_nombre}
                </td>
                <td className="font-medium">{Number(row.cantidad || 0).toLocaleString()}</td>
                <td>
                  <span className={ESTADOS[row.estado] || 'badge-gray'}>
                    {LABELS[row.estado] || row.estado}
                  </span>
                </td>
                <td className="text-xs text-gray-500">{row.registrado_por}</td>
                <td>
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <button
                        title={row.estado === 'aprobado' ? 'Ver registro aprobado' : 'Editar'}
                        className="btn-icon text-blue-500"
                        onClick={() => navigate(`/registros/${row.id}/editar`)}
                      >
                        {row.estado === 'aprobado' ? <Eye size={14} /> : <Pencil size={14} />}
                      </button>
                    )}
                    {hasRole('superadmin', 'admin') && (row.estado !== 'aprobado' || hasRole('superadmin')) && (
                      <button
                        title="Eliminar"
                        className="btn-icon text-red-500"
                        onClick={() => setDeleting(row)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pag.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{pag.total} registros totales {isFetching && !isLoading ? '· Actualizando...' : ''}</span>
          <div className="flex items-center gap-1">
            <button
              className="btn-icon"
              disabled={filters.page <= 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3">Pág. {filters.page} / {pag.pages}</span>
            <button
              className="btn-icon"
              disabled={filters.page >= pag.pages}
              onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => mutDel.mutate(deleting?.id)}
        loading={mutDel.isPending}
        title="Eliminar Registro"
        message={`¿Eliminar el registro de "${deleting?.sku_nombre}"? Esta acción no se puede deshacer.`}
      />
    </div>
  );
}
