export default function ClaudeIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M16.1 3.3 12.5 14l-1.7-4.7L16.1 3.3Zm-8.2 0 5.6 14.4L15.2 21l-2-5.3L7.9 3.3ZM4.8 8.5l4.7 12.2h2.1L6.9 8.5H4.8Zm12.1 0h2.1l-2.6 6.8-1-2.7 1.5-4.1Z"
        fill="currentColor"
      />
    </svg>
  );
}
