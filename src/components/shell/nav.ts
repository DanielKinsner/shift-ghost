import { Activity, ClipboardList, GitBranch, Mic, ScrollText, Settings, Sunrise, Users, MapPin, type LucideIcon } from "lucide-react";
import type { Permission } from "@/domain/permissions";
import type { Role } from "@/domain/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  group: "shift" | "ops";
}

export const NAV: NavItem[] = [
  { href: "/briefing", label: "Brief", icon: Sunrise, permission: "view_briefing", group: "shift" },
  { href: "/capture", label: "Closeout", icon: Mic, permission: "capture", group: "shift" },
  { href: "/handoffs", label: "Handoffs", icon: ClipboardList, permission: "view_briefing", group: "shift" },
  { href: "/patterns", label: "Patterns", icon: Activity, permission: "view_patterns", group: "shift" },
  { href: "/rules", label: "Rules", icon: GitBranch, permission: "view_rules", group: "ops" },
  { href: "/locations", label: "Stores", icon: MapPin, permission: "view_locations", group: "ops" },
  { href: "/team", label: "Team", icon: Users, permission: "view_team", group: "ops" },
  { href: "/audit", label: "Audit", icon: ScrollText, permission: "view_audit", group: "ops" },
  { href: "/settings", label: "Settings", icon: Settings, permission: "view_team", group: "ops" },
];

/** Where each role lands when the demo switches to them. */
export const LANDING: Record<Role, string> = {
  closing_manager: "/capture",
  opening_manager: "/briefing",
  kitchen_lead: "/briefing",
  area_manager: "/patterns",
  crew: "/capture",
};
