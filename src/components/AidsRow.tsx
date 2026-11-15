import { tr } from '../lib/i18n';
import { ToggleRow } from './Settings';

/** "Alle Funktionen" – wind, caddie and green slopes in a tournament (Rule 4.3: off in an official one, on in an internal
 *  one; Sascha 07.11.2026). In the sheet of "Rundenart", under its choices, once "Turnier" is picked (Sascha 15.11.2026:
 *  "Die Funktionen bzgl. Caddie würde ich unter Format packen und zwar unter Rundenart") – the same in Rounds and Turnier. */
export function AidsRow(props: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <ToggleRow
      label={tr('All functions', 'Alle Funktionen')}
      text={tr('Wind, caddie and green slopes in an internal tournament – Rule 4.3 forbids them in an official one.', 'Wind, Caddie und Grün-Slopes im internen Turnier – im offiziellen verbietet sie Regel 4.3.')}
      on={props.on}
      onChange={props.onChange}
    />
  );
}
