import { useQuery } from '@tanstack/react-query';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { ClipboardList, CheckCircle, Clock, AlertTriangle, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getSafeDate } from '../utils/date';

const COLORS = ['#4361ee','#7209b7','#3a0ca3','#f72585','#4cc9f0','#4895ef','#560bad'];

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function AlertRow({ item, tipo }) {
  const fechaVencimiento = getSafeDate(item.fecha_vencimiento);
  const dias = fechaVencimiento
    ? Math.ceil((fechaVencimiento - new Date()) / 86400000)
    : null;
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg text-sm ${tipo === 'vencido' ? 'bg-red-50' : 'bg-yellow-50'}`}>
      <AlertTriangle size={15} className={tipo === 'vencido' ? 'text-red-500' : 'text-yellow-500'} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{item.sku}</p>
        <p className="text-xs text-gray-500">{item.almacen} · Cant: {item.cantidad}</p>
      </div>
      <span className={`text-xs font-semibold ${tipo === 'vencido' ? 'text-red-600' : 'text-yellow-600'}`}>
        {tipo === 'vencido' ? 'VENCIDO' : dias === null ? '-' : `${dias}d`}
      </span>
    </div>
  );
}

function StockAlertRow({ item, tipo }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg text-sm ${tipo === 'critico' ? 'bg-red-50' : 'bg-yellow-50'}`}>
      <AlertTriangle size={15} className={tipo === 'critico' ? 'text-red-500' : 'text-yellow-500'} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{item.sku}</p>
        <p className="text-xs text-gray-500">{item.almacen} · Stock: {item.cantidad}</p>
      </div>
      <span className={`text-xs font-semibold ${tipo === 'critico' ? 'text-red-600' : 'text-yellow-600'}`}>
        {tipo === 'critico' ? 'CRITICO' : 'BAJO'}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const { usuario } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard/resumen').then(r => r.data.datos),
  });

  const t = data?.totales ?? {};
  const porMes = (Array.isArray(data?.por_mes) ? data.por_mes : []).map(m => ({
    mes: m.mes,
    total: parseInt(m.total),
    cantidad: parseFloat(m.cantidad),
  }));
  const porCategoria = Array.isArray(data?.por_categoria) ? data.por_categoria : [];
  const alertas = {
    vencidos: Array.isArray(data?.alertas?.vencidos) ? data.alertas.vencidos : [],
    vencimientos_proximos: Array.isArray(data?.alertas?.vencimientos_proximos)
      ? data.alertas.vencimientos_proximos
      : [],
    stock_critico: Array.isArray(data?.alertas?.stock_critico) ? data.alertas.stock_critico : [],
    stock_bajo: Array.isArray(data?.alertas?.stock_bajo) ? data.alertas.stock_bajo : [],
    stock_limites: data?.alertas?.stock_limites ?? { critico: 100, bajo: 200 },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          Bienvenido, {usuario?.nombre}. {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Total Registros" value={t.total_registros} color="bg-primary-500" />
        <StatCard icon={Clock}         label="Pendientes"      value={t.pendientes}     color="bg-yellow-500" />
        <StatCard icon={TrendingUp}    label="En Tránsito"     value={t.en_transito}    color="bg-blue-500" />
        <StatCard icon={CheckCircle}   label="Aprobados"       value={t.aprobados}      color="bg-green-500" sub={`${t.hoy ?? 0} hoy`} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar chart */}
        <div className="card lg:col-span-2">
          <h3 className="font-semibold text-gray-800 mb-4">Registros por mes (últimos 6 meses)</h3>
          {isLoading ? (
            <div className="h-56 flex items-center justify-center text-gray-400">Cargando...</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={porMes} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill="#4361ee" radius={[4, 4, 0, 0]} name="Registros" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie chart */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Por categoría</h3>
          {isLoading ? (
            <div className="h-56 flex items-center justify-center text-gray-400">Cargando...</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={porCategoria}
                  dataKey="total"
                  nameKey="nombre"
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {porCategoria.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Alertas */}
      {(alertas.vencidos.length > 0 || alertas.vencimientos_proximos.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {alertas.vencidos.length > 0 && (
            <div className="card border-red-200">
              <h3 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                <AlertTriangle size={16} /> Productos Vencidos ({alertas.vencidos.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {alertas.vencidos.map((item) => (
                  <AlertRow key={item.id} item={item} tipo="vencido" />
                ))}
              </div>
            </div>
          )}
          {alertas.vencimientos_proximos.length > 0 && (
            <div className="card border-yellow-200">
              <h3 className="font-semibold text-yellow-700 mb-3 flex items-center gap-2">
                <AlertTriangle size={16} /> Próximos a Vencer ({data.alertas.vencimientos_proximos.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {alertas.vencimientos_proximos.map((item) => (
                  <AlertRow key={item.id} item={item} tipo="proximo" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(alertas.stock_critico.length > 0 || alertas.stock_bajo.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {alertas.stock_critico.length > 0 && (
            <div className="card border-red-200">
              <h3 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                <AlertTriangle size={16} /> Stock Crítico ({"<="} {alertas.stock_limites.critico} Und)
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {alertas.stock_critico.map((item) => (
                  <StockAlertRow key={`${item.almacen_id}-${item.sku_id}`} item={item} tipo="critico" />
                ))}
              </div>
            </div>
          )}
          {alertas.stock_bajo.length > 0 && (
            <div className="card border-yellow-200">
              <h3 className="font-semibold text-yellow-700 mb-3 flex items-center gap-2">
                <AlertTriangle size={16} /> Stock Bajo ({"<="} {alertas.stock_limites.bajo} Und)
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {alertas.stock_bajo.map((item) => (
                  <StockAlertRow key={`${item.almacen_id}-${item.sku_id}`} item={item} tipo="bajo" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
