import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface MetricPoint {
  epoch?: number;
  loss?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  map50?: number;
  map50_95?: number;
  [key: string]: unknown;
}

interface Props {
  data: MetricPoint[];
  title: string;
  lines: { key: string; color: string; label: string }[];
  height?: number;
}

export function MetricChart({ data, title, lines, height = 220 }: Props) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm border border-dashed border-border rounded-lg">
        No metrics yet
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-medium mb-2 text-muted-foreground">{title}</h4>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="epoch" stroke="#94a3b8" fontSize={11} />
          <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 'auto']} />
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
          <Legend />
          {lines.map(({ key, color, label }) => (
            <Line key={key} type="monotone" dataKey={key} stroke={color} name={label} dot={false} strokeWidth={2} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
