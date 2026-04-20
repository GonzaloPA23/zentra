const ExcelJS = require('exceljs');

function sanitizeSheetName(value = 'Datos') {
  return String(value).replace(/[\\/*?:[\]]/g, '').slice(0, 31) || 'Datos';
}

function sanitizeFileName(value = 'export') {
  return String(value)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'export';
}

function getColumnLetter(index) {
  let current = index + 1;
  let result = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

function applyHeaderStyle(cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1F4E78' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = {
    top: { style: 'thin', color: { argb: 'D9E2F3' } },
    left: { style: 'thin', color: { argb: 'D9E2F3' } },
    bottom: { style: 'thin', color: { argb: 'D9E2F3' } },
    right: { style: 'thin', color: { argb: 'D9E2F3' } },
  };
}

function applyBodyStyle(cell) {
  cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: 'E5E7EB' } },
    left: { style: 'thin', color: { argb: 'E5E7EB' } },
    bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
    right: { style: 'thin', color: { argb: 'E5E7EB' } },
  };
}

async function sendExcelWorkbook(res, {
  fileName,
  sheetName,
  columns = [],
  rows = [],
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ZENTRA';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sanitizeSheetName(sheetName), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width || 18,
    style: column.style || {},
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => applyHeaderStyle(cell));

  rows.forEach((row) => {
    const excelRow = worksheet.addRow(row);
    excelRow.eachCell((cell, columnNumber) => {
      applyBodyStyle(cell);

      const column = columns[columnNumber - 1];
      if (!column) return;

      if (column.type === 'date' && cell.value) {
        cell.numFmt = 'dd/mm/yyyy';
      }
      if (column.type === 'datetime' && cell.value) {
        cell.numFmt = 'dd/mm/yyyy hh:mm';
      }
      if (column.type === 'number' && cell.value !== null && cell.value !== undefined && cell.value !== '') {
        cell.numFmt = '#,##0.00';
      }
      if (column.type === 'integer' && cell.value !== null && cell.value !== undefined && cell.value !== '') {
        cell.numFmt = '#,##0';
      }
    });
  });

  worksheet.autoFilter = {
    from: 'A1',
    to: `${getColumnLetter(columns.length - 1)}1`,
  };

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${sanitizeFileName(fileName)}.xlsx"`
  );

  await workbook.xlsx.write(res);
  res.end();
}

module.exports = {
  sendExcelWorkbook,
};
