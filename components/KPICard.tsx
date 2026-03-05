interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  valueClassName?: string;
  badge?: { label: string; className: string };
}

export default function KPICard({
  title,
  value,
  subtitle,
  valueClassName = "text-slate-100",
  badge,
}: KPICardProps) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">
          {title}
        </p>
        {badge && (
          <span className={`badge ${badge.className}`}>{badge.label}</span>
        )}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${valueClassName}`}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}
