// Web: Dateien herunterladen bzw. über das Teilen-Menü des Browsers weitergeben
function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function shareTextFile(name: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const file = new File([blob], name, { type: mimeType });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: name }).catch(() => download(name, blob));
  } else download(name, blob);
}

/** Web: Bericht in einem neuen Fenster öffnen und drucken; dort „Als PDF sichern“ wählen. */
export async function shareHtmlAsPdf(_name: string, html: string) {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Bitte erlaube Pop-ups für DayHop, um den Bericht zu öffnen.');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

export async function shareRemoteFile(url: string, name: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file] });
    download(name, blob);
  } catch {
    window.open(url, '_blank');
  }
}
