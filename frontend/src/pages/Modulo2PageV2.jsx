import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Eye,
  FileSpreadsheet,
  Truck,
  XCircle,
} from 'lucide-react';
import api, { getMensajeError } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import SortableFilterHeader from '../components/SortableFilterHeader';
import { downloadBlobResponse } from '../utils/download';
import { formatSafeDate } from '../utils/date';

const TIPO_BADGE = {
  ENTRADA: 'badge-green',
  SALIDA: 'badge-red',
  CANJES: 'badge-blue',
  'DEGUSTACIÓN': 'badge-purple',
  CRUCERISMO: 'badge-yellow',
  MERCADERISMO: 'badge-gray',
  ACTIVOS: 'badge-gray',
};

const EMPTY_TABLE_FILTERS = {
  q_almacen_origen: '',
  q_almacen_destino: '',
  q_categoria: '',
  q_tipo_accion: '',
  q_sku: '',
  q_nro_guia: '',
  q_registrado_por: '',
  sort_by: 'fecha',
  sort_dir: 'desc',
};

function nextSortState(current, key) {
  if (current.sort_by === key) {
    return { sort_by: key, sort_dir: current.sort_dir === 'asc' ? 'desc' : 'asc' };
  }

  return { sort_by: key, sort_dir: key === 'fecha' ? 'desc' : 'asc' };
}

function RegistroRow({ row, canManageStates, onAprobar, onRechazar, onEnCamino, loading }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="cursor-pointer" onClick={() => setExpanded((prev) => !prev)}>
        <td className="whitespace-nowrap font-medium">
          {formatSafeDate(row.fecha)}
        </td>
        <td className="max-w-[180px] truncate" title={row.almacen_origen}>{row.almacen_origen}</td>
        <td className="max-w-[180px] truncate" title={row.almacen_destino || ''}>{row.almacen_destino || '-'}</td>
        <td>{row.categoria_nombre}</td>
        <td><span className={TIPO_BADGE[row.tipo_accion] || 'badge-gray'}>{row.tipo_accion}</span></td>
        <td className="max-w-[220px] truncate" title={row.sku_nombre}>{row.sku_nombre}</td>
        <td className="font-semibold">{Number(row.cantidad || 0).toLocaleString()}</td>
        <td>{row.nro_guia || '-'}</td>
        <td className="text-xs text-gray-500">{row.registrado_por}</td>
        <td>
          <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
            {canManageStates && row.estado === 'pendiente' && (
              <button
                title="Marcar en camino"
                disabled={loading}
                className="btn-icon text-blue-500 hover:bg-blue-50"
                onClick={() => onEnCamino(row.id)}
              >
                <Truck size={15} />
              </button>
            )}
            {canManageStates && (row.estado === 'pendiente' || row.estado === 'en_transito') && (
              <>
                <button
                  title="Aprobar"
                  disabled={loading}
                  className="btn-icon text-green-600 hover:bg-green-50"
                  onClick={() => onAprobar(row.id)}
                >
                  <CheckCircle size={15} />
                </button>
                <button
                  title="Rechazar"
                  disabled={loading}
                  className="btn-icon text-red-500 hover:bg-red-50"
                  onClick={() => onRechazar(row.id)}
                >
                  <XCircle size={15} />
                </button>
              </>
            )}
            <button className="btn-icon text-gray-400" onClick={() => setExpanded((prev) => !prev)}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-blue-50/50">
          <td colSpan={10} className="px-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-gray-500 text-xs uppercase">Acción</span>
                <p className="font-medium">{row.accion}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase">Indicador</span>
                <p className="font-medium">{row.indicador_nombre || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase">Personal receptor</span>
                <p className="font-medium">{row.personal_receptor_nombre || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase">Tipo mercadería</span>
                <p className="font-medium">{row.tipo_mercaderia_nombre || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase">Lote</span>
                <p className="font-medium">{row.codigo_lote || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase">F. vencimiento</span>
                <p className="font-medium">
                  {formatSafeDate(row.fecha_vencimiento)}
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase">Ciudad</span>
                <p className="font-medium">{row.ciudad_nombre || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase">Observaciones</span>
                <p className="font-medium">{row.observaciones || '-'}</p>
              </div>
              {row.foto_guia && (
                <div className="col-span-2">
                  <span className="text-gray-500 text-xs uppercase">Foto guía</span>
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
          </td>
        </tr>
      )}
    </>
  );
}

function TablaModulo({
  titulo,
  icono: Icono,
  color,
  registros,
  isLoading,
  filters,
  onFilterChange,
  onSort,
  onExport,
  canDownload,
  canManageStates,
  onAprobar,
  onRechazar,
  onEnCamino,
  mutLoading,
}) {
  const sortConfig = { key: filters.sort_by, direction: filters.sort_dir };

  return (
    <div className="card p-0 overflow-hidden">
      <div className={`flex flex-col gap-3 px-5 py-4 border-b border-gray-200 ${color} md:flex-row md:items-center md:justify-between`}>
        <div className="flex items-center gap-3">
          <Icono size={20} />
          <div>
            <h2 className="font-semibold text-gray-900">{titulo}</h2>
            <p className="text-xs text-gray-500">{registros.length} registro(s)</p>
          </div>
        </div>
        {canDownload && (
          <button className="btn-secondary btn-sm" onClick={onExport}>
            <FileSpreadsheet size={14} /> Exportar Excel
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <SortableFilterHeader
                label="Fecha"
                sortKey="fecha"
                sortConfig={sortConfig}
                onSort={onSort}
                filterType="none"
              />
              <SortableFilterHeader
                label="Almacén Origen"
                sortKey="almacen_origen"
                sortConfig={sortConfig}
                onSort={onSort}
                filterValue={filters.q_almacen_origen}
                onFilterChange={(value) => onFilterChange('q_almacen_origen', value)}
              />
              <SortableFilterHeader
                label="Almacén Destino"
                sortKey="almacen_destino"
                sortConfig={sortConfig}
                onSort={onSort}
                filterValue={filters.q_almacen_destino}
                onFilterChange={(value) => onFilterChange('q_almacen_destino', value)}
              />
              <SortableFilterHeader
                label="Categoría"
                sortKey="categoria"
                sortConfig={sortConfig}
                onSort={onSort}
                filterValue={filters.q_categoria}
                onFilterChange={(value) => onFilterChange('q_categoria', value)}
              />
              <SortableFilterHeader
                label="Tipo Acción"
                sortKey="tipo_accion"
                sortConfig={sortConfig}
                onSort={onSort}
                filterValue={filters.q_tipo_accion}
                onFilterChange={(value) => onFilterChange('q_tipo_accion', value)}
              />
              <SortableFilterHeader
                label="SKU"
                sortKey="sku"
                sortConfig={sortConfig}
                onSort={onSort}
                filterValue={filters.q_sku}
                onFilterChange={(value) => onFilterChange('q_sku', value)}
              />
              <SortableFilterHeader
                label="Cantidad"
                sortKey="cantidad"
                sortConfig={sortConfig}
                onSort={onSort}
                filterType="none"
              />
              <SortableFilterHeader
                label="Nro. Guía"
                sortKey="nro_guia"
                sortConfig={sortConfig}
                onSort={onSort}
                filterValue={filters.q_nro_guia}
                onFilterChange={(value) => onFilterChange('q_nro_guia', value)}
              />
              <SortableFilterHeader
                label="Registrado por"
                sortKey="registrado_por"
                sortConfig={sortConfig}
                onSort={onSort}
                filterValue={filters.q_registrado_por}
                onFilterChange={(value) => onFilterChange('q_registrado_por', value)}
              />
              <SortableFilterHeader label="Acciones" filterType="none" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                    Cargando...
                  </div>
                </td>
              </tr>
            ) : registros.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-gray-400">
                  No hay registros en esta sección.
                </td>
              </tr>
            ) : registros.map((row) => (
              <RegistroRow
                key={row.id}
                row={row}
                canManageStates={canManageStates}
                onAprobar={onAprobar}
                onRechazar={onRechazar}
                onEnCamino={onEnCamino}
                loading={mutLoading}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Modulo2PageV2() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [pendientesFilters, setPendientesFilters] = useState(EMPTY_TABLE_FILTERS);
  const [transitoFilters, setTransitoFilters] = useState(EMPTY_TABLE_FILTERS);

  const canDownload = hasRole('superadmin', 'admin', 'supervisor');
  const canManageStates = hasRole('superadmin', 'admin', 'almacenero');

  const fetchRegistros = (estado, filters) => {
    const params = new URLSearchParams({ estado, limit: '200' });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return api.get(`/registros?${params.toString()}`).then((response) => (
      Array.isArray(response.data.datos) ? response.data.datos : []
    ));
  };

  const { data: pendientes = [], isLoading: loadPendientes } = useQuery({
    queryKey: ['registros', 'modulo2', 'pendientes', pendientesFilters],
    queryFn: () => fetchRegistros('pendiente', pendientesFilters),
    refetchInterval: 30_000,
  });

  const { data: enTransito = [], isLoading: loadTransito } = useQuery({
    queryKey: ['registros', 'modulo2', 'transito', transitoFilters],
    queryFn: () => fetchRegistros('en_transito', transitoFilters),
    refetchInterval: 30_000,
  });

  const mutEstado = useMutation({
    mutationFn: ({ id, estado }) => api.patch(`/registros/${id}/estado`, { estado }),
    onSuccess: (_, { estado }) => {
      qc.invalidateQueries({ queryKey: ['registros'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['auditoria-registros'] });

      const messages = {
        aprobado: 'Registro aprobado',
        rechazado: 'Registro rechazado',
        en_transito: 'Marcado como en camino',
      };
      toast.success(messages[estado] || 'Estado actualizado');
    },
    onError: (error) => toast.error(getMensajeError(error)),
  });

  const updatePendientesFilter = (key, value) => {
    setPendientesFilters((prev) => ({ ...prev, [key]: value }));
  };

  const updateTransitoFilter = (key, value) => {
    setTransitoFilters((prev) => ({ ...prev, [key]: value }));
  };

  const sortPendientes = (key) => {
    setPendientesFilters((prev) => ({ ...prev, ...nextSortState(prev, key) }));
  };

  const sortTransito = (key) => {
    setTransitoFilters((prev) => ({ ...prev, ...nextSortState(prev, key) }));
  };

  const exportSection = async (estado, filters, fallbackName) => {
    try {
      const params = new URLSearchParams({ estado });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });

      const response = await api.get(`/registros/export/excel?${params.toString()}`, {
        responseType: 'blob',
      });

      downloadBlobResponse(response, fallbackName);
    } catch (error) {
      toast.error(getMensajeError(error));
    }
  };

  const statsCards = [
    { label: 'Pendientes de aprobación', value: pendientes.length, color: 'bg-yellow-500', dot: 'bg-yellow-400' },
    { label: 'Guías en camino', value: enTransito.length, color: 'bg-blue-500', dot: 'bg-blue-400' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Control de Tránsito y Aprobaciones</h1>
        <p className="text-sm text-gray-500 mt-1">Módulo 2 · Visibilidad de guías y aprobación de ingresos</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {statsCards.map((stat, index) => (
          <div key={stat.label} className="stat-card">
            <div className={`stat-icon ${stat.color}`}>
              {index === 0 ? <ClipboardCheck size={22} className="text-white" /> : <Truck size={22} className="text-white" />}
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-500">{stat.label}</p>
            </div>
            {stat.value > 0 && (
              <div className="ml-auto">
                <span className={`inline-block w-3 h-3 rounded-full ${stat.dot} animate-pulse`} />
              </div>
            )}
          </div>
        ))}
      </div>

      <TablaModulo
        titulo="Visibilidad de Guías en Camino"
        icono={Truck}
        color="bg-blue-50"
        registros={enTransito}
        isLoading={loadTransito}
        filters={transitoFilters}
        onFilterChange={updateTransitoFilter}
        onSort={sortTransito}
        onExport={() => exportSection('en_transito', transitoFilters, `zentra_guias_en_camino_${Date.now()}.xlsx`)}
        canDownload={canDownload}
        canManageStates={canManageStates}
        onAprobar={(id) => mutEstado.mutate({ id, estado: 'aprobado' })}
        onRechazar={(id) => mutEstado.mutate({ id, estado: 'rechazado' })}
        onEnCamino={(id) => mutEstado.mutate({ id, estado: 'en_transito' })}
        mutLoading={mutEstado.isPending}
      />

      <TablaModulo
        titulo="Cuadro de Aprobación de Ingresos"
        icono={ClipboardCheck}
        color="bg-yellow-50"
        registros={pendientes}
        isLoading={loadPendientes}
        filters={pendientesFilters}
        onFilterChange={updatePendientesFilter}
        onSort={sortPendientes}
        onExport={() => exportSection('pendiente', pendientesFilters, `zentra_aprobacion_ingresos_${Date.now()}.xlsx`)}
        canDownload={canDownload}
        canManageStates={canManageStates}
        onAprobar={(id) => mutEstado.mutate({ id, estado: 'aprobado' })}
        onRechazar={(id) => mutEstado.mutate({ id, estado: 'rechazado' })}
        onEnCamino={(id) => mutEstado.mutate({ id, estado: 'en_transito' })}
        mutLoading={mutEstado.isPending}
      />

      <p className="text-xs text-gray-400 text-center">
        Se actualiza automáticamente cada 30 segundos · Haz clic en una fila para ver el detalle completo
      </p>
    </div>
  );
}
