import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { AlertCircle, CheckCircle, Plus, Trash2 } from 'lucide-react';
import api, { getMensajeError } from '../utils/api';
import { useAuth } from '../context/AuthContext';

function ConfiguracionNotificacionesPage() {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();

  const { data: configData, isLoading } = useQuery({
    queryKey: ['config-notificaciones'],
    queryFn: () => api.get('/notificaciones/config').then((response) => response.data.datos),
    enabled: usuario?.rol === 'admin' || usuario?.rol === 'superadmin',
  });

  const addMutacion = useMutation({
    mutationFn: (tipoMercaderiaId) =>
      api.post('/notificaciones/config', {
        tipo_mercaderia_id: tipoMercaderiaId,
        excluir_de_stock_critico: true,
        excluir_de_stock_bajo: true,
        excluir_de_vencimientos: true,
      }),
    onSuccess: () => {
      toast.success('Configuracion agregada');
      queryClient.invalidateQueries({ queryKey: ['config-notificaciones'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(getMensajeError(err)),
  });

  const eliminarMutacion = useMutation({
    mutationFn: (configId) => api.delete(`/notificaciones/config/${configId}`),
    onSuccess: () => {
      toast.success('Configuracion eliminada');
      queryClient.invalidateQueries({ queryKey: ['config-notificaciones'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(getMensajeError(err)),
  });

  const addAllMutacion = useMutation({
    mutationFn: (tipoMercaderiaIds) =>
      api.post('/notificaciones/config/bulk', {
        tipo_mercaderia_ids: tipoMercaderiaIds,
      }),
    onSuccess: () => {
      toast.success('Exclusiones pendientes agregadas');
      queryClient.invalidateQueries({ queryKey: ['config-notificaciones'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(getMensajeError(err)),
  });

  if (usuario?.rol !== 'admin' && usuario?.rol !== 'superadmin') {
    return (
      <div className="p-6 text-center">
        <AlertCircle size={48} className="mx-auto mb-4 text-orange-500" />
        <p className="text-lg font-semibold text-gray-700">
          Solo administradores pueden acceder a esta configuracion
        </p>
      </div>
    );
  }

  const config = configData?.config || [];
  const tiposDisponibles = configData?.tipos_disponibles || [];
  const tiposConfigurados = new Set(config.map((item) => Number(item.tipo_mercaderia_id)));
  const tiposDisponiblesParaAgregar = tiposDisponibles.filter(
    (tipo) => !tiposConfigurados.has(Number(tipo.id)),
  );
  const isMutating = addMutacion.isPending || addAllMutacion.isPending || eliminarMutacion.isPending;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Configuracion de Notificaciones
        </h1>
        <p className="text-gray-600">
          Configura que tipos de mercaderia se excluyen de alertas de stock y vencimientos.
        </p>
      </div>

      {config.length > 0 && (
        <div className="mb-8 rounded-lg bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">
            Exclusiones Configuradas
          </h2>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Tipo de Mercaderia</th>
                  <th>Excluir de Stock Critico</th>
                  <th>Excluir de Stock Bajo</th>
                  <th>Excluir de Vencimientos</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {config.map((item) => (
                  <tr key={item.id}>
                    <td className="font-medium">{item.categoria_nombre || '-'}</td>
                    <td>{item.tipo_mercaderia_nombre || '-'}</td>
                    <td>
                      <div className="flex justify-center">
                        {item.excluir_de_stock_critico ? (
                          <CheckCircle size={20} className="text-green-500" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex justify-center">
                        {item.excluir_de_stock_bajo ? (
                          <CheckCircle size={20} className="text-green-500" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex justify-center">
                        {item.excluir_de_vencimientos ? (
                          <CheckCircle size={20} className="text-green-500" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                        )}
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-icon text-red-500 hover:bg-red-50"
                        onClick={() => eliminarMutacion.mutate(item.id)}
                        disabled={isMutating}
                        title="Eliminar"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tiposDisponiblesParaAgregar.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow-md">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Agregar Nueva Exclusion
            </h2>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => addAllMutacion.mutate(tiposDisponiblesParaAgregar.map((tipo) => tipo.id))}
              disabled={isMutating}
            >
              <Plus size={14} /> Agregar todos los pendientes
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tiposDisponiblesParaAgregar.map((tipo) => (
              <button
                key={tipo.id}
                type="button"
                className="btn-secondary flex items-center justify-between gap-2 p-4 text-left"
                onClick={() => addMutacion.mutate(tipo.id)}
                disabled={isMutating}
              >
                <span className="flex flex-col items-start">
                  <span className="font-semibold">{tipo.nombre}</span>
                  <span className="text-xs font-normal text-gray-500">
                    {tipo.categoria_nombre || 'Sin categoria'}
                  </span>
                </span>
                <Plus size={20} />
              </button>
            ))}
          </div>
        </div>
      )}

      {config.length === 0 && tiposDisponiblesParaAgregar.length === 0 && !isLoading && (
        <div className="rounded-lg bg-blue-50 p-8 text-center">
          <p className="text-gray-600">No hay tipos de mercaderia disponibles para configurar</p>
        </div>
      )}
    </div>
  );
}

export default ConfiguracionNotificacionesPage;
