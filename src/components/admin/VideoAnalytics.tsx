import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Play, BarChart3 } from "lucide-react";

type EventType = "play" | "progress_25" | "progress_50" | "progress_75" | "complete";

const VIDEOS: { key: string; label: string }[] = [
  { key: "demo", label: "Demo GEO Engine (page d'accueil)" },
  { key: "ugc_desktop", label: "UGC desktop (founders)" },
  { key: "ugc_mobile", label: "UGC mobile reel" },
];

const EVENT_LABELS: Record<EventType, string> = {
  play: "Lectures",
  progress_25: "25 %",
  progress_50: "50 %",
  progress_75: "75 %",
  complete: "Terminées",
};

type Row = { video_key: string; event_type: EventType };

export function VideoAnalytics() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [totalSessions, setTotalSessions] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("homepage_video_events")
        .select("video_key, event_type, session_id")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) {
        console.error("video events fetch", error);
        setRows([]);
        return;
      }
      setRows((data ?? []) as any);
      const unique = new Set((data ?? []).map((r: any) => r.session_id));
      setTotalSessions(unique.size);
    })();
  }, []);

  if (rows === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const countFor = (videoKey: string, eventType: EventType) =>
    rows.filter((r) => r.video_key === videoKey && r.event_type === eventType).length;

  const completionRate = (videoKey: string) => {
    const plays = countFor(videoKey, "play");
    const completes = countFor(videoKey, "complete");
    return plays > 0 ? Math.round((completes / plays) * 100) : 0;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Play className="h-6 w-6" />
          Vues des vidéos — page d'accueil
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi du nombre de lectures, des paliers (25 / 50 / 75 %) et des vues terminées pour chaque vidéo
          de la landing page. Une session ne compte qu'une fois par événement.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium">Sessions vidéo uniques</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalSessions}</div>
          </CardContent>
        </Card>
        {VIDEOS.map((v) => (
          <Card key={v.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-medium">{v.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{countFor(v.key, "play")}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Taux de complétion : <span className="font-semibold">{completionRate(v.key)} %</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4" />
            Détail par vidéo
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-semibold">Vidéo</th>
                {(Object.keys(EVENT_LABELS) as EventType[]).map((e) => (
                  <th key={e} className="py-2 px-3 text-right font-semibold">
                    {EVENT_LABELS[e]}
                  </th>
                ))}
                <th className="py-2 pl-3 text-right font-semibold">Complétion</th>
              </tr>
            </thead>
            <tbody>
              {VIDEOS.map((v) => (
                <tr key={v.key} className="border-b last:border-0">
                  <td className="py-3 pr-4">{v.label}</td>
                  {(Object.keys(EVENT_LABELS) as EventType[]).map((e) => (
                    <td key={e} className="py-3 px-3 text-right tabular-nums">
                      {countFor(v.key, e)}
                    </td>
                  ))}
                  <td className="py-3 pl-3 text-right font-semibold tabular-nums">
                    {completionRate(v.key)} %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
