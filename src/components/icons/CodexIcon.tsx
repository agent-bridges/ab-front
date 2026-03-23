export default function CodexIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2Zm-.5 3.25c.59-.34 1.31-.34 1.9 0l3.46 2a1.75 1.75 0 0 1 .89 1.52v.46l-3 1.73V9.5a.75.75 0 0 0-.38-.65L12 7.42l-2.37 1.37a.75.75 0 0 0-.38.65v2.74l-3-1.73v-.67c0-.63.34-1.21.89-1.52l4.36-2.51Zm-5.25 5.5 3 1.73v1.04a.75.75 0 0 0 .38.65L12 15.58l2.37-1.37a.75.75 0 0 0 .38-.65v-1.04l3-1.73v3.43c0 .63-.34 1.21-.89 1.52l-4.36 2.51c-.59.34-1.31.34-1.9 0l-3.46-2a1.75 1.75 0 0 1-.89-1.52v-4Z" />
    </svg>
  );
}
