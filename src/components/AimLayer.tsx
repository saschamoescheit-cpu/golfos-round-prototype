import type { LngLat } from '../types';
import type { HoleMapData, Unit } from '../lib/geo';
import type { ImagerySource } from '../lib/imagery';
import { offAim, offAimText } from '../lib/aim';
import { tr } from '../lib/i18n';
import { HoleMap } from './HoleMap';
import { FloatActions } from './FloatActions';

// A shot's aim on the map (Sascha 16.11.2026: "Ja, so bauen. Aber optisch … mehr im GolfOS Design, wenn man auf der Karte
// ist"): the playing view of the round – the aerial, the crosshair with its two distances, the shot from where it was
// played to where the ball ended. Dragging the crosshair saves at once; the tick goes back to the hole.

export function AimLayer(props: {
  holeLabel: string;
  par: number;
  shotNo: number; // 1-based
  club: string | null;
  data: HoleMapData;
  from: LngLat;
  end: LngLat | null;
  /** where the ball ended: the next shot's number, or "P1" on the green */
  endLabel: string;
  pin: LngLat;
  aim: LngLat;
  /** set by the player – else the assumed one (fairway middle / flag), shown the same, saved once moved */
  set: boolean;
  /** what the shot is measured against without an aim */
  assumed: 'middle' | 'flag';
  assumedAim: LngLat | null;
  unit: Unit;
  imagery: ImagerySource;
  view: 'aerial' | '2d';
  onImageryFail: () => void;
  onChange: (aim: LngLat) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const now = props.end ? offAim(props.from, props.aim, props.end) : null;
  const before = props.end && props.assumedAim ? offAim(props.from, props.assumedAim, props.end) : null;
  return (
    <div className="review-setup-layer aim-layer">
      <main className="map-screen">
        <HoleMap
          holeKey={`aim-${props.holeLabel}-${props.shotNo}`}
          data={props.data}
          player={null}
          from={props.from}
          pin={props.pin}
          targets={[props.aim]}
          unit={props.unit}
          imagery={props.imagery}
          onImageryFail={props.onImageryFail}
          view={props.view}
          clean
          hazards={false}
          camera={{ from: props.from, key: `aim-${props.shotNo}` }}
          padding={{ top: 100, bottom: 230, left: 40, right: 40 }}
          track={[
            { id: 'aim-from', pos: props.from, label: `${props.shotNo}${props.club ? ' ' + props.club : ''}` },
            ...(props.end ? [{ id: 'aim-end', pos: props.end, label: props.endLabel, green: props.endLabel.startsWith('P') }] : []),
          ]}
          onTargetsChange={(t) => t[0] && props.onChange(t[0])}
          onTargetRemove={props.onClear}
          onPinChange={() => {}}
          // a tap puts the crosshair there
          onMapTap={props.onChange}
        />
        <div className="map-top">
          <button type="button" className="map-btn round" aria-label={tr('Back to the hole', 'Zurück zum Loch')} onClick={props.onClose}>
            ✕
          </button>
          <div className="map-hole">
            <span className="map-hole-no">{tr(`Aim of shot ${props.shotNo}`, `Ziel für Schlag ${props.shotNo}`)}</span>
            <span>{tr(`Hole ${props.holeLabel} · par ${props.par}`, `Loch ${props.holeLabel} · Par ${props.par}`)}{props.club ? ` · ${props.club}` : ''}</span>
          </div>
        </div>
        <div className="map-bottom">
          <div className="setup-card with-fab aim-card">
            <strong>{now ? (props.set ? offAimText(now, 'aim') : offAimText(now, props.assumed)) : tr('Drag the crosshair to where you aimed', 'Zieh das Fadenkreuz dahin, wo du hingezielt hast')}</strong>
            <span>
              {props.set
                ? before
                  ? (props.assumed === 'flag' ? tr('Before, against the flag:', 'Vorher gegen die Fahne:') : tr('Before, against the middle:', 'Vorher gegen die Bahnmitte:')) + ' ' + offAimText(before, props.assumed).split(' · ')[0]
                  : tr('Your aim counts for the spread of this club.', 'Dein Ziel zählt für die Streuung dieses Schlägers.')
                : props.assumed === 'flag'
                  ? tr('Drag the crosshair to where you aimed – now measured against the flag.', 'Zieh das Fadenkreuz dahin, wo du hingezielt hast – jetzt gerechnet gegen die Fahne.')
                  : tr('Drag the crosshair to where you aimed – now measured against the middle of the hole.', 'Zieh das Fadenkreuz dahin, wo du hingezielt hast – jetzt gerechnet gegen die Bahnmitte.')}
            </span>
            {props.set && (
              <button type="button" className="btn-ghost aim-clear" onClick={props.onClear}>
                {tr('Remove aim – measured as assumed again', 'Ziel entfernen – wieder wie angenommen rechnen')}
              </button>
            )}
          </div>
        </div>
        <FloatActions overSheet save={{ label: tr('Done', 'Fertig'), onClick: props.onClose }} />
      </main>
    </div>
  );
}
