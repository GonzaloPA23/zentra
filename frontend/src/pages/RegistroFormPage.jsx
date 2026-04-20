import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import api, { getMensajeError } from '../utils/api';
import { ArrowLeft, Save, Loader2, Upload, Plus, X } from 'lucide-react';
import { toSafeDateInputValue, toSafeLocaleDateString } from '../utils/date';

const ACCION_TIPOS = {
  'MERMA':                ['ENTRADA','SALIDA','DEGUSTACIÓN','CANJES','CRUCERISMO','MERCADERISMO','ACTIVOS'],
  'DESPACHO A CANJISTAS': ['SALIDA','CANJES'],
  'OTROS MOVIMIENTOS':    ['ENTRADA','SALIDA','DEGUSTACIÓN','CANJES','CRUCERISMO','MERCADERISMO','ACTIVOS'],
};
const ACCIONES = Object.keys(ACCION_TIPOS);
const INDICADOR_TG_MOLITALIA = 'TG - MOLITALIA';

// ── Modal inline para crear lote ──────────────────────────────────────────────
function ModalCrearLote({ skuNombre, skuId, onCreado, onCerrar }) {
  const [codigoLote, setCodigoLote] = useState('');
  const [fechaVenc, setFechaVenc]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const handleGuardar = async () => {
    if (!codigoLote.trim()) { setError('El código de lote es requerido'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/catalogos/lotes', {
        sku_id: skuId,
        codigo_lote: codigoLote.trim(),
        fecha_vencimiento: fechaVenc || null,
      });
      toast.success('Lote creado correctamente');
      onCreado({ id: res.data.id, codigo_lote: codigoLote.trim(), fecha_vencimiento: fechaVenc || null });
    } catch (err) {
      setError(getMensajeError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="modal-box max-w-md">
        <div className="modal-header">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Nuevo Lote</h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">{skuNombre}</p>
          </div>
          <button onClick={onCerrar} className="btn-icon text-gray-400"><X size={18} /></button>
        </div>
        <div className="modal-body space-y-4">
          <div>
            <label className="label">Código de Lote <span className="text-red-500">*</span></label>
            <input
              className={`input ${error ? 'input-error' : ''}`}
              placeholder="Ej: LOTE-001, L240415..."
              value={codigoLote}
              onChange={e => { setCodigoLote(e.target.value); setError(''); }}
              autoFocus
            />
            {error && <p className="error-msg">{error}</p>}
          </div>
          <div>
            <label className="label">Fecha de Vencimiento</label>
            <input
              type="date"
              className="input"
              value={fechaVenc}
              onChange={e => setFechaVenc(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Al seleccionar este lote en el registro, la fecha se auto-completará.
            </p>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCerrar} disabled={loading}>Cancelar</button>
          <button className="btn-primary" onClick={handleGuardar} disabled={loading}>
            {loading
              ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
              : <><Plus size={14} /> Crear Lote</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Formulario principal ───────────────────────────────────────────────────────
export default function RegistroFormPage() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const isEditing = !!id;

  const [loading, setLoading]     = useState(false);
  const [fotoFile, setFotoFile]   = useState(null);
  const [modalLote, setModalLote] = useState(false);
  const [lotesLocales, setLotesLocales] = useState([]); // lotes recién creados en esta sesión
  const [registroEstado, setRegistroEstado] = useState(null);

  const isHydratingRef = useRef(false);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm({
    defaultValues: {
      fecha: new Date().toISOString().split('T')[0],
      zona: 'LIMA',
      accion: '', tipo_accion: '',
      categoria_id: '', tipo_mercaderia_id: '',
      sku_id: '', lote_id: '', fecha_vencimiento: '',
    },
  });

  const zona             = watch('zona');
  const ciudadId         = watch('ciudad_id');
  const accion           = watch('accion');
  const almacenOrigenId  = watch('almacen_origen_id');
  const catId            = watch('categoria_id');
  const tipoMercId       = watch('tipo_mercaderia_id');
  const skuId            = watch('sku_id');
  const loteId           = watch('lote_id');
  const indicadorId      = watch('indicador_id');
  const personalReceptorId = watch('personal_receptor_id');

  const tiposAccionDisponibles = ACCION_TIPOS[accion] || [];
  const filtrosPersonalCompletos = !!almacenOrigenId && !!catId;

  // Catálogos
  const { data: ciudades   = [] } = useQuery({ queryKey: ['ciudades'],   queryFn: () => api.get('/catalogos/ciudades').then(r => r.data.datos) });
  const { data: almacenes  = [] } = useQuery({ queryKey: ['almacenes'],  queryFn: () => api.get('/catalogos/almacenes').then(r => r.data.datos) });
  const { data: categorias = [] } = useQuery({ queryKey: ['categorias'], queryFn: () => api.get('/catalogos/categorias').then(r => r.data.datos) });
  const { data: indicadores= [] } = useQuery({ queryKey: ['indicadores'],queryFn: () => api.get('/catalogos/indicadores').then(r => r.data.datos) });
  const {
    data: personal = [],
    isFetching: cargandoPersonal,
  } = useQuery({
    queryKey: ['personal-receptor', ciudadId || '', almacenOrigenId || '', catId || ''],
    queryFn: () => {
      const params = new URLSearchParams();
      if (ciudadId) params.append('ciudad_id', ciudadId);
      if (almacenOrigenId) params.append('almacen_id', almacenOrigenId);
      if (catId) params.append('categoria_id', catId);
      return api.get(`/catalogos/personal-receptor?${params.toString()}`).then(r => r.data.datos);
    },
    enabled: filtrosPersonalCompletos,
  });

  const ciudadSeleccionada = useMemo(
    () => ciudades.find((c) => String(c.id) === String(ciudadId)),
    [ciudades, ciudadId]
  );
  const almacenesOrigenDisponibles = useMemo(
    () => almacenes.filter((a) => String(a.ciudad_id) === String(ciudadId)),
    [almacenes, ciudadId]
  );

  const { data: tiposMerc = [] } = useQuery({
    queryKey: ['tipos-merc', catId],
    queryFn: () => api.get(`/catalogos/tipos-mercaderia?categoria_id=${catId}`).then(r => r.data.datos),
    enabled: !!catId,
  });

  const { data: skus = [] } = useQuery({
    queryKey: ['skus', catId, tipoMercId, zona],
    queryFn: () => {
      let url = `/catalogos/skus?zona=${zona}`;
      if (catId)      url += `&categoria_id=${catId}`;
      if (tipoMercId) url += `&tipo_mercaderia_id=${tipoMercId}`;
      return api.get(url).then(r => r.data.datos);
    },
    enabled: !!catId,
  });

  const { data: lotesDB = [], refetch: refetchLotes } = useQuery({
    queryKey: ['lotes', skuId],
    queryFn: () => api.get(`/catalogos/lotes?sku_id=${skuId}`).then(r => r.data.datos),
    enabled: !!skuId,
  });

  // Combinar lotes de DB + recién creados
  const lotes = [...lotesDB, ...lotesLocales.filter(l => !lotesDB.find(d => d.id === l.id))];

  const skuSeleccionado = skus.find(s => String(s.id) === String(skuId));
  const skuTieneLote    = !!skuSeleccionado?.tiene_lote;
  const skuTieneVenc    = !!skuSeleccionado?.tiene_vencimiento;
  const indicadorNombre = indicadores.find(i => String(i.id) === String(indicadorId))?.nombre || '';
  const esTGMolitalia   = indicadorNombre === INDICADOR_TG_MOLITALIA;
  const zonaSugerida    = ciudadSeleccionada?.nombre === 'LIMA' ? 'LIMA' : ciudadSeleccionada ? 'PROVINCIA' : zona;
  const isApprovedRecord = isEditing && registroEstado === 'aprobado';
  const isReadOnly = isApprovedRecord;

  // Auto-completar fecha desde lote
  useEffect(() => {
    const lote = lotes.find(l => String(l.id) === String(loteId));
    if (lote?.fecha_vencimiento) {
      setValue('fecha_vencimiento', toSafeDateInputValue(lote.fecha_vencimiento));
    } else if (loteId) {
      setValue('fecha_vencimiento', '');
    }
  }, [loteId, lotes, setValue]);

  // Limpiar cascadas
  useEffect(() => {
    if (isHydratingRef.current) return;
    setValue('tipo_mercaderia_id','');
    setValue('sku_id','');
    setValue('lote_id','');
    setValue('fecha_vencimiento','');
    setLotesLocales([]);
  }, [catId, setValue]);
  useEffect(() => {
    if (isHydratingRef.current) return;
    setValue('sku_id','');
    setValue('lote_id','');
    setValue('fecha_vencimiento','');
    setLotesLocales([]);
  }, [tipoMercId, setValue]);
  useEffect(() => {
    if (isHydratingRef.current) return;
    setValue('lote_id','');
    setValue('fecha_vencimiento','');
    setLotesLocales([]);
  }, [skuId, setValue]);
  useEffect(() => {
    if (isHydratingRef.current) return;
    setValue('tipo_accion','');
  }, [accion, setValue]);
  useEffect(() => {
    if (isHydratingRef.current) return;
    setValue('sku_id','');
    setValue('lote_id','');
    setLotesLocales([]);
  }, [zona, setValue]);
  useEffect(() => {
    if (!ciudadId) {
      if (!isHydratingRef.current) setValue('almacen_origen_id', '');
      return;
    }
    if (almacenOrigenId && !almacenesOrigenDisponibles.some(a => String(a.id) === String(almacenOrigenId))) {
      setValue('almacen_origen_id', '');
    }
  }, [ciudadId, almacenOrigenId, almacenesOrigenDisponibles, setValue]);
  useEffect(() => {
    if (!ciudadSeleccionada) return;
    if (zona !== zonaSugerida) {
      setValue('zona', zonaSugerida);
    }
  }, [ciudadSeleccionada, zona, zonaSugerida, setValue]);
  useEffect(() => {
    if (!personalReceptorId) return;
    if (isHydratingRef.current) return;
    if (!filtrosPersonalCompletos) {
      setValue('personal_receptor_id', '');
      return;
    }
    if (cargandoPersonal) return;
    if (!personal.some(p => String(p.id) === String(personalReceptorId))) {
      setValue('personal_receptor_id', '');
    }
  }, [personalReceptorId, filtrosPersonalCompletos, cargandoPersonal, personal, setValue]);

  // Cargar datos al editar
  useEffect(() => {
    if (!isEditing || !ciudades.length) return;
    isHydratingRef.current = true;
    api.get(`/registros/${id}`).then(r => {
      const d = r.data.datos;
      setRegistroEstado(d.estado || null);
      const ciudad = ciudades.find(c => String(c.id) === String(d.ciudad_id));
      const zonaInicial = ciudad?.nombre === 'LIMA' ? 'LIMA' : ciudad ? 'PROVINCIA' : 'LIMA';

      reset({
        fecha: toSafeDateInputValue(d.fecha, new Date().toISOString().split('T')[0]),
        ciudad_id: d.ciudad_id ? String(d.ciudad_id) : '',
        zona: zonaInicial,
        almacen_origen_id: d.almacen_origen_id ? String(d.almacen_origen_id) : '',
        almacen_destino_id: d.almacen_destino_id ? String(d.almacen_destino_id) : '',
        categoria_id: d.categoria_id ? String(d.categoria_id) : '',
        accion: d.accion || '',
        tipo_accion: d.tipo_accion || '',
        personal_receptor_id: d.personal_receptor_id ? String(d.personal_receptor_id) : '',
        indicador_id: d.indicador_id ? String(d.indicador_id) : '',
        tipo_mercaderia_id: d.tipo_mercaderia_id ? String(d.tipo_mercaderia_id) : '',
        sku_id: d.sku_id ? String(d.sku_id) : '',
        lote_id: d.lote_id ? String(d.lote_id) : '',
        fecha_vencimiento: toSafeDateInputValue(d.fecha_vencimiento),
        cantidad: d.cantidad ? String(d.cantidad) : '',
        nro_guia: d.nro_guia || '',
        observaciones: d.observaciones || '',
      });
    }).catch(() => {
      toast.error('No se pudo cargar el registro');
      navigate('/registros');
    }).finally(() => {
      setTimeout(() => { isHydratingRef.current = false; }, 0);
    });
  }, [id, isEditing, ciudades, navigate, reset]);

  useEffect(() => {
    if (!isEditing) setRegistroEstado(null);
  }, [isEditing]);

  const handleLoteCreado = async (nuevoLote) => {
    setModalLote(false);
    setLotesLocales(prev => [...prev, nuevoLote]);
    await refetchLotes();
    setTimeout(() => {
      setValue('lote_id', String(nuevoLote.id));
      if (nuevoLote.fecha_vencimiento) {
        setValue('fecha_vencimiento', toSafeDateInputValue(nuevoLote.fecha_vencimiento));
      }
    }, 200);
  };

  const onSubmit = async (data) => {
    if (isReadOnly) return;
    setLoading(true);
    try {
      const formData = new FormData();
      Object.entries(data).forEach(([k, v]) => {
        if (v !== '' && v !== undefined && v !== null) formData.append(k, v);
      });
      if (fotoFile) formData.append('foto_guia', fotoFile);
      const config = { headers: { 'Content-Type': 'multipart/form-data' } };
      if (isEditing) {
        await api.put(`/registros/${id}`, formData, config);
        toast.success('Registro actualizado');
      } else {
        await api.post('/registros', formData, config);
        toast.success('Registro creado exitosamente');
      }
      navigate('/registros');
    } catch (err) {
      toast.error(getMensajeError(err));
    } finally {
      setLoading(false);
    }
  };

  const F = ({ label, required, name, children }) => (
    <div>
      <label className="label">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      {children}
      {errors[name] && <p className="error-msg">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/registros')} className="btn-secondary btn-sm">
          <ArrowLeft size={14} /> Volver
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? (isReadOnly ? 'Ver Registro Aprobado' : 'Editar Registro') : 'Nuevo Registro'}
          </h1>
          <p className="text-sm text-gray-500">Módulo 1 · Registros de almacén</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {isReadOnly && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Este registro ya fue aprobado. Puedes revisarlo, pero sus campos están bloqueados y no se puede guardar cambios.
          </div>
        )}

        <fieldset disabled={isReadOnly} className="space-y-6">

        {/* Sección 1 */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4 pb-2 border-b">Datos Generales</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <F label="Fecha" required name="fecha">
              <input type="date" className={`input ${errors.fecha ? 'input-error' : ''}`}
                {...register('fecha', { required: 'Requerido' })} />
            </F>
            <F label="Ciudad" required name="ciudad_id">
              <select className={`input ${errors.ciudad_id ? 'input-error' : ''}`}
                {...register('ciudad_id', { required: 'Requerido' })}>
                <option value="">Seleccionar ciudad...</option>
                {ciudades.map(c => <option key={c.id} value={c.id}>{c.nombre} — {c.region_nombre}</option>)}
              </select>
            </F>
            <F label="Zona" name="zona">
              <select className="input" {...register('zona')}>
                <option value="LIMA">LIMA</option>
                <option value="PROVINCIA">PROVINCIA</option>
              </select>
            </F>
            <F label="Almacén Inicial (Origen)" required name="almacen_origen_id">
              <select className={`input ${errors.almacen_origen_id ? 'input-error' : ''} ${!ciudadId ? 'opacity-50' : ''}`}
                disabled={!ciudadId}
                {...register('almacen_origen_id', { required: 'Requerido' })}>
                <option value="">
                  {!ciudadId
                    ? 'Selecciona ciudad primero'
                    : almacenesOrigenDisponibles.length === 0
                      ? 'Sin almacenes para esta ciudad'
                      : 'Seleccionar almacén...'}
                </option>
                {almacenesOrigenDisponibles.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </F>
            <F label="Almacén Destino" name="almacen_destino_id">
              <select className="input" {...register('almacen_destino_id')}>
                <option value="">Sin destino</option>
                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </F>
          </div>
        </div>

        {/* Sección 2 */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4 pb-2 border-b">Acción y Personal</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <F label="Categoría" required name="categoria_id">
              <select className={`input ${errors.categoria_id ? 'input-error' : ''}`}
                {...register('categoria_id', { required: 'Requerido' })}>
                <option value="">Seleccionar categoría...</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </F>
            <F label="Acción" required name="accion">
              <select className={`input ${errors.accion ? 'input-error' : ''}`}
                {...register('accion', { required: 'Requerido' })}>
                <option value="">Seleccionar acción...</option>
                {ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </F>
            <F label="Tipo de Acción" required name="tipo_accion">
              <select className={`input ${errors.tipo_accion ? 'input-error':''} ${!accion?'opacity-50':''}`}
                disabled={!accion}
                {...register('tipo_accion', { required: 'Requerido' })}>
                <option value="">{accion ? 'Seleccionar...' : 'Primero elige una Acción'}</option>
                {tiposAccionDisponibles.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </F>
            <F label="Personal Receptor" name="personal_receptor_id">
              <select
                className={`input ${!filtrosPersonalCompletos ? 'opacity-50' : ''}`}
                disabled={!filtrosPersonalCompletos || cargandoPersonal}
                {...register('personal_receptor_id')}
              >
                <option value="">
                  {!almacenOrigenId && !catId
                    ? 'Selecciona almacen y categoria primero'
                    : !almacenOrigenId
                      ? 'Selecciona almacen primero'
                      : !catId
                        ? 'Selecciona categoria primero'
                        : cargandoPersonal
                          ? 'Cargando personal...'
                          : personal.length === 0
                            ? 'Sin personal para este filtro'
                            : 'Sin asignar'}
                </option>
                {personal.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.cargo ? ` — ${p.cargo}` : ''}</option>)}
              </select>
            </F>
            <F label="Indicador" name="indicador_id">
              <select className="input" {...register('indicador_id')}>
                <option value="">Sin indicador</option>
                {indicadores.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
              </select>
            </F>
            <F label="Tipo de Mercadería" name="tipo_mercaderia_id">
              <select className={`input ${!catId?'opacity-50':''}`} disabled={!catId}
                {...register('tipo_mercaderia_id')}>
                <option value="">{catId ? 'Sin tipo / Todos' : 'Selecciona categoría primero'}</option>
                {tiposMerc.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </F>
          </div>
        </div>

        {/* Sección 3 */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4 pb-2 border-b">SKU y Mercadería</h3>

          {catId && (
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="badge-blue">Zona: {zona}</span>
              <span className="badge-blue">{categorias.find(c=>String(c.id)===String(catId))?.nombre}</span>
              {tipoMercId && <span className="badge-blue">{tiposMerc.find(t=>String(t.id)===String(tipoMercId))?.nombre}</span>}
              <span className="badge-gray">{skus.length} SKUs</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

            <F label="SKU" required name="sku_id">
              <select className={`input ${errors.sku_id?'input-error':''} ${!catId?'opacity-50':''}`}
                disabled={!catId}
                {...register('sku_id', { required: 'Requerido' })}>
                <option value="">{catId ? `Seleccionar SKU (${skus.length})...` : 'Selecciona categoría primero'}</option>
                {skus.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}{s.tiene_lote ? ' 📦' : ''}
                  </option>
                ))}
              </select>
              {skuSeleccionado && (
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {skuTieneLote && <span className="badge-blue text-xs">Maneja lotes</span>}
                  {skuTieneVenc && <span className="badge-yellow text-xs">Tiene vencimiento</span>}
                  {!skuTieneLote && !skuTieneVenc && <span className="badge-gray text-xs">Sin lote ni vencimiento</span>}
                </div>
              )}
            </F>

            {/* Lote con botón + */}
            <div>
              <label className="label">
                Lote {skuTieneLote && <span className="text-red-500">*</span>}
              </label>
              <div className="flex gap-2">
                <select
                  className={`input flex-1 ${!skuId?'opacity-50':''}
                    ${skuTieneLote && !loteId && skuId ? 'border-yellow-400 ring-1 ring-yellow-300' : ''}`}
                  disabled={!skuId}
                  {...register('lote_id', { required: skuTieneLote ? 'Este SKU requiere lote' : false })}>
                  <option value="">
                    {!skuId ? 'Selecciona SKU primero'
                      : lotes.length === 0 ? '— Sin lotes creados —'
                      : `Seleccionar lote (${lotes.length})...`}
                  </option>
                  {lotes.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.codigo_lote}
                      {l.fecha_vencimiento
                        ? ` — vence: ${toSafeLocaleDateString(l.fecha_vencimiento, 'es-PE', '')}`
                        : ''}
                    </option>
                  ))}
                </select>
                {skuId && (
                  <button type="button"
                    title="Crear nuevo lote para este SKU"
                    className="btn-primary btn-sm flex-shrink-0 px-2.5"
                    onClick={() => setModalLote(true)}>
                    <Plus size={15} />
                  </button>
                )}
              </div>
              {skuTieneLote && skuId && lotes.length === 0 && (
                <p className="text-xs text-yellow-600 mt-1">
                  ⚠ SKU requiere lote — presiona <strong className="font-bold">+</strong> para crear uno
                </p>
              )}
              {errors.lote_id && <p className="error-msg">{errors.lote_id.message}</p>}
            </div>

            {/* Fecha de vencimiento */}
            <F label="Fecha de Vencimiento" name="fecha_vencimiento">
              <input type="date"
                className={`input ${loteId && !esTGMolitalia ? 'bg-gray-50 cursor-not-allowed text-gray-500' : ''}`}
                readOnly={!!loteId && !esTGMolitalia}
                title={loteId && !esTGMolitalia ? 'Auto-completado desde el lote' : ''}
                {...register('fecha_vencimiento')} />
              {loteId && !esTGMolitalia && (
                <p className="text-xs text-gray-400 mt-1">📅 Auto-completado desde el lote</p>
              )}
              {esTGMolitalia && (
                <p className="text-xs text-blue-500 mt-1">✏️ Ingreso manual — TG Molitalia</p>
              )}
              {!loteId && skuTieneVenc && (
                <p className="text-xs text-yellow-600 mt-1">Selecciona un lote para auto-completar</p>
              )}
            </F>

            <F label="Cantidad" required name="cantidad">
              <input type="number" min="0.01" step="0.01" placeholder="0"
                className={`input ${errors.cantidad?'input-error':''}`}
                {...register('cantidad', {
                  required: 'Requerido',
                  min: { value: 0.01, message: 'Debe ser mayor a 0' },
                })} />
            </F>

            <F label="Nro. Guía" name="nro_guia">
              <input type="text" className="input" placeholder="Ej: G-001234"
                {...register('nro_guia')} />
            </F>

            <F label="Foto Guía (JPG/PNG/PDF)" name="foto_guia">
              <label className={`btn-secondary btn-sm w-full justify-center ${isReadOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                <Upload size={13} />
                {fotoFile ? fotoFile.name.slice(0,22)+'...' : 'Subir archivo'}
                <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
                  onChange={e => setFotoFile(e.target.files[0])} />
              </label>
            </F>

          </div>

          <div className="mt-4">
            <label className="label">Observaciones</label>
            <textarea className="input" rows={3} placeholder="Notas adicionales..."
              {...register('observaciones')} />
          </div>
        </div>

        </fieldset>

        <div className="flex justify-end gap-3 pb-6">
          <button type="button" className="btn-secondary" onClick={() => navigate('/registros')}>
            {isReadOnly ? 'Volver' : 'Cancelar'}
          </button>
          {!isReadOnly && (
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <><Loader2 size={15} className="animate-spin" /> Guardando...</> : <><Save size={15} /> Guardar Registro</>}
            </button>
          )}
        </div>

      </form>

      {/* Modal crear lote */}
      {modalLote && skuId && (
        <ModalCrearLote
          skuId={skuId}
          skuNombre={skuSeleccionado?.nombre || ''}
          onCreado={handleLoteCreado}
          onCerrar={() => setModalLote(false)}
        />
      )}
    </div>
  );
}
