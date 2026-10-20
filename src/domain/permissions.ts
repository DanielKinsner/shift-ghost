import type { Role, User } from "./types";

export type Permission =
  | "capture"
  | "review_handoff"
  | "view_briefing"
  | "act_on_tasks"
  | "escalate"
  | "view_patterns"
  | "view_all_locations"
  | "view_rules"
  | "edit_rules"
  | "view_locations"
  | "edit_locations"
  | "view_team"
  | "manage_team"
  | "view_audit"
  | "edit_settings"
  | "delete_recordings"
  | "run_setup";

const MATRIX: Record<Role, Permission[]> = {
  area_manager: [
    "capture", "review_handoff", "view_briefing", "act_on_tasks", "escalate", "view_patterns",
    "view_all_locations", "view_rules", "edit_rules", "view_locations", "edit_locations",
    "view_team", "manage_team", "view_audit", "edit_settings", "delete_recordings", "run_setup",
  ],
  closing_manager: [
    "capture", "review_handoff", "view_briefing", "act_on_tasks", "escalate", "view_patterns",
    "view_rules", "view_locations", "view_team", "view_audit", "delete_recordings",
  ],
  opening_manager: [
    "capture", "review_handoff", "view_briefing", "act_on_tasks", "escalate", "view_patterns",
    "view_rules", "view_locations", "view_team", "view_audit",
  ],
  kitchen_lead: ["capture", "view_briefing", "act_on_tasks", "escalate", "view_team"],
  crew: ["capture", "view_briefing"],
};

export function can(user: Pick<User, "role"> | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return MATRIX[user.role].includes(permission);
}

export const ROLE_TITLE: Record<Role, string> = {
  closing_manager: "Closing manager",
  opening_manager: "Opening manager",
  kitchen_lead: "Kitchen lead",
  area_manager: "Area manager",
  crew: "Crew",
};

/** Who can grant a permission, phrased for the permission-denied screen. */
export function whoCanGrant(permission: Permission): string {
  if (["edit_rules", "edit_locations", "manage_team", "edit_settings", "run_setup", "view_all_locations"].includes(permission)) {
    return "your area manager";
  }
  return "a store manager";
}
