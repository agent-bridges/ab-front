interface Props {
  relayError: string | null;
  capabilitiesError: string | null;
  onRetry: () => void;
}

export default function DiscoveryErrorBanner({ relayError, capabilitiesError, onRetry }: Props) {
  const errors = [relayError, capabilitiesError].filter(Boolean);
  if (errors.length === 0) return null;
  return (
    <div role="alert" className="flex shrink-0 items-center gap-3 border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
      <span className="min-w-0 flex-1 truncate" title={errors.join(' · ')}>Discovery unavailable: {errors.join(' · ')}</span>
      <button onClick={onRetry} className="shrink-0 rounded border border-red-400/40 px-2 py-1 hover:bg-red-500/20">Retry</button>
    </div>
  );
}
