import { loadProfile } from '../lib/profile';

// The player's picture next to his first name (Sascha 16.10.2026: "on the scorecard, the leaderboard and so on") –
// the profile photo (from Google or chosen in the app) for the phone's owner, the initial for everyone else.

export function Avatar(props: { name: string; me?: boolean; size?: number }) {
  const size = props.size ?? 28;
  const photo = props.me ? loadProfile().photo : undefined;
  const initial = props.name.trim().charAt(0).toUpperCase() || '?';
  return photo ? (
    <img className="avatar" src={photo} alt="" width={size} height={size} style={{ width: size, height: size }} referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar initial" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}>
      {initial}
    </span>
  );
}
