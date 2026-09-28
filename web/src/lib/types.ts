export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'rescheduled'
  | 'cancelled'
  | 'needs_followup'
  | 'no_answer';

export type Appointment = {
  id: string;
  owner_id: string;
  client_name: string;
  client_phone: string;
  service: string;
  provider: string | null;
  starts_at: string;
  duration_minutes: number;
  notes: string | null;
  status: AppointmentStatus;
  rescheduled_from: string | null;
  last_call_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CallStatus =
  | 'queued'
  | 'ringing'
  | 'in_progress'
  | 'analyzing'
  | 'completed'
  | 'failed'
  | 'no_answer'
  | 'busy'
  | 'transferred';

export type CallAnalysis = {
  outcome: string;
  rescheduled_to: string | null;
  sentiment: string;
  summary: string;
  client_requests: string[];
  follow_up_actions: string[];
  risk_flags: string[];
  no_show_risk: 'low' | 'medium' | 'high';
  confidence: number;
  model: string;
  latency_ms: number;
};

export type Call = {
  id: string;
  owner_id: string;
  appointment_id: string | null;
  channel: 'phone' | 'web';
  twilio_call_sid: string | null;
  status: CallStatus;
  outcome: string | null;
  sentiment: string | null;
  summary: string | null;
  analysis: CallAnalysis | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
  appointments?: Pick<Appointment, 'client_name' | 'service' | 'starts_at' | 'client_phone'> | null;
};

export type CallTurn = {
  id: number;
  call_id: string;
  role: 'agent' | 'client' | 'system';
  content: string;
  model: string | null;
  tier: string | null;
  latency_ms: number | null;
  created_at: string;
};

export type Business = {
  id: string;
  owner_id: string;
  name: string;
  business_type: string;
  timezone: string;
  agent_name: string;
  agent_persona: string;
  policies: string;
  opening_hour: number;
  closing_hour: number;
  slot_minutes: number;
  front_desk_phone: string | null;
};

export type InsightReport = {
  id: string;
  model: string;
  calls_analyzed: number;
  created_at: string;
  report: {
    headline: string;
    highlights: string[];
    patterns: { title: string; detail: string }[];
    recommendations: { title: string; detail: string; impact: 'high' | 'medium' | 'low' }[];
    at_risk: { client: string; reason: string }[];
    script_suggestions: string[];
  };
};

export type Health = {
  ok: boolean;
  twilio: boolean;
  provider: string;
  models: { fast: string; smart: string; reasoning: string };
};
