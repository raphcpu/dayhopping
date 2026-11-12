import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

// Web: Der Browser schiebt Eingabefelder selbst über die Tastatur.
export function KeyboardProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

type Props = ViewProps & { behavior?: string; automaticOffset?: boolean; keyboardVerticalOffset?: number };
export function KeyboardAvoidingView({ behavior: _b, automaticOffset: _a, keyboardVerticalOffset: _k, ...rest }: Props) {
  return <View {...rest} />;
}
