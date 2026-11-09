// Datenbank-Zeilen und der Zustand, den die API an den Browser liefert.

export type SessionStatus = "open" | "assigning" | "closed";
export type ReceiptStatus = "none" | "processing" | "ready" | "error";
export type MatchStatus = "idle" | "running" | "error";

export interface SessionRow {
  id: string;
  code: string;
  title: string;
  host_user_id: string;
  tip_percent: number;
  currency: string;
  status: SessionStatus;
  receipt_status: ReceiptStatus;
  receipt_error: string | null;
  receipt_total: number | null;
  receipt_images: string[];
  restaurant_name: string | null;
  match_status: MatchStatus;
  match_error: string | null;
  matched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParticipantRow {
  id: string;
  session_id: string;
  user_id: string;
  name: string;
  is_host: boolean;
  confirmed_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export type MessageKind = "user" | "ai" | "question" | "system";

/** Eine Antwortmöglichkeit auf eine KI-Rückfrage. Wählen legt diese Zuordnungen an. */
export interface QuestionOption {
  label: string;
  assignments: { item_id: string; quantity: number }[];
}

/** Eine auf einem Tellerfoto erkannte Speise (Koordinaten relativ 0..1). */
export interface DetectedDish {
  label: string;
  quantity: number;
  box: { x: number; y: number; w: number; h: number } | null;
  selected: boolean;
}

export interface MessageMeta {
  options?: QuestionOption[];
  answer_label?: string;
  notes_added?: string[];
  dishes?: DetectedDish[];
  photo_status?: "analyzing" | "review" | "confirmed" | "error";
  [key: string]: unknown;
}

export interface MessageRow {
  id: string;
  session_id: string;
  participant_id: string | null;
  kind: MessageKind;
  body: string;
  recipient_id: string | null;
  question_status: "open" | "answered" | "dismissed" | null;
  ai_status: "pending" | "done" | "error" | null;
  image_path: string | null;
  meta: MessageMeta;
  created_at: string;
}

export interface NoteRow {
  id: string;
  session_id: string;
  participant_id: string;
  message_id: string | null;
  description: string;
  quantity: number;
  variant: string | null;
  shared_with: string[];
  source: "chat" | "photo";
  created_at: string;
}

export interface ItemRow {
  id: string;
  session_id: string;
  position: number;
  name_original: string;
  name_de: string | null;
  quantity: number;
  total_price: number;
  created_at: string;
}

export type ClaimSource = "ai" | "manual" | "split";

export interface ClaimRow {
  id: string;
  session_id: string;
  item_id: string;
  participant_id: string;
  quantity: number;
  source: ClaimSource;
  created_at: string;
  updated_at: string;
}

/** Kompletter Zustand einer Runde aus Sicht einer Person. */
export interface SessionState {
  session: SessionRow;
  participants: ParticipantRow[];
  messages: MessageRow[];
  notes: NoteRow[];
  items: ItemRow[];
  claims: ClaimRow[];
  me: ParticipantRow;
  /** Kurzlebige, signierte URLs für Fotos (message_id → URL) */
  photoUrls: Record<string, string>;
  /** Signierte URLs der Kassenzettel-Fotos */
  receiptUrls: string[];
}
