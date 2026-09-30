// Shape of Claude's TGS analysis. Shared by the API route (as the JSON Schema
// Claude must follow) and the screens (as a TypeScript type).

export const tgsAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    site: {
      type: "object",
      additionalProperties: false,
      properties: {
        street: { type: "string", description: "Street where the works are, e.g. Swanston Street" },
        extent: { type: "string", description: "Section affected, e.g. between La Trobe St and Little La Trobe St" },
        area: { type: "string", description: "Suburb, city or landmarks, if shown" },
      },
      required: ["street", "extent", "area"],
    },
    closure_type: { type: "string", enum: ["road closed", "lanes closed", "footpath only", "ramp closed", "unspecified"] },
    work_hours: { type: "string", description: "Days and hours of the works as written anywhere on the plan (title block, notes, legend or inset maps), or 'not shown'" },
    work_days: { type: "string", description: "Days the works run, e.g. 'Monday' or 'Monday to Friday'. Empty string if not shown" },
    work_start: { type: "string", description: "Start time in 24-hour HH:MM, e.g. '07:00'. Empty string if not shown" },
    work_end: { type: "string", description: "End time in 24-hour HH:MM, e.g. '22:00'. Empty string if not shown" },
    lanes_per_direction: { type: "integer", description: "Normal lanes in the affected direction. 0 if not shown" },
    lanes_open: { type: "integer", description: "Lanes left open in that direction while works are active. 0 if fully closed or not shown" },
    direction_closed: { type: "boolean", description: "True if every car lane in the affected direction is closed while works are active, so all traffic in that direction must detour, e.g. 'Southbound closed'. False if a lane stays open or it is not clear" },
    detour: { type: "string", description: "Vehicle detour route, or 'none shown'" },
    plan_elements: {
      type: "array",
      description: "4 to 8 short findings a planner would tick off, e.g. 'Work zone identified: Swanston St, La Trobe to Little La Trobe'",
      items: { type: "string" },
    },
    equipment: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string", description: "e.g. VMS board, water-filled barrier, footpath closed sign, traffic controller" },
          count: { type: "integer", description: "Number shown on the plan. 0 if a count can't be read" },
          detail: { type: "string", description: "Message text, position or purpose" },
        },
        required: ["item", "count", "detail"],
      },
    },
    pedestrian_management: { type: "array", items: { type: "string" } },
    scan_points: {
      type: "array",
      description: "Places the planner must scan on site because the plan assumes there is enough space there",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Short label, 2 to 5 words, e.g. 'Northern taper'" },
          location: { type: "string", description: "Where on site, using street names and landmarks" },
          reason: { type: "string", description: "What the plan assumes here that the scan must confirm" },
          capture: { type: "string", description: "What the scan must include, e.g. both kerbs and the full footpath width" },
        },
        required: ["name", "location", "reason", "capture"],
      },
    },
    uncertainties: { type: "array", description: "Anything unclear or missing on the plan", items: { type: "string" } },
  },
  required: [
    "site", "closure_type", "work_hours", "work_days", "work_start", "work_end", "lanes_per_direction", "lanes_open", "direction_closed", "detour",
    "plan_elements", "equipment", "pedestrian_management", "scan_points", "uncertainties",
  ],
} as const;

export type TgsAnalysis = {
  site: { street: string; extent: string; area: string };
  closure_type: "road closed" | "lanes closed" | "footpath only" | "ramp closed" | "unspecified";
  work_hours: string;
  work_days: string;
  work_start: string;
  work_end: string;
  lanes_per_direction: number;
  lanes_open: number;
  direction_closed?: boolean; // missing in analyses saved before 30 Sep
  detour: string;
  plan_elements: string[];
  equipment: { item: string; count: number; detail: string }[];
  pedestrian_management: string[];
  scan_points: { name: string; location: string; reason: string; capture: string }[];
  uncertainties: string[];
};
