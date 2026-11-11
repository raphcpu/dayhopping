// Die Hintergrund-Ortung muss registriert sein, bevor irgendetwas anderes lädt –
// auch wenn das System die App nur für eine Standortmeldung im Hintergrund weckt.
// Zuerst die Fehlerbehandlung, damit auch Fehler beim Laden der übrigen Module gemeldet werden.
import './src/lib/crash';
import './src/lib/tracking';
import 'expo-router/entry';
