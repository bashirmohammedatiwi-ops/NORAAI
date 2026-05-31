import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      <Card>
        <CardHeader><CardTitle>System Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex justify-between p-3 rounded border border-border">
            <span>Quality Score Threshold</span>
            <span className="text-muted-foreground">40</span>
          </div>
          <div className="flex justify-between p-3 rounded border border-border">
            <span>Active Learning Confidence Threshold</span>
            <span className="text-muted-foreground">70%</span>
          </div>
          <div className="flex justify-between p-3 rounded border border-border">
            <span>Prometheus</span>
            <span className="text-green-400">Enabled</span>
          </div>
          <div className="flex justify-between p-3 rounded border border-border">
            <span>Grafana Dashboard</span>
            <span className="text-muted-foreground text-xs">Port 6004 (VPS)</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
