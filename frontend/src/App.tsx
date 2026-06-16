import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Database,
  Filter,
  Gauge,
  History,
  LayoutDashboard,
  MapPin,
  Quote,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { processAll, RAW_FACILITIES, highlightDescription, type ProcessedFacility } from "@/lib/facilities-data";
import { fetchOverview, fetchHospitals, fetchHospital, fetchReviewQueue, saveDecision, type Overview, type Hospital, type HospitalsResponse, type ReviewQueueResponse } from "@/lib/api";
import { useFacilityOptions } from "@/lib/facility-options";
import { Combobox } from "@/components/Combobox";
import FacilityMap from "@/components/FacilityMap";
import { useReviews } from "@/lib/review-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";


type View = "dashboard" | "queue" | "review";

interface QueueFilter {
  flag?: string;
  specialty?: string;
  state?: string;
  search?: string;
}

const NAV: Array<{ id: View; label: string; icon: typeof LayoutDashboard; hint: string }> = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard, hint: "How healthy is the data overall?" },
  { id: "queue", label: "What to review", icon: ClipboardList, hint: "Records that need a human check" },
  { id: "review", label: "Check a facility", icon: ShieldCheck, hint: "Locate a hospital, review it, and see its history" },
];

function App() {
  const processed = useMemo(() => processAll(RAW_FACILITIES), []);
  const [view, setView] = useState<View>("dashboard");
  const [reviewFacilityId, setReviewFacilityId] = useState<string | undefined>(undefined);
  const reviewsApi = useReviews();

  const openInReview = (id: string) => {
    setReviewFacilityId(id);
    setView("review");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-6 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-semibold tracking-tight">
              Data Beat Monitor
            </h1>
            <p className="text-xs text-muted-foreground">
              Check this list of {processed.length} hospitals and clinics in India before using it for planning.
            </p>
          </div>          
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-6 px-6 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-20 space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  title={item.hint}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  <span className={cn("pl-6 text-[11px] leading-snug", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {item.hint}
                  </span>
                </button>
              );
            })}
            <Separator className="my-3" />
            <div className="rounded-md border bg-card p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">How to use this</p>
              <p className="mt-1 leading-relaxed">
                Start in <b>Overview</b>, open <b>What to review</b>, then check each facility. Every warning shows you the exact text it came from — no guessing.
              </p>
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          {view === "dashboard" && <Dashboard />}
          {view === "queue" && <Queue reviewsApi={reviewsApi} onOpen={openInReview} />}
          {view === "review" && (
            <FacilityReview reviewsApi={reviewsApi} initialFacilityId={reviewFacilityId} />
          )}
        </main>
      </div>
    </div>
  );
}

// -------------------- DASHBOARD --------------------
// Live Overview, fed by datalake_dev.l1_facility_info.facility_core_details_enriched
// via the FastAPI /api/facilities/overview endpoint.
function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (refresh = false) => {
    setLoading(true);
    setError(null);
    fetchOverview(refresh)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading facility data from Databricks…
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card className="border-rose-200 bg-rose-50/50">
        <CardContent className="space-y-3 pt-6 text-sm">
          <p className="font-medium text-rose-900">Couldn't load facility data.</p>
          <p className="text-rose-800/80">{error}</p>
          <Button variant="outline" size="sm" onClick={() => load(true)}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const kpiPct = (b: { valid: number; total: number }) => (b.total ? b.valid / b.total : 0);
  const filledIn = kpiPct(data.kpis.filled_in);
  const addressOk = kpiPct(data.kpis.address_ok);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Can you trust this data?</h2>
        <p className="text-sm text-muted-foreground">
          A health check of {data.total.toLocaleString()} facilities from{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">facility_core_details_enriched</code>.
          The status columns below show how much of the data looks good.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricTile
          label="Filled in"
          value={pct(filledIn)}
          tone={tone(filledIn, [0.85, 0.65])}
          hint={`Share of all ${data.kpis.filled_in.checks} status checks that pass across every facility`}
        />
        <MetricTile
          label="Address looks right"
          value={pct(addressOk)}
          tone={tone(addressOk, [0.85, 0.65])}
          hint={`Share of the ${data.kpis.address_ok.checks} address checks (line, pincode, state) that pass`}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Where the facilities are</CardTitle>
            <CardDescription>Number of facilities in the top {data.by_state.length} states</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.by_state}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="state" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={80} interval={0} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Facility map</CardTitle>
          <CardDescription>
            Plotted from latitude/longitude · green = most status checks pass, red = few do
            {data.points_capped && ` · showing ${data.points.length.toLocaleString()} of ${data.total.toLocaleString()}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FacilityMap points={data.points} checks={data.status_checks} />
        </CardContent>
      </Card>
    </div>
  );
}

function MetricTile({
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "good" | "warn" | "bad";
  onClick?: () => void;
}) {
  const dotClasses = {
    good: "bg-emerald-500",
    warn: "bg-amber-500",
    bad: "bg-rose-500",
  };
  const labelText = { good: "Looks good", warn: "Check soon", bad: "Check first" };
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-left transition-all hover:shadow-md dark:border-emerald-900/60 dark:bg-emerald-950/20",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1 text-xs font-medium">
          <span className={cn("inline-block h-2 w-2 rounded-full", dotClasses[tone])} />
          {labelText[tone]}
        </span>
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </button>
  );
}

// -------------------- QUEUE (fed by final_facility_score_view) --------------------
const riskBar = (p: "High" | "Medium" | "Low") =>
  p === "High" ? "bg-rose-500" : p === "Medium" ? "bg-amber-500" : "bg-emerald-500";

function Queue({
  reviewsApi,
  onOpen,
}: {
  reviewsApi: ReturnType<typeof useReviews>;
  onOpen: (id: string) => void;
}) {
  const { states } = useFacilityOptions();
  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ReviewQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchReviewQueue(stateFilter, search.trim() || undefined)
        .then(setData)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [stateFilter, search]);

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">What to review</h2>
        <p className="text-sm text-muted-foreground">
          Facilities with contradictions, highest priority and severity first.{" "}
          {data && `Showing ${rows.length} of ${data.count.toLocaleString()}${data.capped ? " (top 200)" : ""}.`}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Combobox
            className="w-[200px]"
            options={states.map((s) => ({ value: s, label: s }))}
            value={stateFilter}
            onChange={setStateFilter}
            placeholder="Any state"
            searchPlaceholder="Search states…"
            emptyText="No states found."
            clearLabel="Any state"
          />
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by facility name"
              className="pl-9"
            />
          </div>
          {(stateFilter || search) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStateFilter(undefined);
                setSearch("");
              }}
            >
              <Filter className="mr-1 h-3 w-3" /> Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Facility</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">What's wrong</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Recommended action</th>
                  <th className="px-4 py-3">Your decision</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      Loading review queue…
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No facilities match these filters.
                    </td>
                  </tr>
                )}
                {rows.flatMap((r) => {
                  const status = reviewsApi.reviews[r.facility_id]?.status ?? "pending";
                  const conts = r.contradictions.length ? r.contradictions : [null];
                  const n = conts.length;
                  return conts.map((c, idx) => {
                    const confPct = Math.round((c?.confidence ?? 0) * 100);
                    return (
                      <tr
                        key={c ? c.id : r.id}
                        className={cn(
                          "hover:bg-muted/30",
                          idx === n - 1 ? "border-b" : "border-b border-border/30",
                        )}
                      >
                        {idx === 0 && (
                          <td rowSpan={n} className="px-4 py-3 align-top">
                            <div className="font-medium">{r.name}</div>
                            <div className="text-xs text-muted-foreground">{r.facility_id.slice(0, 8)}…</div>
                          </td>
                        )}
                        {idx === 0 && (
                          <td rowSpan={n} className="px-4 py-3 align-top text-muted-foreground">
                            {r.state || "—"}
                          </td>
                        )}
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn("h-full", c ? riskBar(c.severity) : "")}
                                style={{ width: `${confPct}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums">
                              {c?.confidence != null ? confPct + "%" : "—"}
                            </span>
                          </div>
                        </td>
                        <td className="max-w-[380px] px-4 py-3 align-top">
                          {c ? (
                            <div className="flex gap-1.5 text-xs text-muted-foreground">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                              <span>{c.whats_wrong}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {c ? (
                            <PriorityBadge priority={c.severity} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="max-w-[280px] px-4 py-3 align-top">
                          <span className="text-xs text-muted-foreground">
                            {c?.recommended_action || "—"}
                          </span>
                        </td>
                        {idx === 0 && (
                          <td rowSpan={n} className="px-4 py-3 align-top">
                            <StatusBadge status={status as "pending" | "approved" | "rejected"} />
                          </td>
                        )}
                        {idx === 0 && (
                          <td rowSpan={n} className="px-4 py-3 align-top text-right">
                            <Button size="sm" variant="outline" onClick={() => onOpen(r.facility_id)}>
                              Review
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------- FACILITY REVIEW (map locator) --------------------
const STATUS_LABELS: Record<string, string> = {
  email_status: "Email",
  office_phone_status: "Phone",
  state_status: "State",
  year_established_status: "Year",
  address_line1_status: "Address",
  pincode_status: "Pincode",
  organization_name_status: "Name",
};

function FacilityReview({
  reviewsApi,
  initialFacilityId,
}: {
  reviewsApi: ReturnType<typeof useReviews>;
  initialFacilityId?: string;
}) {
  const [city, setCity] = useState("");
  const [data, setData] = useState<HospitalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  // Facility deep-linked from the queue's Review button; may live outside the
  // current city's hospital list, so we fetch it on its own.
  const [injected, setInjected] = useState<Hospital | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchHospitals(undefined, city.trim() || undefined)
        .then((d) => {
          setData(d);
          setSelectedId((prev) =>
            prev && (d.facilities.some((f) => f.id === prev) || injected?.id === prev)
              ? prev
              : undefined,
          );
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  // Arriving from the queue: load that facility's record and select it.
  useEffect(() => {
    if (!initialFacilityId) return;
    setSelectedId(initialFacilityId);
    fetchHospital(initialFacilityId)
      .then((f) => setInjected(f))
      .catch((e) => setError(e.message));
  }, [initialFacilityId]);

  const checks = data?.checks ?? 7;
  const selected =
    (injected?.id === selectedId ? injected : null) ??
    data?.facilities.find((f) => f.id === selectedId) ??
    null;

  // Map markers: the city's hospitals, plus the deep-linked facility (if it has
  // coordinates and isn't already in the list).
  const mapPoints = useMemo(() => {
    const base = data?.facilities ?? [];
    const extra =
      injected &&
      injected.lat != null &&
      injected.lng != null &&
      !base.some((f) => f.id === injected.id)
        ? [injected]
        : [];
    return [...extra, ...base].filter(
      (f): f is Hospital & { lat: number; lng: number } => f.lat != null && f.lng != null,
    );
  }, [data, injected]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Check a facility</h2>
        <p className="text-sm text-muted-foreground">
          Search by city, then click a hospital on the map to review its record.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Search by city"
              className="pl-9"
            />
          </div>
          {city && (
            <Button variant="ghost" size="sm" onClick={() => setCity("")}>
              <Filter className="mr-1 h-3 w-3" /> Clear
            </Button>
          )}
          <div className="ml-auto text-sm text-muted-foreground">
            {loading ? "Loading…" : `${data?.count ?? 0}${data?.capped ? "+" : ""} hospitals on the map`}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="pt-6">
            {mapPoints.length > 0 ? (
              <FacilityMap
                points={mapPoints}
                checks={checks}
                height={520}
                onSelect={setSelectedId}
                selectedId={selectedId}
                fitToPoints
              />
            ) : (
              <div className="flex h-[520px] items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
                {loading ? "Loading hospitals…" : "No hospitals match these filters."}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          {selected ? (
            <FacilityDetail key={selected.id} facility={selected} checks={checks} reviewsApi={reviewsApi} />
          ) : (
            <Card className="h-full">
              <CardContent className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <MapPin className="h-6 w-6" />
                Click a hospital on the map to see its details.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function FacilityDetail({
  facility,
  checks,
  reviewsApi,
}: {
  facility: Hospital;
  checks: number;
  reviewsApi: ReturnType<typeof useReviews>;
}) {
  const review = reviewsApi.get(facility.id);
  const ratio = checks ? facility.good / checks : 0;
  const toneClass = ratio >= 0.85 ? "text-emerald-600" : ratio >= 0.5 ? "text-amber-600" : "text-rose-600";

  // Live note text, so a decision is saved with whatever's currently typed.
  const [notes, setNotes] = useState(review.notes);
  const [saving, setSaving] = useState<null | "approved" | "rejected">(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const decide = async (decision: "approved" | "rejected") => {
    reviewsApi.setStatus(facility.id, decision); // local history + UI
    setSaving(decision);
    setSaveError(null);
    try {
      await saveDecision(facility.id, decision, notes);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save decision");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{facility.name}</CardTitle>
        <CardDescription>
          {[facility.city, facility.state].filter(Boolean).join(", ") || "—"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-[80px_1fr] gap-y-1.5">
          <span className="text-xs font-medium uppercase text-muted-foreground">Address</span>
          <span>{[facility.address, facility.zipcode].filter(Boolean).join(" · ") || "—"}</span>
          <span className="text-xs font-medium uppercase text-muted-foreground">Phone</span>
          <span>{facility.phone || "—"}</span>
          <span className="text-xs font-medium uppercase text-muted-foreground">Email</span>
          <span className="truncate">{facility.email || "—"}</span>
          <span className="text-xs font-medium uppercase text-muted-foreground">Website</span>
          <span className="truncate">
            {facility.website ? (
              <a href={facility.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                {facility.website}
              </a>
            ) : (
              "—"
            )}
          </span>
          <span className="text-xs font-medium uppercase text-muted-foreground">Coords</span>
          <span>
            {facility.lat != null && facility.lng != null
              ? `${facility.lat.toFixed(4)}, ${facility.lng.toFixed(4)}`
              : "—"}
          </span>
          <span className="text-xs font-medium uppercase text-muted-foreground">Ref ID</span>
          <span className="truncate font-mono text-xs">{facility.id}</span>
        </div>

        <Separator />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase text-muted-foreground">Data quality</p>
            <span className={cn("text-xs font-medium", toneClass)}>
              {facility.good}/{checks} checks valid
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(facility.statuses).map(([k, ok]) => (
              <Badge
                key={k}
                variant="outline"
                className={cn(
                  "gap-1",
                  ok
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-rose-300 bg-rose-50 text-rose-800",
                )}
              >
                {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {STATUS_LABELS[k] ?? k}
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Your decision</p>
          <Textarea
            className="mb-3"
            value={notes}
            placeholder="Add a note…"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={(e) => reviewsApi.setNote(facility.id, e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={saving !== null}
              variant={review.status === "approved" ? "default" : "outline"}
              onClick={() => decide("approved")}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {saving === "approved" ? "Saving…" : "Looks good"}
            </Button>
            <Button
              size="sm"
              disabled={saving !== null}
              variant={review.status === "rejected" ? "destructive" : "outline"}
              onClick={() => decide("rejected")}
            >
              <XCircle className="mr-1 h-4 w-4" />
              {saving === "rejected" ? "Saving…" : "Reject"}
            </Button>
          </div>
          {saveError ? (
            <p className="mt-2 text-xs text-rose-600">{saveError}</p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Decisions are saved with the facility, date &amp; time, and your note.
            </p>
          )}
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
            History — every change made
          </p>
          {review.history.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No changes yet. Approving, rejecting, or adding a note will be logged here.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {[...review.history].reverse().map((h, i) => (
                <li key={i} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-foreground">
                    {h.action}
                    {h.detail ? <span className="text-muted-foreground"> — {h.detail}</span> : null}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {new Date(h.ts).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// -------------------- SHARED BITS --------------------
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  const safe = isNaN(value) ? 0 : value;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span>{label}</span>
        <span className="tabular-nums">{pct(safe)}</span>
      </div>
      <Progress value={safe * 100} className="mt-1 h-1.5" />
    </div>
  );
}

function PriorityBadge({ priority }: { priority: "High" | "Medium" | "Low" }) {
  const cls = priority === "High"
    ? "border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
    : priority === "Medium"
    ? "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
    : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200";
  return <Badge variant="outline" className={cls}>{priority}</Badge>;
}

function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  const map = {
    pending: { label: "Not reviewed", cls: "bg-muted text-muted-foreground" },
    approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" },
    rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200" },
  };
  const { label, cls } = map[status];
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{label}</span>;
}

function EvidenceBadge({ strength }: { strength: "Strong" | "Weak" | "Missing" }) {
  if (strength === "Strong")
    return <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200">Strong</Badge>;
  if (strength === "Weak")
    return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200">Weak</Badge>;
  return <Badge variant="outline">Missing</Badge>;
}

function HighlightedDescription({ facility }: { facility: ProcessedFacility }) {
  const text = facility.raw.description || "";
  if (!text) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm italic text-muted-foreground">
        No description provided in the source record.
      </div>
    );
  }
  const segments = highlightDescription(text, facility.capabilities);
  const anyHits = segments.some((s) => s.key);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Source description
        </p>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-400" /> Strong
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-amber-300" /> Weak
          </span>
        </div>
      </div>
      <p className="rounded-md border bg-card p-3 text-sm leading-relaxed">
        {segments.map((s, i) =>
          s.key ? (
            <mark
              key={i}
              title={`${s.key} · ${s.strength} (${(s.confidence ?? 0).toFixed(2)})`}
              className={cn(
                "rounded px-1 py-0.5 font-medium text-foreground",
                s.strength === "Strong"
                  ? "bg-emerald-200/80 dark:bg-emerald-900/50"
                  : "bg-amber-200/80 dark:bg-amber-900/40",
              )}
            >
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>
      {!anyHits && (
        <p className="mt-1 text-xs italic text-muted-foreground">
          No measurable evidence detected — mostly generic or marketing language.
        </p>
      )}
    </div>
  );
}

function CapabilityGroups({ facility }: { facility: ProcessedFacility }) {
  const present = facility.capabilities.filter((c) => c.strength !== "Missing");
  const strong = present.filter((c) => c.strength === "Strong").sort((a, b) => b.confidence - a.confidence);
  const weak = present.filter((c) => c.strength === "Weak").sort((a, b) => b.confidence - a.confidence);
  return (
    <div className="space-y-3">
      {strong.length > 0 && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-emerald-900 dark:text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" /> Strong evidence ({strong.length})
          </p>
          <div className="space-y-2">
            {strong.map((c) => <CapabilityRow key={c.key} cap={c} />)}
          </div>
        </div>
      )}
      {weak.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
          <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" /> Weak evidence ({weak.length}) — needs human verification
          </p>
          <div className="space-y-2">
            {weak.map((c) => <CapabilityRow key={c.key} cap={c} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function CapabilityRow({ cap }: { cap: { key: string; confidence: number; strength: "Strong" | "Weak" | "Missing"; quote: string | null } }) {
  return (
    <div className="rounded border bg-background/70 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{cap.key}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {(cap.confidence * 100).toFixed(0)}% confidence
        </span>
      </div>
      <Progress value={cap.confidence * 100} className="mt-1.5 h-1" />
      {cap.quote && (
        <div className="mt-1.5 flex gap-1.5 text-xs italic text-muted-foreground">
          <Quote className="h-3 w-3 shrink-0 translate-y-0.5" />
          <span>"{cap.quote}"</span>
        </div>
      )}
    </div>
  );
}

function ContradictionsPanel({ facility }: { facility: ProcessedFacility }) {
  const items = facility.scores.contradictions;
  // Parse contradiction strings into structured rows when possible
  const parsed = items.map((msg) => {
    const structured = msg.match(/"([^"]+)"/)?.[1] ?? null;
    const kind = msg.startsWith("Capability") ? "weak-capability" : "missing-evidence";
    return { msg, structured, kind };
  });
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-900/60 dark:bg-rose-950/20">
      <p className="mb-2 flex items-center gap-1 text-sm font-medium text-rose-900 dark:text-rose-200">
        <ShieldAlert className="h-4 w-4" /> Contradictions ({items.length})
      </p>
      <ul className="space-y-2">
        {parsed.map((p, i) => (
          <li
            key={i}
            className="grid grid-cols-1 gap-2 rounded border border-rose-200/70 bg-background/70 p-2 text-sm sm:grid-cols-[auto_1fr]"
          >
            <div className="flex items-start gap-2">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              {p.structured ? (
                <Badge variant="outline" className="border-rose-300 bg-rose-100/60 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  {p.structured}
                </Badge>
              ) : (
                <span className="text-rose-900 dark:text-rose-200">Conflict</span>
              )}
            </div>
            <p className="text-rose-900/90 dark:text-rose-100/90">
              {p.kind === "missing-evidence"
                ? "Listed in structured data but no supporting mention in the description."
                : "Claimed as a capability but the description only weakly supports it."}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-rose-800/80 dark:text-rose-200/70">
        Tip: confirm with the source URL or reject the field via the override controls below.
      </p>
    </div>
  );
}

function SimpleMap({
  processed,
  compact,
  highlightIds,
  onMarkerClick,
}: {
  processed: ProcessedFacility[];
  compact?: boolean;
  highlightIds?: Set<string>;
  onMarkerClick?: (id: string) => void;
}) {
  // India bounding box
  const minLat = 6, maxLat = 36, minLng = 67, maxLng = 98;
  const h = compact ? 180 : 420;
  return (
    <div className="relative w-full overflow-hidden rounded-md border bg-[hsl(210_40%_96%)] dark:bg-slate-900" style={{ height: h }}>
      {/* simple lat/lng grid */}
      <div className="absolute inset-0" style={{
        backgroundImage:
          "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
        backgroundSize: "10% 10%",
        opacity: 0.4,
      }} />
      {processed.map((p) => {
        if (p.raw.latitude == null || p.raw.longitude == null) return null;
        const x = ((p.raw.longitude - minLng) / (maxLng - minLng)) * 100;
        const y = (1 - (p.raw.latitude - minLat) / (maxLat - minLat)) * 100;
        const q = p.scores.qualityScore;
        const color = q >= 75 ? "bg-emerald-500" : q >= 55 ? "bg-amber-500" : "bg-rose-500";
        const highlighted = highlightIds?.has(p.raw.id);
        return (
          <button
            key={p.raw.id}
            title={`${p.raw.name} · Q${q}`}
            onClick={() => onMarkerClick?.(p.raw.id)}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white shadow transition-transform hover:scale-150",
              color,
              highlighted ? "h-4 w-4 ring-blue-500" : "h-3 w-3",
            )}
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        );
      })}
      <div className="absolute bottom-2 right-2 flex gap-3 rounded-md bg-background/90 px-2 py-1 text-xs">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Trustworthy</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Mixed</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Questionable</span>
      </div>
    </div>
  );
}

// -------------------- helpers --------------------
const pct = (v: number) => `${Math.round((isNaN(v) ? 0 : v) * 100)}%`;
const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const unique = <T,>(xs: T[]) => Array.from(new Set(xs));
const tone = (v: number, [good, ok]: [number, number]): "good" | "warn" | "bad" =>
  v >= good ? "good" : v >= ok ? "warn" : "bad";
const qualityBar = (q: number) =>
  q >= 75 ? "bg-emerald-500" : q >= 55 ? "bg-amber-500" : "bg-rose-500";

const FLAG_LABEL: Record<string, string> = {
  "Missing postcode": "Missing postcode",
  "Geo mismatch": "Address doesn't match the state",
  "Low completeness": "Many fields are blank",
  "Contradictions": "Listed services aren't in the description",
  "Duplicate risk": "Looks like a duplicate",
  "Low evidence": "Description is too vague to verify",
};

// unused but ensures Gauge icon import remains if tree-shaken
void Gauge;

export default App;
