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
import { fetchOverview, type Overview } from "@/lib/api";
import { useFacilityOptions } from "@/lib/facility-options";
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


type View = "dashboard" | "queue" | "review" | "audit";

interface QueueFilter {
  flag?: string;
  specialty?: string;
  state?: string;
  search?: string;
}

const NAV: Array<{ id: View; label: string; icon: typeof LayoutDashboard; hint: string }> = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard, hint: "How healthy is the data overall?" },
  { id: "queue", label: "What to review", icon: ClipboardList, hint: "Records that need a human check" },
  { id: "review", label: "Check a facility", icon: ShieldCheck, hint: "See evidence and approve or reject" },
  { id: "audit", label: "History", icon: History, hint: "Everything that has been changed" },
];

function App() {
  const processed = useMemo(() => processAll(RAW_FACILITIES), []);
  const [view, setView] = useState<View>("dashboard");
  const [selectedId, setSelectedId] = useState<string>(processed[0]?.raw.id ?? "");
  const [filter, setFilter] = useState<QueueFilter>({});
  const reviewsApi = useReviews();

  const selected = processed.find((p) => p.raw.id === selectedId) ?? processed[0];

  const openFacility = (id: string) => {
    setSelectedId(id);
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
              Healthcare Data Quality Studio
            </h1>
            <p className="text-xs text-muted-foreground">
              Check this list of {processed.length} hospitals and clinics in India before using it for planning.
            </p>
          </div>
          <Badge variant="outline" className="gap-1">
            <Database className="h-3 w-3" /> Demo dataset
          </Badge>
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
          {view === "queue" && (
            <Queue
              processed={processed}
              filter={filter}
              setFilter={setFilter}
              reviews={reviewsApi.reviews}
              onOpen={openFacility}
            />
          )}
          {view === "review" && selected && (
            <FacilityReview
              facility={selected}
              processed={processed}
              reviewsApi={reviewsApi}
              onPick={setSelectedId}
            />
          )}
          {view === "audit" && selected && (
            <AuditView facility={selected} review={reviewsApi.get(selected.raw.id)} />
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

// -------------------- QUEUE --------------------
function Queue({
  processed,
  filter,
  setFilter,
  reviews,
  onOpen,
}: {
  processed: ProcessedFacility[];
  filter: QueueFilter;
  setFilter: (f: QueueFilter) => void;
  reviews: Record<string, { status: string }>;
  onOpen: (id: string) => void;
}) {
  // State options come from the warehouse table, shared across screens.
  const { states } = useFacilityOptions();
  const specialties = unique(processed.flatMap((p) => p.raw.specialties));

  const filtered = processed
    .filter((p) => !filter.state || p.raw.state === filter.state)
    .filter((p) => !filter.flag || p.scores.flags.includes(filter.flag))
    .filter((p) => !filter.specialty || p.raw.specialties.includes(filter.specialty))
    .filter(
      (p) =>
        !filter.search ||
        p.raw.name.toLowerCase().includes(filter.search.toLowerCase()) ||
        p.raw.city.toLowerCase().includes(filter.search.toLowerCase()),
    )
    .sort((a, b) => b.scores.priorityScore - a.scores.priorityScore);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">What to review</h2>
        <p className="text-sm text-muted-foreground">
          The records most likely to have problems are at the top. Showing {filtered.length} of {processed.length}.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter.search ?? ""}
              onChange={(e) => setFilter({ ...filter, search: e.target.value })}
              placeholder="Search by name or city"
              className="pl-9"
            />
          </div>
          <Select
            value={filter.state ?? "_all"}
            onValueChange={(v) => setFilter({ ...filter, state: v === "_all" ? undefined : v })}
          >
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All states</SelectItem>
              {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={filter.specialty ?? "_all"}
            onValueChange={(v) => setFilter({ ...filter, specialty: v === "_all" ? undefined : v })}
          >
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Specialty" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All specialties</SelectItem>
              {specialties.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={filter.flag ?? "_all"}
            onValueChange={(v) => setFilter({ ...filter, flag: v === "_all" ? undefined : v })}
          >
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="What's wrong?" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Any issue</SelectItem>
              {Object.entries(FLAG_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(filter.state || filter.specialty || filter.flag || filter.search) && (
            <Button variant="ghost" size="sm" onClick={() => setFilter({})}>
              <Filter className="mr-1 h-3 w-3" /> Clear
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Facility</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Trust score</th>
                  <th className="px-4 py-3">What's wrong</th>
                  <th className="px-4 py-3">Check when</th>
                  <th className="px-4 py-3">Your decision</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const status = reviews[p.raw.id]?.status ?? "pending";
                  return (
                    <tr key={p.raw.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.raw.name}</div>
                        <div className="text-xs text-muted-foreground">{p.raw.city} · {p.raw.id}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.raw.state}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn("h-full", qualityBar(p.scores.qualityScore))}
                              style={{ width: `${p.scores.qualityScore}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums">{p.scores.qualityScore}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {p.scores.flags.slice(0, 3).map((f) => (
                            <Badge key={f} variant="outline" className="gap-1 text-xs">
                              <AlertTriangle className="h-3 w-3" /> {FLAG_LABEL[f] ?? f}
                            </Badge>
                          ))}
                          {p.scores.flags.length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge priority={p.scores.priority} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status as "pending" | "approved" | "rejected"} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => onOpen(p.raw.id)}>
                          Review
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">No facilities match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------- FACILITY REVIEW --------------------
function FacilityReview({
  facility,
  processed,
  reviewsApi,
  onPick,
}: {
  facility: ProcessedFacility;
  processed: ProcessedFacility[];
  reviewsApi: ReturnType<typeof useReviews>;
  onPick: (id: string) => void;
}) {
  const review = reviewsApi.get(facility.raw.id);
  const f = facility.raw;
  // Facility picker options come from the warehouse table, shared across screens.
  const { facilities: facilityOptions } = useFacilityOptions();
  const sorted = [...processed].sort((a, b) => b.scores.priorityScore - a.scores.priorityScore);
  const idx = sorted.findIndex((p) => p.raw.id === facility.raw.id);
  const next = sorted[(idx + 1) % sorted.length];
  const prev = sorted[(idx - 1 + sorted.length) % sorted.length];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{f.name}</h2>
          <p className="text-sm text-muted-foreground">
            {f.city}, {f.state} · {f.id} · Quality {facility.scores.qualityScore}/100
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onPick(prev.raw.id)}>← Prev</Button>
          <Select value="" onValueChange={onPick}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Jump to a facility…" /></SelectTrigger>
            <SelectContent>
              {facilityOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{p.state ? ` · ${p.state}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => onPick(next.raw.id)}>Next →</Button>
        </div>
      </div>

      {facility.scores.flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {facility.scores.flags.map((flag) => (
            <Badge key={flag} variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="h-3 w-3" /> {FLAG_LABEL[flag] ?? flag}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LEFT */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What the record says</CardTitle>
            <CardDescription>The information already on file for this facility</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <DetailRow label="Address">
              {f.city}, {f.state}
              <div className="text-xs text-muted-foreground">Postcode: {f.postcode ?? <span className="text-rose-600">missing</span>}</div>
            </DetailRow>
            <DetailRow label="Coordinates">
              {f.latitude != null ? `${f.latitude.toFixed(4)}, ${f.longitude?.toFixed(4)}` : <span className="text-rose-600">missing</span>}
            </DetailRow>
            <DetailRow label="Specialties">
              <div className="flex flex-wrap gap-1">
                {unique(f.specialties).map((s) => (
                  <Badge key={s} variant="secondary">{s}</Badge>
                ))}
                {f.specialties.length === 0 && <span className="text-muted-foreground">none</span>}
              </div>
            </DetailRow>
            <DetailRow label="Source">
              {f.source_urls.length > 0 ? (
                f.source_urls.map((u) => (
                  <a key={u} href={u} className="block truncate text-xs text-blue-600 hover:underline" target="_blank" rel="noreferrer">{u}</a>
                ))
              ) : (
                <span className="text-muted-foreground">none</span>
              )}
            </DetailRow>
            <Separator />
            <div>
              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Where it is on the map</p>
              <SimpleMap processed={[facility]} compact />
            </div>
            <div className="space-y-2 rounded-md border bg-muted/40 p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Why we trust (or don't trust) this record</p>
              <BreakdownRow label="How much is filled in" value={facility.scores.completeness} />
              <BreakdownRow label="Address matches the state" value={facility.scores.geoConsistency} />
              <BreakdownRow label="Services backed by description" value={
                avg(facility.capabilities.filter(c => c.strength !== "Missing").map(c => c.confidence))
              } />
              {facility.geoIssues.map((g) => (
                <p key={g} className="text-xs text-amber-700">⚠ {g}</p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What the description actually says</CardTitle>
            <CardDescription>Words that prove (or fail to prove) the listed services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <HighlightedDescription facility={facility} />

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Services we found in the description
              </p>
              {facility.capabilities.filter((c) => c.strength !== "Missing").length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  The description is too short or vague to confirm any specific service.
                </p>
              ) : (
                <CapabilityGroups facility={facility} />
              )}
            </div>

            {facility.scores.contradictions.length > 0 && (
              <ContradictionsPanel facility={facility} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your decision</CardTitle>
          <CardDescription>Saved automatically, with a full history you can review later.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => reviewsApi.setStatus(f.id, "approved")}
              className={cn(review.status === "approved" && "ring-2 ring-emerald-500")}
              variant={review.status === "approved" ? "default" : "outline"}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" /> Looks good
            </Button>
            <Button
              onClick={() => reviewsApi.setStatus(f.id, "rejected")}
              variant={review.status === "rejected" ? "destructive" : "outline"}
            >
              <XCircle className="mr-1 h-4 w-4" /> Don't use this record
            </Button>
            <Button variant="outline" onClick={() => reviewsApi.setStatus(f.id, "pending")}>
              I'll decide later
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase text-muted-foreground">Fix the name</label>
              <Input
                defaultValue={review.overrides.name ?? f.name}
                onBlur={(e) => e.target.value !== f.name && reviewsApi.setOverride(f.id, "name", e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">Only edit if the original is wrong or misspelled.</p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase text-muted-foreground">Fix the postcode</label>
              <Input
                defaultValue={review.overrides.postcode ?? f.postcode ?? ""}
                placeholder="e.g. 400001"
                onBlur={(e) => reviewsApi.setOverride(f.id, "postcode", e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">6 digits. Check it on the envelope or the facility website.</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground">Your notes (optional)</label>
            <Textarea
              defaultValue={review.notes}
              placeholder="Add a short note explaining your decision — e.g. 'Confirmed on hospital website'"
              onBlur={(e) => reviewsApi.setNote(f.id, e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------- AUDIT --------------------
function AuditView({ facility, review }: { facility: ProcessedFacility; review: ReturnType<typeof useReviews>["reviews"][string] }) {
  const r = facility.raw;
  const s = facility.scores;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">History for this facility</h2>
        <p className="text-sm text-muted-foreground">Everything we know about {r.name} and every change made to it.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What's on file</CardTitle>
            <CardDescription>The original information from the source</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ReadableRow label="Name" value={r.name} />
            <ReadableRow label="Location" value={`${r.city}, ${r.state}`} />
            <ReadableRow label="Postcode" value={r.postcode ?? "—"} />
            <ReadableRow label="Map coordinates" value={r.latitude != null ? `${r.latitude.toFixed(3)}, ${r.longitude?.toFixed(3)}` : "—"} />
            <ReadableRow label="Listed services" value={unique(r.specialties).join(", ") || "—"} />
            <ReadableRow label="Source link" value={r.source_urls[0] ?? "—"} />
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Description</p>
              <p className="mt-1 rounded border bg-muted/30 p-2 text-sm leading-relaxed">{r.description || "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What we found</CardTitle>
            <CardDescription>A plain-English summary of issues and evidence</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Trust score: <b>{s.qualityScore}/100</b> ·{" "}
              <PriorityBadge priority={s.priority} />
            </p>
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Issues</p>
              {s.flags.length === 0 ? (
                <p className="text-muted-foreground">No issues found.</p>
              ) : (
                <ul className="list-disc space-y-0.5 pl-5">
                  {s.flags.map((f) => <li key={f}>{FLAG_LABEL[f] ?? f}</li>)}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Services backed by the description</p>
              {facility.capabilities.filter((c) => c.strength !== "Missing").length === 0 ? (
                <p className="text-muted-foreground">None.</p>
              ) : (
                <ul className="list-disc space-y-0.5 pl-5">
                  {facility.capabilities
                    .filter((c) => c.strength !== "Missing")
                    .map((c) => (
                      <li key={c.key}>
                        <b>{c.key}</b> — {c.strength === "Strong" ? "strong evidence" : "weak evidence"}
                      </li>
                    ))}
                </ul>
              )}
            </div>
            {facility.geoIssues.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Location problems</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {facility.geoIssues.map((g) => <li key={g}>{g}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your changes</CardTitle>
          <CardDescription>Current decision: <StatusBadge status={(review?.status ?? "pending") as never} /></CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {review?.notes && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="text-xs font-medium uppercase text-muted-foreground">Your note</p>
              <p>{review.notes}</p>
            </div>
          )}
          {Object.keys(review?.overrides ?? {}).length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="text-xs font-medium uppercase text-muted-foreground">Fields you corrected</p>
              <ul className="text-sm">
                {Object.entries(review!.overrides).map(([k, v]) => <li key={k}><b>{k}:</b> {v}</li>)}
              </ul>
            </div>
          )}
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">What happened, and when</p>
            {(review?.history ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No changes yet for this record.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {[...(review?.history ?? [])].reverse().map((h, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span>{h.action}{h.detail ? ` — ${h.detail}` : ""}</span>
                    <span className="text-xs text-muted-foreground">{new Date(h.ts).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReadableRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <span className="text-xs font-medium uppercase text-muted-foreground">{label}</span>
      <span className="break-words">{value}</span>
    </div>
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
