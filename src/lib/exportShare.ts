// Teilen von Exporten und Dateien (Android/iOS): Datei anlegen und Teilen-Dialog öffnen
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export async function shareTextFile(name: string, content: string, mimeType: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

export async function shareHtmlAsPdf(name: string, html: string) {
  const { uri } = await Print.printToFileAsync({ html });
  const target = new File(Paths.cache, name);
  if (target.exists) target.delete();
  new File(uri).move(target);
  await Sharing.shareAsync(target.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}

/** Lädt eine Datei (z. B. aus der Collage) und öffnet den Teilen-Dialog zum Sichern oder Weitergeben. */
export async function shareRemoteFile(url: string, name: string) {
  const target = new File(Paths.cache, name);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(url, target);
  await Sharing.shareAsync(file.uri);
}
