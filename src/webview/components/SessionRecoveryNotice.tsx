export function SessionRecoveryNotice({ notice }: { notice: string | null }) {
  if (notice === null) {
    return null
  }

  return (
    <p
      class="mt-4 rounded-lg border border-line-strong bg-raised px-3 py-2.5 text-ink"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span class="font-semibold">Folder name changed.</span> {notice}
    </p>
  )
}
