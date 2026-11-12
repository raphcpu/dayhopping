import { Alert, type AlertButton, Platform } from 'react-native';
import { showMenu } from '@/components/Menu';

/**
 * Wie Alert.alert, funktioniert aber auch im Browser (dort ist Alert.alert wirkungslos):
 * ein Knopf → Hinweis, Abbrechen + eine Aktion → Bestätigung, mehr → Auswahlblatt.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') return Alert.alert(title, message, buttons);
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  if (actions.length <= 1 && (buttons ?? []).length <= 1) {
    window.alert(text);
    actions[0]?.onPress?.();
    return;
  }
  if (actions.length === 1) {
    if (window.confirm(text)) actions[0].onPress?.();
    return;
  }
  showMenu({
    title,
    message,
    options: actions.map((b) => ({ text: b.text ?? 'OK', destructive: b.style === 'destructive', onPress: () => b.onPress?.() })),
  });
}
