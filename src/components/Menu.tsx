import { useEffect, useState } from 'react';
import { Body, Button, type IconName, Sheet } from './ui';

// Auswahlmenü als Blatt von unten. Ersetzt Alert bei mehr als drei Optionen,
// weil Android-Dialoge höchstens drei Knöpfe zeigen.

export type MenuOption = { text: string; onPress: () => void; destructive?: boolean; icon?: IconName };
type MenuSpec = { title: string; message?: string; options: MenuOption[] };

// Der zuletzt eingehängte Host zeigt das Menü (z. B. der im Vollbild-Betrachter statt der im Wurzel-Layout).
const hosts: ((spec: MenuSpec) => void)[] = [];

export function showMenu(spec: MenuSpec) {
  hosts[hosts.length - 1]?.(spec);
}

export function MenuHost() {
  const [spec, setSpec] = useState<MenuSpec | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = (s: MenuSpec) => {
      setSpec(s);
      setOpen(true);
    };
    hosts.push(show);
    return () => {
      hosts.splice(hosts.indexOf(show), 1);
    };
  }, []);

  const choose = (o: MenuOption) => {
    setOpen(false);
    // erst schließen lassen: iOS zeigt sonst keinen Folgedialog
    setTimeout(o.onPress, 350);
  };

  return (
    <Sheet visible={open} onClose={() => setOpen(false)} title={spec?.title ?? ''}>
      {spec?.message ? <Body muted numberOfLines={4}>{spec.message}</Body> : null}
      {spec?.options.map((o) => (
        <Button key={o.text} title={o.text} icon={o.icon} variant={o.destructive ? 'danger' : 'soft'} onPress={() => choose(o)} />
      ))}
    </Sheet>
  );
}
