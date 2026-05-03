// Top-level React ErrorBoundary.
//
// Catches render errors in any descendant (lazy chunks, hook failures, third-
// party components). Replaces the previous "white screen of death" with a
// Hearth-styled fallback offering "Try again" + "Report this" — the report
// auto-includes the error message + stack so the admin dashboard sees what
// happened without the user typing it.
//
// Mounted at the top of App.tsx wrapping <Routes>. ErrorBoundary itself is a
// class component (React's only error catch mechanism); the Report dialog
// state lives in a small functional sub-component.

import { Component, useState, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react'
import { BugReportDialog } from '@/components/BugReportDialog'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'
import { createBugReport } from '@/services/bugReports'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  errorInfo: ErrorInfo | null
  /** True after we have auto-filed the crash report (one-shot per crash). */
  reported: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null, reported: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    // Auto-file a crash report. Best-effort — never throw from the
    // ErrorBoundary itself.
    if (!this.state.reported) {
      const summary = [
        `[crash] ${error.name}: ${error.message}`,
        '',
        `URL: ${typeof window !== 'undefined' ? window.location.href : 'n/a'}`,
        '',
        'Stack:',
        (error.stack ?? '').slice(0, 2000),
        '',
        'Component stack:',
        (errorInfo.componentStack ?? '').slice(0, 1500),
      ].join('\n')
      createBugReport({ message: summary, severity: 'crash' })
        .then(() => this.setState({ reported: true }))
        .catch(() => {
          // Swallow — surfacing a second error in the boundary would loop.
          console.error('[ErrorBoundary] auto-report failed', error)
        })
    }
    console.error('[ErrorBoundary] caught', error, errorInfo)
  }

  reset = () => {
    this.setState({ error: null, errorInfo: null, reported: false })
  }

  render() {
    if (this.state.error) {
      return <Fallback error={this.state.error} reported={this.state.reported} onReset={this.reset} />
    }
    return this.props.children
  }
}

function Fallback({
  error,
  reported,
  onReset,
}: {
  error: Error
  reported: boolean
  onReset: () => void
}) {
  const { t } = useI18n()
  const [reportOpen, setReportOpen] = useState(false)

  const prefill = `[Optional: tell me what you were doing when this happened]\n\nError: ${error.name}: ${error.message}`

  return (
    <div className="min-h-screen bg-rp-bg text-rp-ink flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-rp-brand/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-rp-brand" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="font-display italic text-2xl text-rp-ink">
            {t('error.boundary.title')}
          </h1>
          <p className="text-sm text-rp-ink-mute">
            {t('error.boundary.body')}
          </p>
          {reported && (
            <p className="text-xs text-rp-ink-mute italic">
              {t('error.boundary.autoReported')}
            </p>
          )}
        </div>

        <details className="text-left bg-rp-bg-soft rounded-lg p-3 text-xs">
          <summary className="cursor-pointer text-rp-ink-mute font-medium">
            {t('error.boundary.details')}
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-rp-ink-mute font-mono text-[11px]">
            {error.name}: {error.message}
          </pre>
        </details>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button onClick={onReset}>
            <RefreshCw className="h-4 w-4 me-2" />
            {t('error.boundary.tryAgain')}
          </Button>
          <Button variant="secondary" onClick={() => setReportOpen(true)}>
            <Bug className="h-4 w-4 me-2" />
            {t('error.boundary.addContext')}
          </Button>
        </div>

        <BugReportDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          initialMessage={prefill}
          initialSeverity="crash"
        />
      </div>
    </div>
  )
}
