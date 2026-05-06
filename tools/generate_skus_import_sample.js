const fs = require('fs/promises');
const path = require('path');
const {
  addWorksheetRows,
  createWorkbook,
  prepareWorksheet,
  ExcelJS,
} = require('../backend/src/utils/excel');

const categorias = [
  { id: 1, nombre: 'ABARROTES', descripcion: '', estado: 'Activo' },
  { id: 2, nombre: 'CONFITES', descripcion: '', estado: 'Activo' },
  { id: 3, nombre: 'MASCOTAS', descripcion: '', estado: 'Activo' },
  { id: 4, nombre: 'PANETONES', descripcion: '', estado: 'Activo' },
  { id: 5, nombre: 'DEGUSTACION ALIMENTOS', descripcion: '', estado: 'Activo' },
  { id: 6, nombre: 'FANNY', descripcion: '', estado: 'Activo' },
  { id: 7, nombre: 'FRUGELE MIX', descripcion: '', estado: 'Activo' },
  { id: 8, nombre: 'TODINNO', descripcion: '', estado: 'Activo' },
  { id: 9, nombre: 'SIN CATEGORIA', descripcion: '', estado: 'Activo' },
];

const tiposMercaderia = [
  { id: 1, categoria_id: 1, categoria_nombre: 'ABARROTES', nombre: 'ACTIVOS', estado: 'Activo' },
  { id: 2, categoria_id: 1, categoria_nombre: 'ABARROTES', nombre: 'CANJES', estado: 'Activo' },
  { id: 3, categoria_id: 1, categoria_nombre: 'ABARROTES', nombre: 'MERCARISMO', estado: 'Activo' },
  { id: 4, categoria_id: 2, categoria_nombre: 'CONFITES', nombre: 'ACTIVOS', estado: 'Activo' },
  { id: 5, categoria_id: 2, categoria_nombre: 'CONFITES', nombre: 'CANJES', estado: 'Activo' },
  { id: 6, categoria_id: 2, categoria_nombre: 'CONFITES', nombre: 'MERCARISMO', estado: 'Activo' },
  { id: 7, categoria_id: 2, categoria_nombre: 'CONFITES', nombre: 'CRUCERISMO', estado: 'Activo' },
  { id: 8, categoria_id: 2, categoria_nombre: 'CONFITES', nombre: 'MERCADERISMO', estado: 'Activo' },
  { id: 9, categoria_id: 3, categoria_nombre: 'MASCOTAS', nombre: 'ACTIVOS', estado: 'Activo' },
  { id: 10, categoria_id: 3, categoria_nombre: 'MASCOTAS', nombre: 'CANJES', estado: 'Activo' },
  { id: 11, categoria_id: 3, categoria_nombre: 'MASCOTAS', nombre: 'MERCARISMO', estado: 'Activo' },
  { id: 12, categoria_id: 4, categoria_nombre: 'PANETONES', nombre: 'ACTIVOS', estado: 'Activo' },
  { id: 13, categoria_id: 4, categoria_nombre: 'PANETONES', nombre: 'CANJES', estado: 'Activo' },
  { id: 14, categoria_id: 5, categoria_nombre: 'DEGUSTACION ALIMENTOS', nombre: 'ACTIVOS', estado: 'Activo' },
  { id: 15, categoria_id: 6, categoria_nombre: 'FANNY', nombre: 'ACTIVOS', estado: 'Activo' },
  { id: 16, categoria_id: 6, categoria_nombre: 'FANNY', nombre: 'DEGUSTACION', estado: 'Activo' },
  { id: 17, categoria_id: 7, categoria_nombre: 'FRUGELE MIX', nombre: 'ACTIVOS', estado: 'Activo' },
  { id: 18, categoria_id: 7, categoria_nombre: 'FRUGELE MIX', nombre: 'CANJES', estado: 'Activo' },
  { id: 19, categoria_id: 8, categoria_nombre: 'TODINNO', nombre: 'ACTIVOS', estado: 'Activo' },
  { id: 20, categoria_id: 8, categoria_nombre: 'TODINNO', nombre: 'CANJES', estado: 'Activo' },
  { id: 21, categoria_id: 9, categoria_nombre: 'SIN CATEGORIA', nombre: 'ACTIVOS', estado: 'Activo' },
];

const skusActuales = [
  {
    id: 1,
    nombre: 'AFICHE ENMICADO ABARROTES',
    codigo: '',
    categoria_id: 1,
    categoria_nombre: 'ABARROTES',
    tipo_mercaderia_id: 1,
    tipo_mercaderia_nombre: 'ACTIVOS',
    zona: 'LIMA',
    unidad: 'kg',
    tiene_lote: 'Si',
    tiene_vencimiento: 'Si',
    activo: 'Activo',
  },
  {
    id: 2,
    nombre: 'AFICHE ENMICADO FANNY',
    codigo: '',
    categoria_id: 1,
    categoria_nombre: 'ABARROTES',
    tipo_mercaderia_id: 1,
    tipo_mercaderia_nombre: 'ACTIVOS',
    zona: 'LIMA',
    unidad: '',
    tiene_lote: 'No',
    tiene_vencimiento: 'No',
    activo: 'Activo',
  },
  {
    id: 212,
    nombre: 'BALANZA DE MANO',
    codigo: '',
    categoria_id: 9,
    categoria_nombre: 'SIN CATEGORIA',
    tipo_mercaderia_id: '',
    tipo_mercaderia_nombre: '',
    zona: 'LIMA',
    unidad: '',
    tiene_lote: 'No',
    tiene_vencimiento: 'No',
    activo: 'Activo',
  },
  {
    id: 217,
    nombre: 'COCHE SIN CATEGORIA',
    codigo: '',
    categoria_id: 9,
    categoria_nombre: 'SIN CATEGORIA',
    tipo_mercaderia_id: '',
    tipo_mercaderia_nombre: '',
    zona: 'LIMA',
    unidad: '',
    tiene_lote: 'No',
    tiene_vencimiento: 'No',
    activo: 'Activo',
  },
  {
    id: 229,
    nombre: 'MATERIAL DEGUSTACION FANNY',
    codigo: '',
    categoria_id: 6,
    categoria_nombre: 'FANNY',
    tipo_mercaderia_id: 16,
    tipo_mercaderia_nombre: 'DEGUSTACION',
    zona: 'LIMA',
    unidad: '',
    tiene_lote: 'No',
    tiene_vencimiento: 'No',
    activo: 'Activo',
  },
  {
    id: 224,
    nombre: 'BANDEJA DEGUSTACION FRUGELE',
    codigo: '',
    categoria_id: 7,
    categoria_nombre: 'FRUGELE MIX',
    tipo_mercaderia_id: 17,
    tipo_mercaderia_nombre: 'ACTIVOS',
    zona: 'LIMA',
    unidad: '',
    tiene_lote: 'Si',
    tiene_vencimiento: 'Si',
    activo: 'Activo',
  },
];

const filasCarga = [
  {
    operacion: 'ACTUALIZAR',
    nombre_referencia: 'AFICHE ENMICADO ABARROTES',
    nombre: 'AFICHE ENMICADO ABARROTES - PRUEBA',
    codigo: 'TEST-UPD-001',
    categoria: 'ABARROTES',
    tipo_mercaderia: 'ACTIVOS',
    zona: 'LIMA',
    unidad: 'kg',
    tiene_lote: 'SI',
    tiene_vencimiento: 'SI',
    activo: 'SI',
  },
  {
    operacion: 'CREAR',
    nombre_referencia: '',
    nombre: 'SKU PRUEBA ABARROTES',
    codigo: 'TEST-ABAR-001',
    categoria: 'ABARROTES',
    tipo_mercaderia: 'ACTIVOS',
    zona: 'LIMA',
    unidad: 'unidad',
    tiene_lote: 'NO',
    tiene_vencimiento: 'NO',
    activo: 'SI',
  },
  {
    operacion: 'CREAR',
    nombre_referencia: '',
    nombre: 'SKU PRUEBA FANNY DEGUSTACION',
    codigo: 'TEST-FANNY-001',
    categoria: 'FANNY',
    tipo_mercaderia: 'DEGUSTACION',
    zona: 'PROVINCIA',
    unidad: 'caja',
    tiene_lote: 'SI',
    tiene_vencimiento: 'SI',
    activo: 'SI',
  },
  {
    operacion: 'CREAR',
    nombre_referencia: '',
    nombre: 'SKU PRUEBA SIN TIPO',
    codigo: 'TEST-SIN-TIPO-001',
    categoria: 'SIN CATEGORIA',
    tipo_mercaderia: '',
    zona: 'LIMA',
    unidad: 'unidad',
    tiene_lote: 'NO',
    tiene_vencimiento: 'NO',
    activo: 'SI',
  },
];

function buildInstructionSheet(workbook) {
  const worksheet = workbook.addWorksheet('Instrucciones', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const columns = [
    { header: 'CAMPO', key: 'campo', width: 28 },
    { header: 'DETALLE', key: 'detalle', width: 96 },
  ];

  prepareWorksheet(worksheet, columns);
  addWorksheetRows(worksheet, columns, [
    { campo: 'OPERACION', detalle: 'Usa CREAR para nuevos SKUs y ACTUALIZAR para modificar existentes.' },
    { campo: 'NOMBRE_REFERENCIA', detalle: 'Solo para ACTUALIZAR. Es el nombre actual del SKU tal como aparece en SKUs_Actuales.' },
    { campo: 'CATEGORIA', detalle: 'Usa el nombre de la categoria tal como aparece en la hoja Categorias.' },
    { campo: 'TIPO_MERCADERIA', detalle: 'Es opcional. Si se completa, debe pertenecer a la misma categoria.' },
    { campo: 'ZONA', detalle: 'Valores permitidos: LIMA o PROVINCIA.' },
    { campo: 'TIENE_LOTE / TIENE_VENCIMIENTO / ACTIVO', detalle: 'Acepta SI/NO, 1/0, TRUE/FALSE.' },
    { campo: 'FILA DE ACTUALIZACION', detalle: 'La fila de actualizacion usa el nombre actual del SKU. Si no existe en tu ambiente, cambialo por uno real.' },
  ]);
}

async function main() {
  const workbook = createWorkbook();

  const cargaSheet = workbook.addWorksheet('Carga_SKUs', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const cargaColumns = [
    { header: 'OPERACION', key: 'operacion', width: 16 },
    { header: 'NOMBRE_REFERENCIA', key: 'nombre_referencia', width: 38 },
    { header: 'NOMBRE', key: 'nombre', width: 38 },
    { header: 'CODIGO', key: 'codigo', width: 18 },
    { header: 'CATEGORIA', key: 'categoria', width: 24 },
    { header: 'TIPO_MERCADERIA', key: 'tipo_mercaderia', width: 24 },
    { header: 'ZONA', key: 'zona', width: 14 },
    { header: 'UNIDAD', key: 'unidad', width: 16 },
    { header: 'TIENE_LOTE', key: 'tiene_lote', width: 14 },
    { header: 'TIENE_VENCIMIENTO', key: 'tiene_vencimiento', width: 18 },
    { header: 'ACTIVO', key: 'activo', width: 12 },
  ];
  prepareWorksheet(cargaSheet, cargaColumns);
  addWorksheetRows(cargaSheet, cargaColumns, filasCarga);

  buildInstructionSheet(workbook);

  const categoriasSheet = workbook.addWorksheet('Categorias', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const categoriasColumns = [
    { header: 'NOMBRE', key: 'nombre', width: 30 },
    { header: 'DESCRIPCION', key: 'descripcion', width: 40 },
    { header: 'ESTADO', key: 'estado', width: 14 },
    { header: 'ID', key: 'id', width: 10 },
  ];
  prepareWorksheet(categoriasSheet, categoriasColumns);
  addWorksheetRows(categoriasSheet, categoriasColumns, categorias);

  const tiposSheet = workbook.addWorksheet('Tipos_Mercaderia', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const tiposColumns = [
    { header: 'NOMBRE_REFERENCIA', key: 'nombre_referencia', width: 34 },
    { header: 'CATEGORIA', key: 'categoria_nombre', width: 28 },
    { header: 'NOMBRE', key: 'nombre', width: 28 },
    { header: 'ESTADO', key: 'estado', width: 14 },
    { header: 'CATEGORIA_ID', key: 'categoria_id', width: 14 },
    { header: 'ID', key: 'id', width: 10 },
  ];
  prepareWorksheet(tiposSheet, tiposColumns);
  addWorksheetRows(tiposSheet, tiposColumns, tiposMercaderia.map((row) => ({
    ...row,
    nombre_referencia: `${row.nombre}${row.nombre === 'ACTIVOS' || row.nombre === 'CANJES' ? ` | ${row.categoria_nombre}` : ''}`,
  })));

  const skusSheet = workbook.addWorksheet('SKUs_Actuales', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const skusColumns = [
    { header: 'NOMBRE_REFERENCIA', key: 'nombre_referencia', width: 40 },
    { header: 'NOMBRE', key: 'nombre', width: 34 },
    { header: 'CODIGO', key: 'codigo', width: 18 },
    { header: 'CATEGORIA', key: 'categoria_nombre', width: 24 },
    { header: 'TIPO_MERCADERIA', key: 'tipo_mercaderia_nombre', width: 24 },
    { header: 'ZONA', key: 'zona', width: 14 },
    { header: 'UNIDAD', key: 'unidad', width: 14 },
    { header: 'TIENE_LOTE', key: 'tiene_lote', width: 14 },
    { header: 'TIENE_VENCIMIENTO', key: 'tiene_vencimiento', width: 18 },
    { header: 'ACTIVO', key: 'activo', width: 12 },
    { header: 'CATEGORIA_ID', key: 'categoria_id', width: 14 },
    { header: 'TIPO_MERCADERIA_ID', key: 'tipo_mercaderia_id', width: 18 },
    { header: 'ID', key: 'id', width: 10 },
  ];
  prepareWorksheet(skusSheet, skusColumns);
  addWorksheetRows(skusSheet, skusColumns, skusActuales.map((row) => ({
    ...row,
    nombre_referencia: row.nombre,
  })));

  const outputDir = path.join(__dirname, '..', 'outputs');
  const outputPath = path.join(outputDir, 'plantilla_carga_skus_prueba_simple.xlsx');
  await fs.mkdir(outputDir, { recursive: true });
  await workbook.xlsx.writeFile(outputPath);

  const verificationWorkbook = new ExcelJS.Workbook();
  await verificationWorkbook.xlsx.readFile(outputPath);
  const resumen = verificationWorkbook.worksheets.map((sheet) => ({
    name: sheet.name,
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
  }));

  console.log(JSON.stringify({ outputPath, sheets: resumen }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
