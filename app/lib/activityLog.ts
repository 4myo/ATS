import { supabase } from "./supabase";

export type ActivityAction =
  | "candidate_created"
  | "candidate_deleted"
  | "candidate_stage_changed"
  | "job_created"
  | "job_updated"
  | "job_deleted"
  | "job_status_changed"
  | "offer_document_created"
  | "offer_document_updated"
  | "offer_sent"
  | "offer_outcome_changed";

export type ActivityEntityType = "candidate" | "job" | "offer_document";

export type ActivityLogRow = {
  id: string;
  user_id?: string;
  action: ActivityAction | string;
  entity_type: ActivityEntityType | string;
  entity_id: string | null;
  entity_label: string | null;
  from_value: string | null;
  to_value: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ActivityEventInput = {
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  metadata?: Record<string, unknown> | null;
};

let activityLogsAvailable: boolean | null = null;

export const logActivityEvent = async ({
  action,
  entityType,
  entityId,
  entityLabel,
  fromValue,
  toValue,
  metadata,
}: ActivityEventInput) => {
  if (activityLogsAvailable === false) return;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;

    const { error } = await supabase.from("activity_logs").insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      entity_label: entityLabel ?? null,
      from_value: fromValue ?? null,
      to_value: toValue ?? null,
      metadata: metadata ?? {},
    });

    if (error) {
      activityLogsAvailable =
        !error.message?.includes("activity_logs") &&
        !error.details?.includes("activity_logs");
    } else {
      activityLogsAvailable = true;
    }
  } catch (_error) {
    // Activity logging is observational; it should never block recruiter work.
  }
};
