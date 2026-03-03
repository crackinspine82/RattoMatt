type Props = { title: string; recommendation: string };

export default function Placeholder({ title, recommendation }: Props) {
  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 24 }}>{title}</h1>
      <p style={{ color: 'var(--text-muted)', maxWidth: 560 }}>
        {recommendation}
      </p>
    </div>
  );
}
