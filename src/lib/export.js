// Excel and PDF exports. The libraries load only when you actually export,
// so they don't slow down opening the app.

export async function exportExcel(rows, filename, sheetName = 'Loans') {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  XLSX.writeFile(book, `${filename}.xlsx`);
}

export async function exportPDF(title, columns, rows, filename) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFontSize(9);
  doc.text(`Exported ${new Date().toLocaleString('en-GB')}`, 14, 20);
  autoTable(doc, {
    startY: 25,
    head: [columns],
    body: rows,
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [15, 107, 75] },
  });
  doc.save(`${filename}.pdf`);
}
