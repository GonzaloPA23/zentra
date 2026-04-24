import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Eye,
  FileSpreadsheet,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import api, { getMensajeError } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import SortableFilterHeader from '../components/SortableFilterHeader';
import { formatSafeDate } from '../utils/date';
import { downloadBlobResponse, getBlobErrorMessage } from '../utils/download';

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
  q_almacen_destino: '',
  q_categoria: '',
  q_tipo_accion: '',
  q_sku: '',
  q_estado: '',
  q_registrado_por: '',
  q_nro_guia: '',
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

function DetalleExpandido({ row }) {
  return (
    <tr className="bg-blue-50/40">
      <td colSpan={10} className="px-4 py-4">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3 xl:grid-cols-6">
            <div>
              <span className="text-xs uppercase text-gray-500">Acción</span>
              <p className="font-medium text-gray-900">{row.accion || '-'}</p>
            </div>
            <div>
              <span className="text-xs uppercase text-gray-500">Zona</span>
              <p className="font-medium text-gray-900">{row.zona || '-'}</p>
            </div>
            <div>
              <span className="text-xs uppercase text-gray-500">Ciudad</span>
              <p className="font-medium text-gray-900">{row.ciudad_nombre || '-'}</p>
            </div>
            <div>
              <span className="text-xs uppercase text-gray-500">Personal receptor</span>
              <p className="font-medium text-gray-900">{row.personal_receptor_nombre || '-'}</p>
            </div>
            <div>
              <span className="text-xs uppercase text-gray-500">Indicador</span>
              <p className="font-medium text-gray-900">{row.indicador_nombre || '-'}</p>
            </div>
            <div>
              <span className="text-xs uppercase text-gray-500">Nro. guía</span>
              <p className="font-medium text-gray-900">{row.nro_guia || '-'}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h4 className="font-semibold text-gray-800">Líneas del registro</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tipo Mercadería</th>
                    <th>SKU</th>
                    <th>Lote</th>
                    <th>F. Vencimiento</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {(row.detalles || []).map((detail, index) => (
                    <tr key={`${row.id}-${detail.id || index}`}>
                      <td>{index + 1}</td>
                      <td>{detail.tipo_mercaderia_nombre || '-'}</td>
                      <td className="max-w-[280px] truncate" title={detail.sku_nombre || ''}>
                        {detail.sku_nombre || '-'}
                      </td>
                      <td>{detail.codigo_lote || '-'}</td>
                      <td>{formatSafeDate(detail.fecha_vencimiento)}</td>
                      <td>{Number(detail.cantidad || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <span className="text-xs uppercase text-gray-500">Observaciones</span>
              <p className="mt-1 rounded-lg bg-white p-3 text-sm text-gray-700">
                {row.observaciones || '-'}
              </p>
            </div>

            {row.foto_guia && (
              <div>
                <span className="text-xs uppercase text-gray-500">Foto guía</span>
                <div className="mt-1">
                  <a
                    href={`/uploads/${row.foto_guia}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary btn-sm inline-flex"
                  >
                    <Eye size={13} /> Ver archivo
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function RegistroRow({ row, expanded, onToggle, canEdit, canDelete, onDelete, onDownloadDetail }) {
  const navigate = useNavigate();

  return (
    <>
      <tr className="cursor-pointer" onClick={() => onToggle(row.id)}>
        <td className="whitespace-nowrap">{formatSafeDate(row.fecha)}</td>
        <td className="max-w-[180px] truncate" title={row.almacen_origen || ''}>{row.almacen_origen || '-'}</td>
        <td className="max-w-[180px] truncate" title={row.almacen_destino || ''}>{row.almacen_destino || '-'}</td>
        <td>{row.categoria_nombre || '-'}</td>
        <td><span className="badge-gray badge">{row.tipo_accion || '-'}</span></td>
        <td className="max-w-[260px] truncate" title={row.sku_resumen || ''}>{row.sku_resumen || '-'}</td>
        <td className="font-medium">{Number(row.cantidad_total || 0).toLocaleString()}</td>
        <td>
          <span className={ESTADOS[row.estado] || 'badge-gray'}>
            {LABELS[row.estado] || row.estado}
          </span>
        </td>
        <td className="text-xs text-gray-500">{row.registrado_por || '-'}</td>
        <td>
          <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="btn-icon text-gray-500"
              title="Descargar detalle"
              onClick={() => onDownloadDetail(row.id)}
            >
              <Download size={14} />
            </button>
            {canEdit && (
              <button
                type="button"
                className="btn-icon text-blue-500"
                title={row.estado === 'aprobado' ? 'Ver' : 'Editar'}
                onClick={() => navigate(`/registros/${row.id}/editar`)}
              >
                {row.estado === 'aprobado' ? <Eye size={14} /> : <Pencil size={14} />}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="btn-icon text-red-500"
                title="Eliminar"
                onClick={() => onDelete(row)}
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              type="button"
              className="btn-icon text-gray-400"
              title={expanded ? 'Ocultar detalle' : 'Ver detalle'}
              onClick={() => onToggle(row.id)}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && <DetalleExpandido row={row} />}
    </>
  );
}

export default function RegistrosPageV2() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [expandedId, setExpandedId] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const canCreate = hasRole('superadmin', 'admin', 'almacenero');
  const canEdit = hasRole('superadmin', 'admin');
  const canDelete = hasRole('superadmin', 'admin');
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

  const deleteMutation = useMutation({
    mutationFn: (registroId) => api.delete(`/registros/${registroId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registros'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['auditoria-registros'] });
      toast.success('Registro eliminado');
      setDeleting(null);
      setExpandedId(null);
    },
    onError: (error) => {
      toast.error(getMensajeError(error));
      setDeleting(null);
    },
  });

  const rows = Array.isArray(data?.datos) ? data.datos : [];
  const pagination = data?.paginacion ?? {};
  const sortConfig = { key: filters.sort_by, direction: filters.sort_dir };

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleSort = (key) => {
    setFilters((prev) => ({ ...prev, ...nextSortState(prev, key), page: 1 }));
  };

  const handleExport = async (endpoint, fallbackName) => {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });

      const response = await api.get(`${endpoint}?${params.toString()}`, {
        responseType: 'blob',
      });
      downloadBlobResponse(response, fallbackName);
    } catch (error) {
      toast.error(await getBlobErrorMessage(error));
    }
  };

  const handleDownloadDetail = async (registroId) => {
    try {
      const response = await api.get(`/registros/${registroId}/export/excel`, {
        responseType: 'blob',
      });
      downloadBlobResponse(response, `zentra_registro_${registroId}.xlsx`);
    } catch (error) {
      toast.error(await getBlobErrorMessage(error));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registros</h1>
          <p className="mt-1 text-sm text-gray-500">
            Una fila por guía, con detalle descargable y líneas expandibles.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canDownload && (
            <>
              <button
                type="button"
                onClick={() => handleExport('/registros/export/excel', `zentra_registros_${Date.now()}.xlsx`)}
                className="btn-secondary btn-sm"
              >
                <FileSpreadsheet size={14} /> Exportar Excel
              </button>
              <button
                type="button"
                onClick={() => handleExport('/registros/export/lotes/excel', `zentra_lotes_${Date.now()}.xlsx`)}
                className="btn-secondary btn-sm"
              >
                <Download size={14} /> Exportar lotes
              </button>
              <button
                type="button"
                onClick={() => handleExport('/registros/export/stock/excel', `zentra_stock_sku_lote_${Date.now()}.xlsx`)}
                className="btn-secondary btn-sm"
              >
                <FileSpreadsheet size={14} /> Reporte stock
              </button>
            </>
          )}
          {canCreate && (
            <button type="button" onClick={() => navigate('/registros/nuevo')} className="btn-primary btn-sm">
              <Plus size={14} /> Nuevo registro
            </button>
          )}
        </div>
      </div>

      <div className="card-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="label">Fecha inicio</label>
            <input
              type="date"
              className="input"
              value={filters.fecha_ini}
              onChange={(event) => updateFilter('fecha_ini', event.target.value)}
            />
          </div>
          <div>
            <label className="label">Fecha fin</label>
            <input
              type="date"
              className="input"
              value={filters.fecha_fin}
              onChange={(event) => updateFilter('fecha_fin', event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button type="button" className="btn-secondary w-full" onClick={() => setFilters(EMPTY_FILTERS)}>
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
                label="Almacén Destino"
                sortKey="almacen_destino"
                sortConfig={sortConfig}
                onSort={handleSort}
                filterValue={filters.q_almacen_destino}
                onFilterChange={(value) => updateFilter('q_almacen_destino', value)}
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
                label="SKU(s)"
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
                <td colSpan={10} className="py-12 text-center text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-400 border-t-transparent" />
                    Cargando registros...
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-gray-400">
                  No hay registros para mostrar.
                </td>
              </tr>
            ) : rows.map((row) => (
              <RegistroRow
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                onToggle={(registroId) => setExpandedId((prev) => prev === registroId ? null : registroId)}
                canEdit={canEdit}
                canDelete={canDelete && (row.estado !== 'aprobado' || hasRole('superadmin'))}
                onDelete={setDeleting}
                onDownloadDetail={handleDownloadDetail}
              />
            ))}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            {pagination.total} registros totales
            {isFetching && !isLoading ? ' · Actualizando...' : ''}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-icon"
              disabled={filters.page <= 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3">Pág. {filters.page} / {pagination.pages}</span>
            <button
              type="button"
              className="btn-icon"
              disabled={filters.page >= pagination.pages}
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
        onConfirm={() => deleteMutation.mutate(deleting?.id)}
        loading={deleteMutation.isPending}
        title="Eliminar registro"
        message={`¿Eliminar el registro "${deleting?.nro_guia || deleting?.sku_resumen || ''}"? Esta acción no se puede deshacer.`}
      />
    </div>
  );
}
