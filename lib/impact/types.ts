// The impact contract. Every impact model takes an ImpactRequest and returns an
// ImpactResult, so the report never depends on how a model works inside.
// Written up for model builders in model/IMPACT_CONTRACT.md. Keep the two in step.

export type ClosureType = "road closed" | "lanes closed" | "footpath only" | "ramp closed" | "unspecified";

// What the TGS says, plus facts about the site. Built by lib/impact/request.ts.
export type ImpactRequest = {
  site: {
    street: string;            // e.g. "Swanston Street"
    extent: string;            // e.g. "between La Trobe St and Little La Trobe St"
    area: string;
    lat: number | null;
    lon: number | null;
    scats_site_no: number | null;   // nearest SCATS signal site
    scats_site_name: string | null; // e.g. "SWANSTON/LATROBE"
    daily_volume: number | null;    // average weekday vehicles at that site, all approaches
    tram_route: boolean;            // trams run on the affected street
  };
  closure_type: ClosureType;
  work_hours: {
    text: string;              // as written on the plan, e.g. "Monday 7am to 10pm"
    days: string;              // e.g. "Monday", or "" if not shown
    start_hour: number | null; // 0 to 23, local time
    end_hour: number | null;   // 1 to 24, local time. Less than start_hour means overnight
  };
  lanes_per_direction: number;
  lanes_open: number;          // 0 when the road is closed
  direction_closed: boolean;   // every car lane in the affected direction is closed, so that direction detours
  detour: string;
  pedestrian_management: string[];
};

// A spread of likely values, never a single number. `typical` is the middle case.
export type Range = { low: number; typical: number; high: number; unit: string };

export type Severity = "High" | "Moderate" | "Low" | "Review required" | "Not modelled";

export type ModeId = "cars" | "pedestrians" | "public_transport" | "trucks";

export type ModeImpact = {
  // "not modelled" means the model says nothing about this mode. Leave the metrics out.
  status: "modelled" | "not modelled";
  delay?: Range;             // vehicle-hours over the works period
  max_queue?: Range;         // metres
  forced_diversions?: Range; // vehicles that take another route
  detour?: Range;            // extra distance per diverted trip, metres
  other?: { label: string; range: Range }[]; // anything else, e.g. tram trips affected
  summary: string;           // one plain sentence for the report
  // Filled in by lib/impact/severity.ts from the written rule. Models leave these out.
  severity?: Severity;
  severity_reason?: string;
};

// A gap in the plan that a model found on the way, such as a street the closure
// turns into a dead end or a bus route that uses the closed lane. It shows under
// its mode on the report and as a recommended action. It does not change a rating.
export type Finding = {
  mode: ModeId;
  title: string;             // the action, imperative, under 8 words
  summary: string;           // one or two sentences: what is wrong and where
  impact: string;            // what happens on site if nothing changes
  why: string;               // why it matters, and the evidence
  recommendation: string;    // what to change before deployment
  source: string;            // the data it came from, e.g. "Bus routes from OpenStreetMap"
};

export type ImpactResult = {
  model: string;             // id of the model that produced it, e.g. "mvm", "sumo"
  method: string;            // shown on the report, e.g. "SUMO traffic simulation"
  label: string | null;      // e.g. "Early result". Shown next to the method
  provenance: "live" | "precomputed" | "fixture";
  confidence: "low" | "medium" | "high";
  confidence_note: string;
  period: string;            // the time the numbers cover, e.g. "Monday 7am to 10pm"
  recommended_window: { window: string; reason: string } | null;
  modes: Record<ModeId, ModeImpact>;
  assumptions: string[];
  visual?: {                 // optional picture or animation of the model at work, shown under "How this was estimated"
    src: string;             // path under public/, e.g. "/assets/sumo-swanston-5pm.gif"
    width: number;           // pixel size of the file
    height: number;
    alt: string;
    caption: string;
    legend: { label: string; colour: string }[];
  };
  findings?: Finding[];      // optional plan gaps found from the model's own data
  overall?: { severity: Severity; reason: string }; // filled in by the severity rule
  generated_at?: string;     // ISO time the result was made
};

// Every model is one function with this signature.
export type ImpactModel = {
  id: string;
  method: string;
  estimate: (request: ImpactRequest) => Promise<ImpactResult>;
};
