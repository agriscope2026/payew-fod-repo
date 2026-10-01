import { ErrorState } from '@/components/common/ErrorState'
import { Card } from '@/components/ui/card'

export function ReportError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <ErrorState onRetry={onRetry} />
    </Card>
  )
}
