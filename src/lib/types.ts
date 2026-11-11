export type RoundStatus = 'geplant' | 'aktiv' | 'beendet';
export type Role = 'organizer' | 'member';
export type SplitMode = 'gleich' | 'anteile' | 'betrag';

export type Profile = { id: string; display_name: string; avatar_path: string | null; color: string };

export type Round = {
  id: string; name: string; day: string; invite_code: string; status: RoundStatus;
  created_by: string; started_at: string | null; ended_at: string | null;
};

export type Member = {
  round_id: string; user_id: string; role: Role; sharing: boolean; muted: boolean; joined_at: string;
  profile: Profile;
};

export type Station = {
  id: string; round_id: string; position: number; name: string; address: string | null;
  lat: number; lng: number; radius_m: number; planned_at: string | null; note: string | null;
};

export type LiveLocation = {
  round_id: string; user_id: string; lat: number; lng: number;
  accuracy: number | null; heading: number | null; speed: number | null; recorded_at: string;
};

export type Checkin = {
  id: string; round_id: string; station_id: string; user_id: string;
  arrived_at: string; left_at: string | null; automatic: boolean;
};

export type Message = {
  id: string; round_id: string; user_id: string | null;
  kind: 'chat' | 'announcement' | 'system'; body: string; created_at: string;
};

export type ExpenseShare = { expense_id: string; user_id: string; share_cents: number; weight: number | null };

export type Expense = {
  id: string; round_id: string; station_id: string | null; title: string; amount_cents: number;
  payer_id: string; split_mode: SplitMode; created_by: string; created_at: string;
  shares: ExpenseShare[];
};

export type Settlement = {
  id: string; round_id: string; from_user: string; to_user: string; amount_cents: number; created_at: string;
};

export type Media = {
  id: string; round_id: string; user_id: string; station_id: string | null; kind: 'photo' | 'video';
  storage_path: string; thumb_path: string | null; width: number | null; height: number | null;
  duration_ms: number | null; created_at: string;
};

export type Report = {
  id: string; round_id: string; reporter_id: string; target_kind: 'message' | 'media' | 'user'; target_id: string;
  target_user: string | null; excerpt: string | null; reason: string; created_at: string; resolved_at: string | null;
};
